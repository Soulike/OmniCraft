# Extract Self-Contained Stream Library Design

**Date:** 2026-06-21
**Status:** Approved (design phase)

## Goal

Make `StreamingMessageDisplay` a **fully business-agnostic** stream library: feed it an
`eventBus`, get back a self-rendering streaming chat stream. A second, differently-built
chat logic layer (different session-creation flow, different agent SDK behind the backend)
should be able to reuse the entire SSE→render pipeline — including the hardest parts (tool
cards, nested subagent recursion) — **without rewriting a single view**.

## Background & Motivation

The user anticipates two future needs:

1. A Coding Agent with a **completely different layout and session-creation flow**.
2. A backend built on a **different agent SDK**, potentially introducing more SSE events
   and components.

Investigation established the key architectural facts:

- **Layout reuse is already solved.** The reuse boundary is at the component level, not the
  page level. `ChatPageView` / `CodingPageView` are each page's own layout; their current
  near-identical structure is incidental, not a constraint. Any new layout can compose the
  exported components freely.
- **The SSE contract (`@omnicraft/sse-events`) is the neutral middle layer.** The backend
  translates each SDK's native protocol into this contract (Claude and OpenAI are both
  already adapted this way). The frontend never knows which SDK is behind a session. So view
  components binding to `Sse*` types bind to a stable contract, not to any one SDK. **No
  separate view-model (VM) layer is needed** — that would be a redundant second translation.
- **The event-bus is SSE's downstream and equally neutral.** `routeBaseEventToBus` feeds SSE
  events into the bus; a second SDK still emits SSE, still flows into the same bus. So
  "pass an eventBus" is an SDK-agnostic entry point.

This makes the cleanest possible boundary self-evident:

> **Feed an `eventBus` → get a self-rendering streaming chat stream.**

This boundary already exists in reality: `StreamingMessageDisplay`'s current props are
`{eventBus, sessionId, onMessagesChange}`, and the subagent card already recurses with
`<StreamingMessageDisplay eventBus={subBus} sessionId={null} />`. We are formalizing an
existing boundary into a library boundary, not inventing one.

This is the **first cut** of a larger layering effort, chosen because the stream components
have the highest reuse value (the message cards are the soul of Chat) and the clearest
boundary.

## Scope

**In scope:** Turn the `StreamingMessageDisplay` subtree into a self-contained, business-agnostic
stream module under `apps/frontend/src/modules/`. Sever its one business coupling (the
`ask_user` submit path) and remove the `sessionId` concept from its public contract.

**Out of scope:**

- Splitting the page-level layout skeleton (the PageView duplication) — that is incidental
  and not a defect.
- A view-model translation layer — explicitly rejected; the SSE contract already plays that role.
- A registry-based event pipeline (open extension for new event types) — deferred until a
  genuine second SDK consumer exists; abstracting now risks abstracting wrong.
- Moving anything into `packages/` — the consumer stays inside the same frontend app.

## Architecture

### Placement

A standalone module under `apps/frontend/src/modules/` (domain-specific, cross-page reusable —
matches the frontend's definition of a module). Existing `@/` alias dependencies
(`MarkdownRenderer`, `StatusTimeline`, hooks, helpers, theme, icons) stay as-is; they are not
pulled into the module.

### Public Contract

The stream module's entry component accepts:

```ts
interface StreamingMessageDisplayProps {
  /** The only required input: SSE-downstream neutral bus. */
  eventBus: ChatEventBus;

  /**
   * Optional capability switch for ask_user submission.
   * Present  → running ask_user cards are interactive; submit calls this.
   * Absent   → running ask_user cards render disabled with a notice
   *            ("This session does not support form submission");
   *            done/failure/error cards still replay read-only.
   */
  onAskUserSubmit?: (callId: string, result: AskUserBridgeResponse) => void;

  /** Optional output: reports the aggregated message list outward (e.g. for counting). */
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}
```

### Exported contract types

`ChatEventBus`, `ChatEventMap`, `ChatMessage`, `MessageContent`, `AskUserBridgeResponse`
(the last from `@omnicraft/tool-schemas`).

### What stays in the logic layer (not in the module)

`useStreamChat`, `route-base-event-to-bus`, `subagent-event-bus`, `ChatSessionApi` and its
context, session management, and the full provider stack.

## Key Design Decisions

### 1. `sessionId` is removed from the contract

`sessionId`'s only use in the entire stream subtree is as the first argument to
`submitToolResponse(sessionId, callId, result)` inside `AskUserCard` → `useSubmitActions`. It
has zero rendering or aggregation role. Proof: the subagent card recurses with
`sessionId={null}` because subagent streams accept no user submission.

Once submission becomes an injected callback, `sessionId` has no reason to exist in the
library. It is a business-layer concept and is **closed over by the logic layer inside the
callback**:

```tsx
onAskUserSubmit={(callId, result) => submitToolResponse(sessionId, callId, result)}
```

`SessionIdContext` is deleted entirely.

### 2. `ask_user` submission becomes an injected callback

The only file in the whole stream subtree that touches the session API is
`useSubmitActions.ts` (`useChatSessionApi()`). We invert this: instead of reaching into
`ChatSessionApiContext`, the submit/cancel actions call the injected `onAskUserSubmit`.

Rejected alternative: making the library depend on the `ChatSessionApi` interface. That
interface carries `listSessions`/`deleteSession`/`createSession` — 90% irrelevant to the
stream. A focused callback expresses the true semantic ("respond to one interaction in this
stream") with minimal dependency.

### 3. `callId` semantics

`callId` is the tool-call identifier, originating in the SSE contract
(`SseToolExecuteStartEvent.callId`, `packages/sse-events/src/schema.ts:19`). It routes the
user's answer back to the correct pending tool call (a turn may have multiple concurrent
`ask_user` calls). At the API layer it is the `interactionId`. It is a pure in-stream
contract value — no session/business concept — so it belongs to the library and flows out
through the callback unchanged.

### 4. `result` is precisely typed, not `unknown`

The API layer degrades `result` to `unknown` to handle all tools generically. The stream
library, being the dedicated `ask_user` renderer, uses the exact
`AskUserBridgeResponse` (`packages/tool-schemas/src/parameter-schemas.ts:215`):

```
{ cancelled: false, answers: AnswerEntry[] } | { cancelled: true }
```

This is stronger than the API layer's `unknown` and does not break layering, since
`tool-schemas` is a contract package, not business logic.

### 5. `onAskUserSubmit` absent → disable, don't hide (Decision A)

The callback is a **capability switch** that governs only whether a _new_ submission can be
made, never whether history can be replayed:

- `running` card, callback present → interactive form, submit via callback.
- `running` card, callback absent → form **disabled with a notice** ("This session does not
  support form submission").
- `done` / `failure` / `error` cards → always replay read-only, regardless of the callback.

Stream completeness (rendering everything that happened) is never broken. Rejected
alternative B (hide the whole `ask_user` type when no callback) loses interaction history
when replaying an old session.

### 6. `onMessagesChange` retained as optional output

The aggregated message list is the stream's most valuable by-product (already computed
internally). Exposing it is a pure _output_ direction that injects no business concept into
the library, and sealing it would force downstream consumers (e.g. `useMessageCount` for
empty-state / new-session-button logic) to recompute what the library already has.

## Coupling Map (current → target)

| Component                          | Current coupling                                           | Target                                                                         |
| ---------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `StreamingMessageDisplay`          | `sessionId` prop + `SessionIdContext`                      | removed; entry is `{eventBus, onAskUserSubmit?, onMessagesChange?}`            |
| `AskUserCard` / `useSubmitActions` | `useChatSessionApi()` + `sessionId`                        | calls injected `onAskUserSubmit(callId, result)`; disabled state when absent   |
| `RenderItem` (ask_user branch)     | reads `SessionIdContext`                                   | reads `onAskUserSubmit` availability from a stream-local context/prop          |
| `ToolExecutionCard`                | `useToolOutput(ToolOutputContext)`                         | unchanged — `ToolOutputContext` is stream-internal and ships _with_ the module |
| `SubagentDisclosure`               | recurses `StreamingMessageDisplay` with `sessionId={null}` | recurses with no `sessionId`; subagent streams pass no `onAskUserSubmit`       |

## Data Flow (target)

```
logic layer (per chat implementation)
  ├─ produces an eventBus (SSE → routeBaseEventToBus → bus)   [stays outside]
  ├─ closes sessionId into onAskUserSubmit                    [stays outside]
  │
  └─ <StreamingMessageDisplay
        eventBus={bus}
        onAskUserSubmit={(callId, result) =>
          submitToolResponse(sessionId, callId, result)}
        onMessagesChange={count} />
        │
        └─ MODULE (business-agnostic):
            subscribe bus → useMessages aggregate → useMessageList → RenderItem
              ├─ tool cards (ToolOutputContext, stream-internal)
              ├─ ask_user card (interactive iff onAskUserSubmit present)
              └─ subagent card → recurses module with child bus
```

## Testing

- Existing stream-subtree tests (`RenderItem.test.tsx`, etc.) must continue to pass after the
  module move and the contract change.
- New: `ask_user` card renders disabled-with-notice when `onAskUserSubmit` is absent, and
  interactive when present.
- New: `done`/`failure`/`error` ask_user cards replay read-only regardless of callback presence.
- New: submitting an interactive ask_user card invokes `onAskUserSubmit(callId, result)` with
  the precise `AskUserBridgeResponse` shape and the SSE-sourced `callId`.
- Verify the two existing pages (`ChatPage`, `CodingPage`) still drive the stream correctly
  after they switch to injecting `onAskUserSubmit` and drop `sessionId`. Validate in a real
  browser in both light and dark themes per frontend conventions.

## Risks & Notes

- The module still depends on `@/` app-internal modules (`MarkdownRenderer`, `StatusTimeline`,
  theme hooks, brand icons). This is acceptable while the consumer is inside the same frontend
  app; promoting to `packages/` later would require resolving those, but that need does not
  exist yet (YAGNI).
- `ToolOutputContext` remains stream-internal and ships inside the module — it is not a
  business coupling, it is the stream's own runtime.
