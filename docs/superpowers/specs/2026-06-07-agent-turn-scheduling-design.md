# Agent Turn Scheduling Semantics

Follow-up from #264 (resume_agent tool), tracked in #265.

## Problem

`Agent.isRunning` is not a reliable concurrency gate. `handleUserMessage()`
schedules `runTurn()` fire-and-forget, and `runTurn()` first does
`await this.mutex.acquire()` and only afterwards sets
`this.abortController = new AbortController()`. Because `isRunning` is currently
defined as `abortController !== null || isGeneratingTitle`, there is a window
where a turn has been queued but has not yet acquired the mutex, during which
`isRunning` still reads `false`.

This window is unsafe for subagent resume. On the dispatch path,
`runSubagentTurn` registers a freshly dispatched subagent right after starting
its first turn (`onTurnStarted` after `handleUserMessage`). During the startup
window the registered subagent can appear idle, so a concurrent `resume_agent`
call could enqueue a second turn before the first turn is visibly running.

The current mitigation is a module-level `resumeClaims` `Set` in
`resume-agent-tool.ts`. It only guards resume-vs-resume races; it does not close
the dispatch-vs-resume window, and it lives outside the Agent it is meant to
protect.

## Goals

- Make `isRunning` cover queued turns, not only turns that have already acquired
  the mutex.
- Give the Agent two turn-scheduling entry points with explicit semantics:
  always-enqueue, and start-only-if-idle.
- Provide a synchronous, per-Agent idle claim so `resume_agent` can reject a busy
  or starting subagent without a module-level claim set.
- Migrate all `handleUserMessage()` call sites and remove the method.
- Remove `resumeClaims` from `resume-agent-tool.ts`.
- Keep `dispatch_agent` behavior and subagent registration ordering unchanged.

## Non-Goals

- No frontend changes.
- No SSE schema changes.
- No persistence or snapshot changes.
- No change to `runTurn`'s internal mutex serialization or to `abort()`.
- No new "queued vs running" distinction in user-facing or LLM-facing output
  beyond what the broadened `isRunning` already implies.

## Selected Design

### Tracked turn count

Add a synchronously-maintained counter to `Agent` and route every turn through a
single private helper:

```ts
private pendingTurnCount = 0;

private runTrackedTurn(userMessage: string): void {
  this.pendingTurnCount++;
  void this.runTurn(userMessage).finally(() => {
    this.pendingTurnCount--;
  });
}
```

`pendingTurnCount` is incremented synchronously, before `runTurn` awaits the
mutex, and decremented after the turn's promise fully settles (after `runTurn`'s
own `finally` clears `abortController` and releases the mutex). The counter
therefore spans the entire lifetime of a turn from enqueue to completion, which
is a superset of the `abortController !== null` window it replaces.

A counter (not a boolean) is used because `enqueueUserTurn` may legitimately
queue more than one turn — for example, a user sending several main-agent
messages in sequence — and the gate must remain "busy" until all of them drain.

### Turn-scheduling API

Replace `handleUserMessage()` with two methods that differ only in scheduling
semantics:

```ts
// Always accepts the turn and serializes it through the mutex queue.
// Used for normal main-agent user messages and for subagent dispatch.
enqueueUserTurn(userMessage: string): void {
  this.runTrackedTurn(userMessage);
}

// Accepts the turn only if the Agent has no pending/running turn (and no
// in-flight title generation). Returns false when busy instead of queueing.
// Used for resume_agent and any future "start only when idle" path.
tryStartUserTurn(userMessage: string): boolean {
  if (this.isRunning) return false;
  this.runTrackedTurn(userMessage);
  return true;
}
```

`tryStartUserTurn` is a reliable atomic claim because there is no `await`
between reading `this.isRunning` and the `pendingTurnCount++` inside
`runTrackedTurn`. In a single-threaded runtime the check-and-increment cannot be
interleaved with another claim, so it fully replaces the module-level
`resumeClaims` set.

### isRunning

```ts
get isRunning(): boolean {
  return this.pendingTurnCount > 0 || this.isGeneratingTitle;
}
```

The `abortController !== null` term is dropped: `pendingTurnCount > 0` already
covers the running period and additionally covers the queued-but-not-yet-started
window. `isGeneratingTitle` is retained so the Agent stays "busy" while an
async title generation outlives its turn. `abortController` remains on the Agent
solely for `abort()`.

### runSubagentTurn start policy

`runSubagentTurn` stops calling `handleUserMessage` directly and instead receives
an injected start policy:

```ts
interface RunSubagentTurnInput {
  // ...existing fields...
  readonly startTurn: () => boolean; // false = subagent busy, reject the turn
}
```

The turn-running sequence captures the SSE boundary before the turn starts,
checks for an already-aborted parent before starting anything, then applies the
start policy before emitting the start event on the normal path. The abort check
must precede `startTurn()`: an `abort` listener added to an already-aborted
signal never fires, so starting a turn after the parent has aborted would leave
the subagent turn running uncancelled. All steps before the first `await` run
synchronously, which guarantees the started turn cannot append events before
`startIndex` is captured:

1. Attach the parent abort listener to the subagent.
2. Capture `startIndex = subagent.getSseEventCount()`.
3. If the parent signal is already aborted, emit the start event, emit
   `subagent-complete` (failure), and return an aborted failure. No turn is
   started.
4. Call `startTurn()`. If it returns `false` (subagent busy), return a busy
   failure immediately — do not emit the start event, do not subscribe or
   register.
5. Emit the start event (`subagent-dispatch` / `subagent-resume`).
6. Subscribe with `{startIndex, signal}`.
7. Call `onTurnStarted?.()` (dispatch registers the subagent here).
8. Stream subagent events as `subagent-output` and return the result, as today.

Capturing `startIndex` before `startTurn()` and subscribing afterwards is safe
because the subagent SSE log is append-only and read by index; the reader picks
up every event appended at or after `startIndex` regardless of when the reader
is created. The already-aborted branch still emits the start event before
`subagent-complete` so the parent timeline shows the failed dispatch/resume, as
it does today.

Callers supply the policy:

- `dispatch_agent`: `startTurn: () => { subagent.enqueueUserTurn(task); return true; }`.
  A freshly created subagent is never busy, so the policy always returns `true`,
  and registration still happens after the turn starts.
- `resume_agent`: `startTurn: () => handle.agent.tryStartUserTurn(task)`.

The busy-failure message ("Subagent `<id>` is already running. Wait for it to
finish before resuming it.") moves into `runSubagentTurn`, since it is the
component that observes the rejected start. It is only reachable on the resume
path because the dispatch policy never returns `false`.

### resume-agent-tool cleanup

`resume-agent-tool.ts` is simplified to rely on the per-Agent claim:

- Remove `resumeClaims`, `tryClaimResume`, `busyFailure`, `isSubagentRunning`,
  and both `handle.agent.isRunning` pre-checks.
- `execute()` keeps: UUID validation (invalid-id failure), `registry.get`
  lookup (not-available failure), then a single `runSubagentTurn` call passing
  the `subagent-resume` start event and the `tryStartUserTurn` start policy.

### isRunning consumers

Broadening `isRunning` is consistent with every consumer and requires no other
code changes:

- `list_resumable_agents` (`list-resumable-agents-tool.ts:32`): a queued
  subagent now reports `running` rather than `idle`, which is more accurate — an
  Agent about to run should not be offered as a resumable idle target.
- Subagent registry eviction (`subagent-registry.ts:100`) and agent-store
  eviction (`agent-store.ts:88`): an Agent with a queued turn is no longer
  evictable, closing a latent startup-window eviction race.

### Call sites

- `agent-session-service.ts:106`: `handleUserMessage(userMessage)` →
  `enqueueUserTurn(userMessage)`.
- `subagent-turn-runner.ts`: replace the direct `handleUserMessage(task)` call
  with the injected `startTurn` policy described above.
- Tests currently calling `handleUserMessage(...)` migrate to `enqueueUserTurn`.

`handleUserMessage()` is then removed entirely; no wrapper is kept, so there is a
single way to schedule each kind of turn.

## Error Handling

- Busy subagent on resume: `tryStartUserTurn` returns `false`; `runSubagentTurn`
  returns a normal busy tool failure and emits no SSE events for the rejected
  turn.
- Invalid or unknown subagent id on resume: unchanged (invalid-id and
  not-available failures in `resume_agent`).
- Parent turn already aborted when a turn would start: emit `subagent-complete`
  (failure) after the start event and return an aborted failure, matching
  current behavior.
- Unexpected exceptions continue to convert to tool execution errors via the
  existing executor path.

## Testing

Backend tests (`agent.test.ts`, `resume-agent-tool.test.ts`,
`dispatch-agent-tool.test.ts`):

- `enqueueUserTurn()` accepts multiple turns and serializes them in order.
- `tryStartUserTurn()` returns `false` while a turn is queued or running.
- `tryStartUserTurn()` returns `false` while title generation is in flight
  (`isRunning` true with `pendingTurnCount === 0`).
- Two consecutive `tryStartUserTurn()` calls: the second returns `false`
  (exclusive claim).
- `isRunning` is `true` for both a running turn and a queued turn.
- `resume_agent` rejects a subagent whose first dispatch turn is queued/starting,
  without relying on a module-level `resumeClaims` set.
- A rejected resume emits neither `subagent-resume` nor `subagent-complete` and
  leaves no hanging subscriber on the subagent.
- `dispatch_agent` behavior is unchanged, including subagent registration
  ordering (the dispatch start runs before `onTurnStarted`).

## Open Decisions

None. A richer Agent state model (e.g. distinguishing `queued` vs `running` vs
`titling`) is out of scope; the boolean `isRunning` plus `pendingTurnCount` is
sufficient for the current consumers.
