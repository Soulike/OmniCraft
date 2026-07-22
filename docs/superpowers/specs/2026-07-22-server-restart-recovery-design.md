# Server Restart Recovery — Design

- **Date:** 2026-07-22
- **Status:** Approved for planning
- **Branch:** `server-restart-recovery`

## Problem

When the backend restarts (or an agent is otherwise reloaded from disk) while a
client-side tool call is in flight — today only `ask_user` — the interaction is
silently lost and the UI is left broken:

1. The pending state lives only in memory (`UserInteractionBridge.pending`,
   `agent-core/user-interaction/user-interaction-bridge.ts:16`), owned by a
   per-agent `AgentRuntimeState` in an in-memory LRU cache. A restart destroys it.
2. On reload, `reconcileEventsFile` (`agent-core/agent/persistence/agent-persistence.ts:96`)
   truncates `sse-events.jsonl` back to `snapshot.sseEventCount`, discarding the
   in-flight turn.
3. The frontend reconnects with a resume cursor (`useStreamChat.ts:160,182`) that
   now points **past** the truncated log. The backend reader replays nothing and
   blocks forever on the idle agent (`agent-sse-log.ts:138-148`), so the UI hangs
   showing the `ask_user` card. Submitting the answer then 404s
   (`chat-agent-session/router.ts:198-201`).

## Decision

Recover with **best-effort roll-back ("heal backward")**, not turn resume:

- We do **not** attempt to revive the suspended turn or resume the LLM loop. That
  would require relocating the "answer → tool result → continue loop" ownership
  out of the tool/turn-runner and reconstructing a call stack that a restart
  destroyed — large surface, out of scope.
- Instead we keep the persisted conversation **correct and internally
  consistent** at the last completed-turn boundary, and make the frontend
  recover cleanly when its cursor outruns the rolled-back log.

**Accepted loss (non-goal):** the user message and partial assistant reply of the
interrupted turn are dropped. The turn is treated as if it never happened. This
is deliberate and acceptable — correctness and sync over completeness.

## Design principle: the snapshot is a healthy checkpoint

The load path already reconciles the **SSE log** down to `snapshot.sseEventCount`.
The missing guarantee is on the **history** side. We make this invariant hold:

> `snapshot.json` (`llmSession.messages` + `sseEventCount`) is **only ever
> persisted at a completed-turn boundary** (or empty, at construction). It never
> captures a mid-turn state, so a snapshot loaded from disk is always valid for
> continuation — no trailing assistant `tool_use` without a matching
> `tool_result`.

With that invariant, "load from disk" always lands on a healthy checkpoint, and
heal-backward is provably safe.

## The correctness gap this closes

The invariant is violated today in exactly one place. `generateAndEmitTitle`
(`agent-core/agent/agent.ts:349-361`) runs on the first turn and calls
`persistSnapshot()` when the title LLM call returns. That persist serializes
`llmSession.toSnapshot()` **at that instant** (`agent.ts:170`), which can be
mid-turn — including the assistant message carrying an unanswered `ask_user`
`tool_use`. Snapshot history and `sseEventCount` are written atomically, so both
views stay mutually consistent but **both embed the dangling tool call**.

If a restart lands there:

- the reloaded history ends with a `tool_use` and no `tool_result` → the **next
  LLM request is rejected by the provider** (broken session), and
- the cursor is not past the log (`from == count`), so the stale-cursor recovery
  never fires → **the hang persists**.

**Fix:** `generateAndEmitTitle` keeps emitting its `session-title` SSE event and
keeps the in-memory `this.title`, but **drops the `persistSnapshot()` call**. The
title is then persisted by the normal turn-end snapshot (`agent.ts:262`). The
only thing lost is the title of a first turn interrupted by a restart — and that
turn is being rolled back anyway, so it is consistent. This lives in shared
`agent-core`, fixing chat and coding agents together, and makes
`snapshot.llmSession` provably written only at construction (empty) or turn-end
(valid).

## Mechanism: stale-cursor detection → 409 → frontend full reload

**Detection (precise, false-positive-free).** The frontend cursor `lastIndex` is
a raw SSE-log index; the backend committed count is `agent.getSseEventCount()`
(`agent.ts:160`), the same unit. After a reload, the log is reconciled to that
count, so:

> `from > agent.getSseEventCount()` ⟺ the log was rolled back beneath this client.

A running agent only ever grows the count, so this cannot misfire during normal
streaming. `from == count` is the normal "caught up, tailing" case and is **not**
stale.

**Backend — return 409 instead of opening a doomed stream.** The service
`subscribe` gains a discriminated result and the count check:

```ts
type SubscribeResult =
  | {status: 'ok'; stream: AsyncIterable<SseEventCursorEntry>}
  | {status: 'not-found'}
  | {status: 'stale'; committedCount: number};
```

- `chatAgentSessionService.subscribe` / `codingAgentSessionService.subscribe`:
  after resolving the agent, if `startIndex > agent.getSseEventCount()`, return
  `{status: 'stale', committedCount}`; else `{status: 'ok', stream}`; missing
  agent → `{status: 'not-found'}`.
- Routers (`chat-agent-session/router.ts:109`, `coding-agent-session/router.ts:131`)
  map: `not-found` → 404, `stale` → **409** with body
  `{error: 'cursor_ahead_of_log', committedCount}`, `ok` → 200 SSE.

**Frontend — full reload on 409 (single shared spot).** `useStreamChat` is shared
by both agent types via `ChatSessionApiContext`; both `subscribeEvents`
implementations (`api/chat/chat.ts:73`, `api/coding/coding.ts`) already throw
`HttpError(status, …)` on non-2xx. In `useStreamChat.consume()`
(`useStreamChat.ts:159-215`), add a branch **before** `isRetriableError`
(which currently treats 409 as fatal — `useStreamChat.ts:190,310-313`):

- On `HttpError` with status 409:
  - emit `reset-session` on the event bus → clears messages
    (`useMessages.ts:469`), tool output, usage, title, and this hook's own
    streaming flags (`useStreamChat.ts:48-54`);
  - set `lastIndex = 0`, reset `consecutiveFailures = 0`, clear reconnecting
    state;
  - `continue` the loop → reconnects from index 0 and replays the rolled-back
    history. No page reload, no double render.

## Data flow (restart during `ask_user`)

1. Backend restarts. In-memory bridge + pending promise are gone.
2. Frontend's open SSE `fetch` errors (network `TypeError`, retriable) → backoff
   retry with `from = lastIndex` (ahead of the truncated log).
3. Router resolves the agent (lazy reload → `reconcileEventsFile` truncates the
   log to `snapshot.sseEventCount`; history is already a valid boundary thanks to
   the checkpoint invariant).
4. `startIndex > getSseEventCount()` → **409** `{committedCount}`.
5. Frontend `subscribeEvents` throws `HttpError(409)` → `consume()` resets the
   view, sets `lastIndex = 0`, reconnects `from = 0`.
6. Backend streams the rolled-back history from 0. UI shows the session at its
   last completed turn — no stuck card, no hang, no dangling `tool_use`.

## Edge cases

- **`submitToolResponse` 404 race.** If the user clicks submit on the stale card
  in the brief window before recovery, the POST 404s. The `ask_user` card owns
  its submit error handling and resets; the reload then removes the card. Minor,
  no change required.
- **Multi-tool round.** Not resuming means we never rebuild partial rounds — the
  whole interrupted turn is dropped, so sibling tool calls need no special
  handling.
- **Caught-up cursor (`from == count`).** Not stale; normal tailing. Unchanged.
- **Coding agent parity.** Same restart path; the backend service/router change
  is mirrored, the shared `agent-core` title fix covers it, and the shared
  `useStreamChat` covers the frontend.
- **Non-`ask_user` client tools (future).** The mechanism keys off open tool
  calls / cursor position generically, not `ask_user` specifically, so it holds
  for any future client tool.

## Non-goals

- Resuming or continuing the interrupted turn.
- Preserving the interrupted user message / partial assistant reply.
- Any change to the in-memory happy path (no restart) — bridge behavior is
  untouched.

## Changes by layer

- **`agent-core` (shared):** remove the mid-turn `persistSnapshot()` from
  `generateAndEmitTitle` (`agent.ts:349-361`); keep the `session-title` event and
  in-memory title.
- **Backend services:** `chat-agent-session-service.ts` and
  `coding-agent-session-service.ts` — `subscribe` returns the discriminated
  `SubscribeResult` with the stale check.
- **Backend routers:** `chat-agent-session/router.ts` and
  `coding-agent-session/router.ts` — map the result to 200 / 404 / 409.
- **Frontend:** `useStreamChat.ts` — 409 branch → reset + reconnect from 0.
- **Shared response shape:** the 409 body may be a plain error object; no
  `@omnicraft/sse-events` schema change (that neutral contract is untouched).

## Testing

- **Backend (unit):** `subscribe` returns `stale` when `startIndex >
getSseEventCount()`, `ok` otherwise, `not-found` when absent; router maps
  `stale` → 409 with `committedCount`.
- **Backend (invariant):** after simulating a title-generation persist during a
  turn that issued `ask_user`, the loaded snapshot history contains no trailing
  unanswered `tool_use` (i.e., the mid-turn persist no longer happens).
- **Frontend (unit):** `useStreamChat` resets the view and resumes from index 0
  when `subscribeEvents` throws `HttpError(409)`; a 409 is not counted as a
  retriable failure and does not surface a fatal `streamError`.
- **Manual (both themes):** start a session, trigger `ask_user`, restart the
  backend, confirm the UI recovers to the last completed turn with no stuck card
  and a working input.
