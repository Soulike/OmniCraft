# Coding Task List: per-task status indicator — Design

- **Date:** 2026-07-21
- **Issue:** #348 (follows #346 / PR #351 — the task-list redesign that reserved the leading status column)
- **Status:** Approved design, ready for implementation plan

## Summary

Add a per-task **status indicator** to the coding task list (left "Tasks" sidebar). The
existing static `.dot` slot reserved by PR #351 is extracted into a standalone
`TaskStatusIndicator` component driven by a `TaskStatus` union, and rendered from a
**3-second unconditional poll** of `GET /coding/sessions` that carries a new backend
`isRunning` flag.

Four states are designed and built visually now. Three are wired in this work
(`idle`, `running`, `done`); the fourth (`waiting`) is designed and rendered by the
component but its **data source requires a separate investigation, tracked in #354** (see
[Open investigation](#open-investigation-waiting-data-source)), and is not fed yet.

## The four states

| State     | Meaning                                                      | Needs user action?              | Data source                                    |
| --------- | ------------------------------------------------------------ | ------------------------------- | ---------------------------------------------- |
| `idle`    | No turn in flight                                            | No                              | backend `isRunning === false` (default)        |
| `running` | A turn / title-gen is in flight                              | No                              | backend `isRunning === true` (poll)            |
| `done`    | Just transitioned running → idle, not yet acknowledged       | Yes — review the finished agent | **client-side**, derived from poll transitions |
| `waiting` | Agent issued a client tool call and is blocked on user input | Yes — respond to continue       | **TBD — investigation in #354**                |

Semantics: `idle`/`running` are passive; `done`/`waiting` both mean "needs you" and are
visually escalated and distinguishable from each other.

`done` is **client-only** and intentionally non-durable: after a page refresh the backend
reports the session as `idle` (a turn cannot survive a reload), so the `done` nudge is
lost — which is correct.

## Visual & animation spec (approved)

Rendered with the app's HeroUI semantic tokens; verified in dark and light.

- **idle** — hollow ring, `1.5px solid var(--muted)`, transparent fill, `opacity: .55`. Static. (unchanged from #351)
- **running** — a small ring **spinner** (~12px): `2px` border, track `var(--accent-soft)`, moving arc `var(--accent)`, continuous rotation (~0.7s linear). Spinner shape distinguishes "working" from the attention dots.
- **done** — filled `var(--success)` dot + **continuous diffusion**: two concentric rings expanding to ~3× and fading (~1.7s loop, second ring offset ~half a cycle), plus a one-shot "pop" scale-in on entrance.
- **waiting** — filled `var(--warning)` dot + the same diffusion + pop, in warning color.

Motion rules:

- Diffusion loops continuously on `done`/`waiting` **by explicit product decision** — these
  are pending-attention states that should keep drawing the eye until handled. This is
  consistent with the `WorkingIndicator` precedent (looping only while in an active/pending
  state, never at true rest). `idle` has no motion.
- **`prefers-reduced-motion: reduce` fallback:** spinner becomes a static accent arc;
  diffusion rings are hidden; `done`/`waiting` remain legible as a filled colored dot with a
  **static soft halo** (`box-shadow` ring in `--success-soft` / `--warning-soft`). All four
  states stay distinguishable without motion.

Reference mockups (persist under `.superpowers/brainstorm/`): `indicator-directions.html`,
`indicator-a-v2.html`.

## Component design

### `TaskStatusIndicator` (generic, presentational)

- **Location:** `apps/frontend/src/components/TaskStatusIndicator/` — business-agnostic (it
  maps a `status` prop to a visual and knows nothing about sessions/agents), so it belongs in
  `components/`, not `modules/`. Mirror the file layout of an existing generic component (e.g.
  `components/CollapsibleSidebar`): `index.ts` as the sole public entry, a stateless
  `TaskStatusIndicator.tsx` view (no hooks/state — purely presentational), `styles.module.css`.
- **Type:** `export type TaskStatus = 'idle' | 'running' | 'done' | 'waiting';` (frontend view
  concept; not in `@omnicraft/api-schema`).
- **Props:** `{ status: TaskStatus }`. Per the repo layout rule, the component does **not**
  set its own placement (no `margin`/`flex`/etc.); the parent's slot controls layout. It
  renders a fixed-size box.
- **Styling:** CSS Module consuming HeroUI tokens only (`--accent`, `--accent-soft`,
  `--success`, `--warning`, `--muted`, `--success-soft`, `--warning-soft`). Spinner + diffusion
  are the control's own component-internal motion (tokens for color; no bespoke material —
  no gradients/blur). Includes the `prefers-reduced-motion` fallback above.
- **Accessibility:** unlike the old `aria-hidden` dot, expose state to assistive tech —
  an `aria-label` (or visually-hidden text) for `running` ("running"), `done`
  ("finished — review"), `waiting` ("needs your input"); `idle` may stay silent/aria-hidden.

### Status derivation hook (coding task list)

- **Location:** `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts`
  (one concern: derive per-session `TaskStatus`, including client-side `done`).
- **Inputs:** the polled `sessions` (each with optional `isRunning`) and the selected session id
  (`useSessionId()` — this is selection state, **not** a `useStreamChat` dependency; the task
  list stays independent of the stream driver per the agreed constraint).
- **State:** `prevRunning: Set<string>` (running ids from the previous poll) and a reactive
  `done: Set<string>` (unacknowledged finished sessions).
- **Per poll:**
  - `currentRunning` = ids with `isRunning === true`.
  - For each id in `prevRunning` not in `currentRunning`, still present in the list, and
    **not** the selected id → add to `done`.
  - Remove from `done` any id that is now running again, is the selected id, or has left the list.
  - `prevRunning := currentRunning`.
- **On selection change:** remove the newly-selected id from `done` (selecting = acknowledging).
- **Derivation precedence per session id:** `running` (currentRunning) → `waiting` (future
  signal; never produced yet) → `done` (in `done` set) → `idle`.

## Backend changes (small — data already in memory)

1. **`packages/api-schema/src/chat/schema.ts`** — add `isRunning: z.boolean().optional()` to
   `sessionMetadataSchema`. Optional = backward compatible; required so the value survives
   `listSessionsResponseSchema.parse()` on the client (default `z.object` strips unknown keys).
2. **`apps/backend/src/models/agent-store/agent-store.ts`** — add `getRunningIds(): Set<string>`
   on the base `AgentStore` (the `cache` is `private`, so the accessor must live here). Iterate
   `cache`, collect ids where `entry.agent.isRunning`. O(≤50), pure in-memory, no disk — running
   agents are guaranteed resident because eviction skips them (`agent-store.ts:88`).
3. **`apps/backend/src/models/agent-store/coding-agent-store.ts`** — in `listSessionMetadata`,
   read `const running = this.getRunningIds()` once, then inject `isRunning: running.has(id)`
   alongside the existing `updatedAt: mtime`, **after** `sessionMetadataSchema.parse()` (same
   proven injection pattern already used for `updatedAt`). `main-agent-store.ts` is left
   unchanged — this feature is coding-only.

`Agent.isRunning` (`agent.ts:233` = `pendingTurnCount > 0 || isGeneratingTitle`) is the source
of truth and needs no change.

## Frontend data flow

1. **Poll:** add an unconditional interval to `useAllCodingSessions`
   (`.../WorkspaceSessionList/hooks/useAllCodingSessions.ts`): `POLL_INTERVAL_MS = 3000`;
   `useEffect` sets `setInterval(() => void reload(true), POLL_INTERVAL_MS)` and clears it on
   unmount. Reuses the existing background path (`reload(true)` — no spinner flash, `generationRef`
   guards stale responses). No visibility gating (kept simple; a future completion-notification
   feature needs the poll running regardless).
   - Recommended nicety: guard `setSessions` so it only updates when the list actually changed
     (ids / order / `isRunning` / `updatedAt`), avoiding a re-render every 3s.
2. **Derive:** feed the polled sessions + selected id into `useTaskStatuses` → per-row `TaskStatus`.
3. **Thread & render:** pass each row's `TaskStatus` down
   `WorkspaceGroupView` → `TaskListItem` → `TaskListItemView`, replacing the inline `.dot` with
   `<TaskStatusIndicator status={status} />` in the reserved slot. Remove the now-migrated `.dot`
   CSS from `TaskListItem/styles.module.css`.

Because the poll also re-reads snapshot mtime each tick, recency/order stays fresh and is
race-immune (the `done`-before-`persistSnapshot` mtime race noted in #348 does not affect a
polled read).

## Edge cases & behavior

- **Process restart:** cold cache ⇒ `getRunningIds()` empty ⇒ all `idle`. Correct.
- **`done`/`isRunning` race:** `isRunning` is read live from memory and flips false only _after_
  `persistSnapshot()`, so a poll never reports a just-finished turn as still running, and `done`
  detection (running→idle) is never a false positive.
- **New-session immediacy:** existing `session-created` / `session-title` bus subscriptions still
  trigger `reload(true)`, so newly created tasks light up without waiting for the interval.
- **Sub-interval turns:** a turn that starts and ends within one 3s window is never observed
  running, so it shows neither `running` nor `done`. Acceptable (arguably desirable — no flicker).
- **Poll scope:** the interval lives with the coding task list, so it runs while the coding page is
  mounted and stops on navigation away. A future app-level completion-notification will need its own
  mechanism — out of scope here.

## Testing

- **api-schema** (`packages/api-schema/src/chat/schema.test.ts`): `isRunning` round-trips
  (true / false / absent) through `sessionMetadataSchema` and `listSessionsResponseSchema`.
- **backend:**
  - `getRunningIds()` returns exactly the running agents' ids (cache seeded with one running + one
    idle agent).
  - `coding-agent-store` `listSessionMetadata` stamps `isRunning` from the accessor.
- **frontend:**
  - `useAllCodingSessions` fires `reload(true)` on the 3s interval (fake timers) and clears it on
    unmount.
  - `useTaskStatuses`: running→idle for a non-selected session yields `done`; selecting it clears
    `done`; a re-run clears `done`; deleted sessions drop out; the selected session never shows
    `done`.
  - `TaskStatusIndicator` renders the correct visual per `status` (assert the state class/marker).

## Open investigation: `waiting` data source

Before `waiting` can be wired, investigate how the backend represents "an agent has issued a
client-side tool call (e.g. `ask_user`) and is blocked awaiting the user's response," and whether
that is observable from the session list:

- Does an agent awaiting a client tool response currently count as `isRunning` (i.e. is
  `pendingTurnCount` still > 0 while blocked)? If so, `waiting` sessions would today be
  indistinguishable from `running` and need a separate flag.
- Likely outcome: a new optional field on `sessionMetadataSchema` (e.g. `isWaitingForInput`) fed by
  a new `AgentStore` accessor, mirroring the `isRunning` mechanism — then `useTaskStatuses` emits
  `waiting` ahead of `done`/`idle`.

This is tracked as a **separate follow-up in #354** (its own investigation → spec → plan). The
`TaskStatusIndicator` component and the `TaskStatus` union already include `waiting`, so wiring it
later is additive.

## Out of scope / future

- A global push channel (broadcast SSE `snapshot + deltas`) instead of polling — considered and
  deferred; polling is stateless/self-healing and its work (`getRunningIds`, the `isRunning`
  snapshot) is a strict subset of any future push design. Revisit only if 3s polling proves
  insufficient.
- The chat session list (`SessionItem`) — unchanged; the backend `isRunning` lands only on the
  coding store.
- `waiting` data sourcing — tracked in #354.
- App-level completion notifications.
