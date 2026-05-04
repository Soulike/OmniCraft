# Context Compaction Frontend UI

## Problem

Backend context compaction (see `2026-04-30-context-compaction-design.md`) is
fully implemented and runs at two boundaries: before each LLM call and after
each turn. The operation can take several seconds because it streams a
summarization call to the LLM.

Today the frontend has no signal that compaction is happening. The only
indirect cue is the context-usage percentage in the `UsageInfo` bar dropping
after `done` arrives. Users cannot tell whether work was lost, why context
shrank, or what the agent now "remembers". The compaction event is also absent
from the persisted SSE log, so reloading a session never replays it.

GitHub issue: <https://github.com/Soulike/OmniCraft/issues/227>.

## Goals

- Add SSE events that mark compaction start and completion.
- Persist those events in the existing `AgentSseLog` so reloaded sessions show
  compaction history naturally.
- Render a collapsible card in the message list at the position where
  compaction occurred, showing the generated summary on demand.
- Show a live "Compacting context…" spinner while compaction is in flight.
- Keep backend changes small. Reuse the existing
  `Agent.appendSseEvent` / `AgentSseLog` pipeline. No new transport, storage,
  or persistence work.
- Reuse the existing `Disclosure` + `Spinner` HeroUI v3 pattern already used by
  `ThinkingBlock`.

## Non-Goals

- Do not stream the summary text token-by-token (no `context-compaction-delta`
  event). The card is collapsed by default, so live token streaming would be
  invisible most of the time and is not worth the extra wiring. If we later
  decide to surface live text, this design extends naturally by adding a third
  event without breaking the start/end pair.
- Do not add a dedicated `context-compaction-error` event. Failures during the
  `before-model-call` path already abort the turn via the existing `error`
  event. Failures during the `after-turn` path are already swallowed by
  `compactAfterTurn`. The frontend handles a missing `end` as an
  `interrupted` UI state.
- Do not change the compaction trigger logic, the summarization prompt, or the
  token-estimate formula. This is a UI-surfacing change only.
- Do not add controls to manually trigger or undo compaction.

## Design

### SSE event schema

Two new events are added to `packages/sse-events/src/schema.ts` and re-exported
from `packages/sse-events/src/index.ts`. Both are added to
`sseBaseEventSchema` so they will also flow through `subagent-output` if a
subagent ever compacts.

```ts
// context-compaction-start
{
  type: 'context-compaction-start',
  reason: 'before-model-call' | 'after-turn',
  beforeTokens: number,    // estimated tokens at trigger time
  messageCount: number,    // count of messages being compacted
}

// context-compaction-end
{
  type: 'context-compaction-end',
  summary: string,         // generated summary text (markdown)
  beforeTokens: number,
  afterTokens: number,     // post-compaction token estimate
  messageCount: number,
  durationMs: number,
}
```

There is no compaction ID on the wire. The mutex in `LlmSession` guarantees at
most one in-flight compaction per session, so "the most recent unended
compaction" is unambiguous on the frontend.

### Backend emission

`LlmSession.compactIfNeeded` and the inner `compactIfNeededUnlocked` become
async generators that yield compaction SSE events. They no longer return a
value; the existing `this.compactions[]` side effect is preserved for any
caller that needs the metadata record.

```ts
async *compactIfNeeded(opts: {
  reason: 'before-model-call' | 'after-turn',
}): AsyncGenerator<CompactionSseEvent, void, void>
```

Behavior:

- If the threshold check fails, the generator yields nothing and returns. No
  events on the wire when no compaction happens.
- If the check passes, the generator yields `context-compaction-start`
  immediately before `generateCompactionSummary()` is called.
- After `this.messages` is replaced and `this.compactions` is updated, it
  yields `context-compaction-end`.
- If `generateCompactionSummary()` throws, the throw propagates out of the
  generator. `start` is already on the wire; `end` never fires. The mutex still
  wraps the generator body, so callers cannot interleave compactions.

`Agent` has two call sites
(`apps/backend/src/agent-core/agent/agent.ts:224` and `:329`). Each becomes a
single small loop:

```ts
for await (const event of this.llmSession.compactIfNeeded({
  reason: 'after-turn',
})) {
  await this.appendSseEvent(event);
}
```

The existing try/catch in `compactAfterTurn` continues to swallow errors after
`start` may have been emitted.

Wire ordering for an after-turn compaction is preserved:

```
…assistant text… → context-compaction-start → context-compaction-end → done
```

`done.usage.currentContextInputTokens` already reflects post-compaction tokens
because `compactAfterTurn` runs inside `emitDoneAfterTurn` before `done` is
yielded (commit `88f904a`).

### Frontend pipeline

#### Bus contract

`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`
adds two `ChatEventMap` entries and a new `MessageContent` variant:

```ts
'context-compaction-start': {
  compactionId: string;
  reason: 'before-model-call' | 'after-turn';
  beforeTokens: number;
  messageCount: number;
};
'context-compaction-end': {
  compactionId: string;
  summary: string;
  beforeTokens: number;
  afterTokens: number;
  messageCount: number;
  durationMs: number;
};

// MessageContent variant
{
  type: 'context-compaction',
  compactionId: string,
  status: 'in-progress' | 'done' | 'interrupted',
  reason: 'before-model-call' | 'after-turn',
  beforeTokens: number,
  messageCount: number,
  summary?: string,
  afterTokens?: number,
  durationMs?: number,
}
```

`compactionId` is generated frontend-side via `crypto.randomUUID()` when
`start` is received, then attached to the synthetic `ChatMessage`. It is the
key used to pair `start` with its matching `end`.

#### Routing

`apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts` adds two
`case` branches in the event switch (around lines 87-149) that forward both
events to `ChatEventBus`. The same handlers are added in
`route-base-event-to-bus.ts` so a future subagent compaction renders inside
that subagent's bubble via `subagent-output`.

#### Message state

`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts`
gains two handlers:

- On `context-compaction-start`: push a synthetic `ChatMessage` with content
  `{type: 'context-compaction', status: 'in-progress', ...}` and a freshly
  generated `compactionId`.
- On `context-compaction-end`: locate the most recent in-progress compaction
  message, set its status to `'done'`, and merge in `summary`, `afterTokens`,
  and `durationMs`.
- On `done`, `error`, or `reset-session`: any compaction message still in
  `'in-progress'` is flipped to `'interrupted'`. This covers the case where
  `start` arrived but the summarization call failed.

#### Render item and dispatch

`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`
adds `'context-compaction'` to `MessageRenderItem` and a passthrough case in
`transformMessages()`. `RenderItem.tsx` adds a matching `case` that renders
`<ContextCompactionBlock />`.

### `ContextCompactionBlock` component

Mirrors the structure of `ThinkingBlock`:

```
components/MessageList/components/ContextCompactionBlock/
  ContextCompactionBlock.tsx        ← container, manages expand/collapse state
  ContextCompactionBlockView.tsx    ← presentational, HeroUI Disclosure + Spinner
  styles.module.css
  index.ts
```

The view renders three states:

| status        | Trigger left side             | Trigger label                             | Body                                       |
| ------------- | ----------------------------- | ----------------------------------------- | ------------------------------------------ |
| `in-progress` | `<Spinner size='sm' />`       | `Compacting context…`                     | Hidden while in-progress (no partial text) |
| `done`        | `<Archive size={16} />`       | `Context compacted (47.2k → 8.1k tokens)` | `<MarkdownRenderer content={summary} />`   |
| `interrupted` | `<TriangleAlert size={16} />` | `Compaction interrupted`                  | Hidden                                     |

All states default to collapsed. Token counts are formatted with the same
helper used by `UsageInfoView` for consistency.

Mocks:

```
collapsed (done):
┌──────────────────────────────────────────────────────────┐
│ ⌬  Context compacted (47.2k → 8.1k tokens)            ▸ │
└──────────────────────────────────────────────────────────┘

expanded (done):
┌──────────────────────────────────────────────────────────┐
│ ⌬  Context compacted (47.2k → 8.1k tokens)            ▾ │
├──────────────────────────────────────────────────────────┤
│ The user asked to refactor the auth middleware. Claude   │
│ identified three call sites in api/v1/, removed the      │
│ legacy session token storage, and added unit tests for   │
│ the new JWT-based flow. All tests pass.                  │
└──────────────────────────────────────────────────────────┘

in-progress:
┌──────────────────────────────────────────────────────────┐
│ ◐  Compacting context…                                ▸ │
└──────────────────────────────────────────────────────────┘
```

`styles.module.css` introduces a distinct accent (e.g. indigo or amber border)
to distinguish compaction from `ThinkingBlock`'s neutral look. The exact color
is a presentational detail finalized during implementation. The `in-progress`
border can reuse the dashed/animated treatment `ThinkingBlock` already uses
for streaming.

## Persistence and replay

No new persistence work is required. `Agent.appendSseEvent` already writes
every event to `AgentSseLog`, which is replayed on session reload via
`Agent.subscribe`. Compaction events therefore become part of session history
automatically. Frontends hydrate `useMessages` from the replay stream the same
way they do for any other event.

## Failure modes

- **Summarization throws (before-model-call)**: the throw propagates up through
  `compactBeforeModelCall` and aborts the turn via the normal `error` event.
  `start` may already be on the wire. `useMessages` also flips any
  still-in-progress compaction card to `interrupted` when an `error` event
  arrives, applying the same rule as for `done` and `reset-session`.
- **Summarization throws (after-turn)**: `compactAfterTurn` swallows the error
  as today. `done` arrives, and the `useMessages` handler flips the in-progress
  card to `interrupted`.
- **`end` event lost in transit**: SSE is ordered per connection. If the
  connection drops mid-stream, reload replays from `AgentSseLog`, which has
  both events written atomically (via `appendSseEvent`'s normal flow). No
  partial state survives a reload.

## Testing

- `packages/sse-events`: schema parse tests for both new events (existing test
  pattern).
- `apps/backend/src/agent-core/llm-session/`: a unit test that runs
  `compactIfNeeded` and asserts the yielded events for the success and skip
  paths. A second test asserts the throw path: `start` yields, then the
  generator throws.
- `apps/backend/src/agent-core/agent/`: a test that exercises the agent loop
  end-to-end and asserts the wire ordering
  `…assistant → start → end → done`.
- `apps/frontend/.../useMessages`: tests for the three transitions
  (`start → end → done`, `start → done` with no end, reset).
- Manual UI verification in the dev server: trigger a synthetic compaction by
  lowering the trigger ratio in dev, exercise expand/collapse, verify
  `interrupted` styling.

## Rollout

Single PR. Backend and frontend changes are coupled (the frontend needs the
events to render). No feature flag is needed because the event types are
additive and ignored by older clients (the existing `useStreamChat` switch
falls through unrecognized events). Older sessions replayed after deploy will
have no compaction events in their log; they render exactly as today.
