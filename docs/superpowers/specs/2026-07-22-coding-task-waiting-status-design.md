# Coding Task List: source the `waiting` status — Design

- **Date:** 2026-07-22
- **Issue:** #354 (follow-up to #348 — the per-task status indicator)
- **Status:** Approved design, ready for implementation plan

## Summary

Wire the fourth coding-task-list status, `waiting`, to a real backend signal.
`waiting` means an agent issued a **client-side tool call** (e.g. `ask_user`) and
is **blocked awaiting the user's response** — it needs the user's attention (like
`done`) but is distinct: the agent cannot proceed until the user replies.

The `TaskStatusIndicator` component and the `TaskStatus` union already render and
include `waiting` (built in #348). The remaining work is **additive**: a new backend
flag `isWaitingForInput` carried on the existing `GET /coding/sessions` poll, plus one
branch in the `useTaskStatuses` derivation hook. No new UI.

## Investigation outcome (the reason this is separate from #348)

The #348 open investigation asked two questions; both are now answered by reading the
agent core:

1. **Does a blocked agent still count as `isRunning`?** **Yes.** `askUserTool.execute`
   (`apps/backend/src/agent/tools/client/ask-user.ts`) does
   `await context.userInteractionBridge.waitForResponse(callId, signal)`. That await sits
   _inside_ the agent loop, so `Agent.runTurn` never settles while blocked, so
   `pendingTurnCount` stays `> 0`, so `Agent.isRunning`
   (`agent.ts` = `pendingTurnCount > 0 || isGeneratingTitle`) stays `true`.
   **A `waiting` session is therefore indistinguishable from `running` today** — a separate
   flag is required, confirming the issue's premise.

2. **Is "awaiting user" observable from in-memory state?** **Yes.**
   `UserInteractionBridge` (`apps/backend/src/agent-core/user-interaction/user-interaction-bridge.ts`)
   holds a private `pending` Map. An entry is added when a client tool starts waiting and
   removed on `submitResponse` (user answered) or on abort. So `pending.size > 0` ⟺ the
   agent is blocked on a client tool. The bridge is owned by `AgentRuntimeState`, which is
   owned by `Agent`, so the signal can be surfaced up the same chain `isRunning` uses.

**Key consequence:** because a blocked agent has **both** `isRunning === true` **and**
`isWaitingForInput === true`, the frontend derivation must check `waiting` **before**
`running`. This is the reverse of the tentative precedence noted in the #348 spec
(`running → waiting → …`), which was written before this was confirmed.

**Guaranteed resident:** a blocked agent is `isRunning`, and `AgentStore.evictIfNeeded`
skips running agents, so a waiting agent is never evicted. A cache scan mirroring
`getRunningIds()` always sees it.

**Genericity:** the signal reads the bridge's pending count, so it covers _any_ client-side
tool that waits for a response, not just `ask_user`.

## Approach

Add an orthogonal boolean `isWaitingForInput`, surfaced through the exact mechanism #348
built for `isRunning`. Each flag stays truthful to its own definition:

- `isRunning` — a turn / title-gen is in flight (**unchanged** from #348).
- `isWaitingForInput` — a client-side tool call is blocked on the user.

The frontend applies precedence at derivation time. Two rejected alternatives:

- **Mutually-exclusive backend states** (report a blocked agent as `isRunning: false`):
  rejected. It redefines `isRunning` away from "turn in flight," and corrupts `done`
  detection — an agent going running→waiting would read as a running→idle transition and
  could be falsely marked `done`.
- **Single backend `status` enum** (`idle | running | waiting`): rejected. Non-additive
  churn on the `isRunning` field just shipped in #348, and since `done` stays client-derived
  the frontend must merge regardless, so the enum buys nothing.

## Backend changes

All small; the data is already in memory. Each step mirrors an existing `isRunning`
counterpart.

1. **`apps/backend/src/agent-core/user-interaction/user-interaction-bridge.ts`** — add
   `get hasPending(): boolean` returning `this.pending.size > 0`. Source of truth for
   "blocked on a client tool."
2. **`apps/backend/src/agent-core/agent/agent-runtime-state.ts`** — add
   `get isWaitingForInput(): boolean` returning `this.userInteractionBridge.hasPending`.
3. **`apps/backend/src/agent-core/agent/agent.ts`** — add
   `get isWaitingForInput(): boolean` returning `this.runtimeState.isWaitingForInput`.
   `isRunning` is untouched.
4. **`apps/backend/src/models/agent-store/agent-store.ts`** — add
   `getWaitingIds(): Set<string>` on the base `AgentStore`, structurally identical to
   `getRunningIds()`: iterate the private `cache`, collect ids where
   `entry.agent.isWaitingForInput`. O(≤50), pure in-memory, no disk.
5. **`apps/backend/src/models/agent-store/coding-agent-store.ts`** — in
   `listSessionMetadata`, read `const waiting = this.getWaitingIds()` once (next to the
   existing `const running = this.getRunningIds()`), then inject
   `isWaitingForInput: waiting.has(id)` in the returned object alongside `isRunning` and
   `updatedAt`, **after** `sessionMetadataSchema.parse()`. Coding store only; the main store
   is left unchanged, matching #348.
6. **`packages/api-schema/src/chat/schema.ts`** — add
   `isWaitingForInput: z.boolean().optional()` to `sessionMetadataSchema`. Optional = backward
   compatible; present so the value survives `listSessionsResponseSchema.parse()` on the
   client (default `z.object` strips unknown keys).

## Frontend change

**`apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts`**
— add a `waiting` branch:

- Compute `currentWaiting` = ids with `s.isWaitingForInput === true` (a `useMemo` mirroring
  `currentRunning`).
- Change the per-session derivation precedence to
  **`waiting` → `running` → `done` → `idle`**:

  ```ts
  const status: TaskStatus = currentWaiting.has(s.id)
    ? 'waiting'
    : currentRunning.has(s.id)
      ? 'running'
      : s.id !== selectedId && doneIds.has(s.id)
        ? 'done'
        : 'idle';
  ```

- `waiting` is **not** gated by selection (approved product decision). Unlike `done` — a
  synthetic "you haven't looked yet" nudge that clears on selection — `waiting` is a real,
  backend-reported fact about the agent (it is blocked). It persists until the user answers,
  at which point the backend flag flips and the next poll clears it. Viewing the session does
  not answer the question, so selecting it must not suppress the indicator.

The `done` running→idle detection is unaffected: a blocked agent remains in `currentRunning`
(it is still `isRunning`), so it is never added to `doneIds` while waiting, and no
running→idle transition is observed until the turn truly finishes.

## Data flow (unchanged plumbing)

The 3-second `useAllCodingSessions` poll already re-fetches the full session list and applies
`result.sessions`, so the new field rides along with no change to the poll, the change
detection, or the `WorkspaceGroupView → TaskListItem → TaskListItemView` threading. Only the
derivation hook and the backend/schema change.

## Lifecycle walkthrough

For a non-selected session:

1. Agent runs a turn → `isRunning: true`, `isWaitingForInput: false` → **`running`**.
2. Agent calls `ask_user`; `execute` blocks in `waitForResponse`; bridge `pending` gains an
   entry → `isRunning: true`, `isWaitingForInput: true` → **`waiting`** (precedence wins over
   running).
3. User answers → `submitResponse` resolves and deletes the pending entry → next poll:
   `isWaitingForInput: false`, agent still finishing → **`running`**.
4. Turn completes → `isRunning: false`; running→idle transition recorded → **`done`**.
5. User selects the session (acknowledges) → **`idle`**.

## Edge cases

- **Process restart:** cold cache ⇒ `getWaitingIds()` empty ⇒ `idle`. A blocked turn cannot
  survive a reload, so `waiting` is correctly non-durable — consistent with `done`.
- **No orphan `waiting`:** a `pending` entry exists only during a running turn (added in
  `execute`, removed on submit or on the turn's abort via the bridge's `onAbort`). So
  `isWaitingForInput` ⟹ `isRunning` always holds; there is never a "waiting but not running"
  session.
- **Abort while waiting:** aborting the turn triggers the bridge's `onAbort`, which deletes
  the pending entry and rejects; the next poll reports neither running nor waiting. Correct.
- **Sub-interval ask/answer:** a question asked and answered within one 3s window may never be
  observed as `waiting`. Acceptable (no flicker), consistent with the #348 sub-interval note.
- **Multiple client tools in one turn:** the mutex serializes turns, but even multiple pending
  interactions collapse to a single boolean — the session is "waiting" iff any is pending.

## Testing

- **`packages/api-schema`** (`chat/schema.test.ts`): `isWaitingForInput` round-trips
  (true / false / absent) through `sessionMetadataSchema` and `listSessionsResponseSchema`.
- **backend:**
  - `UserInteractionBridge.hasPending` is `false` initially, `true` after `waitForResponse`
    registers an entry, and `false` again after `submitResponse` resolves it and after an
    abort cleans it up.
  - `AgentStore.getWaitingIds()` returns exactly the ids of cached agents whose
    `isWaitingForInput` is true (seed a waiting agent, a running-not-waiting agent, and an idle
    agent).
  - `CodingAgentStore.listSessionMetadata` stamps `isWaitingForInput` from the accessor.
- **frontend** (`useTaskStatuses`):
  - a session with `isWaitingForInput: true` derives `waiting`;
  - when both `isRunning` and `isWaitingForInput` are true, `waiting` wins;
  - `waiting` shows even when the session is the selected id;
  - when `isWaitingForInput` drops while `isRunning` stays true, it reverts to `running`;
  - a session that goes waiting → not-running becomes `done` (unselected) via the existing
    transition path.

## Out of scope

- The chat session list — unchanged; `isWaitingForInput` lands only on the coding store, as
  with `isRunning`.
- Any change to `TaskStatusIndicator` or the `TaskStatus` union — already complete in #348.
- App-level completion / attention notifications — a separate future concern.
- A push channel replacing the poll — deferred in #348; unchanged here.
