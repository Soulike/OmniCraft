# Agent Turn Scheduling Semantics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Agent.handleUserMessage()` with two scheduling APIs (`enqueueUserTurn`, `tryStartUserTurn`) backed by a synchronous `pendingTurnCount`, so `isRunning` covers queued turns and `resume_agent` gets a per-Agent atomic idle claim — removing the module-level `resumeClaims` set.

**Architecture:** A `pendingTurnCount` counter is incremented synchronously before `runTurn` awaits the mutex and decremented after the turn promise settles. `isRunning` becomes `pendingTurnCount > 0 || isGeneratingTitle`. `enqueueUserTurn` always queues; `tryStartUserTurn` checks-and-increments with no intervening `await`, making it an atomic claim. `runSubagentTurn` receives an injected `startTurn(): boolean` policy: dispatch always returns `true`, resume delegates to `tryStartUserTurn`.

**Tech Stack:** TypeScript, Bun (package manager + runtime), Vitest, Node.js APIs.

Spec: `docs/superpowers/specs/2026-06-07-agent-turn-scheduling-design.md`

---

## File Structure

| File                                                                 | Responsibility             | Change                                                                                                                           |
| -------------------------------------------------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `apps/backend/src/agent-core/agent/agent.ts`                         | Core Agent turn scheduling | Add `pendingTurnCount`, `runTrackedTurn`, `enqueueUserTurn`, `tryStartUserTurn`; rewrite `isRunning`; remove `handleUserMessage` |
| `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`     | Subagent turn execution    | Replace direct `handleUserMessage(task)` with injected `startTurn()` policy; move busy-failure message here                      |
| `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`      | Dispatch tool              | Pass `startTurn` policy that enqueues and returns `true`                                                                         |
| `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`        | Resume tool                | Remove `resumeClaims`/`tryClaimResume`/`busyFailure`/`isSubagentRunning`; pass `tryStartUserTurn` policy                         |
| `apps/backend/src/services/agent-session/agent-session-service.ts`   | Session service            | `handleUserMessage` → `enqueueUserTurn`                                                                                          |
| `apps/backend/src/agent-core/agent/agent.test.ts`                    | Agent tests                | Migrate `handleUserMessage` → `enqueueUserTurn`; add scheduling tests                                                            |
| `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts` | Dispatch tests             | Update mocks to provide `enqueueUserTurn`; update `runSubagentTurn` calls with `startTurn`                                       |
| `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`   | Resume tests               | Update mocks to `tryStartUserTurn`; replace claim-race test with idle-claim test                                                 |

**Commands** (run from repo root):

- Test one file: `bun --filter @omnicraft/backend run test <path>` — or `cd apps/backend && bun run test <path>`
- Typecheck: `cd apps/backend && bun run typecheck`
- Lint: `cd apps/backend && bun run lint`

> Note: `bun run test` maps to `vitest run`. Pass a path substring to scope it, e.g. `bun run test agent.test.ts`.

---

## Task 1: Add `pendingTurnCount` and turn-scheduling APIs to `Agent`

This is the core change. We introduce the counter and the two new entry points, rewrite `isRunning`, and route `runTurn` through `runTrackedTurn`. `handleUserMessage` is kept temporarily in this task ONLY so existing tests still compile; it is removed in Task 2 after call sites migrate. We add new behavior tests here.

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block at the end of `apps/backend/src/agent-core/agent/agent.test.ts` (after the `Agent default working directory` block, before the final closing of the file). These tests use the existing `mainCompletionStream` (which has a 20ms delay after `message-start`, giving us a window where a turn is queued/running) and the existing `testAgentOptions`, `collectUntilDone`, `delay` helpers.

```typescript
describe('Agent turn scheduling', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('reports isRunning synchronously once a turn is enqueued', () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );

    expect(agent.isRunning).toBe(false);
    agent.enqueueUserTurn('first');
    // No await between enqueue and this read — the turn is still queued
    // (runTurn has not acquired the mutex), yet isRunning must already be true.
    expect(agent.isRunning).toBe(true);
  });

  it('serializes multiple enqueued turns and stays busy until all drain', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );

    agent.enqueueUserTurn('first');
    agent.enqueueUserTurn('second');
    expect(agent.isRunning).toBe(true);

    // Drain both turns; the agent's log carries two done events.
    let doneCount = 0;
    const controller = new AbortController();
    for await (const entry of agent.subscribe({signal: controller.signal})) {
      if (entry.event.type === 'done') {
        doneCount++;
        if (doneCount === 2) {
          controller.abort();
          break;
        }
      }
    }

    expect(doneCount).toBe(2);
    // Allow the second turn's finally() to settle the counter.
    await delay(0);
    expect(agent.isRunning).toBe(false);
  });

  it('tryStartUserTurn returns false while a turn is queued or running', () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );

    expect(agent.tryStartUserTurn('first')).toBe(true);
    // Second claim must be rejected: the first turn is queued/running.
    expect(agent.tryStartUserTurn('second')).toBe(false);
    expect(agent.isRunning).toBe(true);
  });

  it('tryStartUserTurn returns true again once the turn completes', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion').mockImplementation(() =>
      mainCompletionStream(),
    );
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
    );

    expect(agent.tryStartUserTurn('first')).toBe(true);
    await collectUntilDone(agent);
    await delay(0);
    expect(agent.isRunning).toBe(false);
    expect(agent.tryStartUserTurn('second')).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd apps/backend && bun run test agent.test.ts`
Expected: FAIL — `agent.enqueueUserTurn is not a function` / `agent.tryStartUserTurn is not a function` for the new tests. (Existing tests still pass because `handleUserMessage` remains in this task.)

- [ ] **Step 3: Implement the counter and APIs in `agent.ts`**

In `apps/backend/src/agent-core/agent/agent.ts`:

(a) Add the counter field next to the other private state (after the `isGeneratingTitle` field around line 80):

```typescript
  /** True while an async title generation is in flight. */
  private isGeneratingTitle = false;

  /**
   * Number of turns from enqueue to full completion. Incremented synchronously
   * before runTurn awaits the mutex; decremented after the turn promise settles.
   */
  private pendingTurnCount = 0;
```

(b) Replace the `handleUserMessage` method (currently lines 190-196) with the two new public methods plus a private tracked-turn helper. Keep `handleUserMessage` as a thin temporary wrapper so existing tests compile (it is removed in Task 2):

```typescript
  /**
   * Enqueues a user turn. Always accepted and serialized through the mutex
   * queue. Events are written to {@link sseLog}; use {@link subscribe} to read.
   */
  enqueueUserTurn(userMessage: string): void {
    this.runTrackedTurn(userMessage);
  }

  /**
   * Starts a user turn only if the Agent has no pending/running turn (and no
   * in-flight title generation). Returns false when busy instead of queueing.
   *
   * The check-and-increment is atomic: there is no await between reading
   * {@link isRunning} and the increment inside {@link runTrackedTurn}, so in a
   * single-threaded runtime two concurrent claims cannot both succeed.
   */
  tryStartUserTurn(userMessage: string): boolean {
    if (this.isRunning) return false;
    this.runTrackedTurn(userMessage);
    return true;
  }

  /** Temporary wrapper — removed once all call sites migrate. */
  handleUserMessage(userMessage: string): void {
    this.enqueueUserTurn(userMessage);
  }

  private runTrackedTurn(userMessage: string): void {
    this.pendingTurnCount++;
    void this.runTurn(userMessage).finally(() => {
      this.pendingTurnCount--;
    });
  }
```

(c) Rewrite `isRunning` (currently lines 210-213):

```typescript
  /** Whether a turn is queued/running or a title generation is in flight. */
  get isRunning(): boolean {
    return this.pendingTurnCount > 0 || this.isGeneratingTitle;
  }
```

`abortController` stays on the Agent and is still assigned/cleared inside `runTurn`; it is now used only by `abort()`. Do not change `runTurn`'s body.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd apps/backend && bun run test agent.test.ts`
Expected: PASS — all existing tests plus the four new scheduling tests.

- [ ] **Step 5: Typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "feat: add pendingTurnCount and turn-scheduling APIs to Agent"
```

---

## Task 2: Migrate `Agent` call sites off `handleUserMessage` and remove it

Now migrate the service-layer caller and the Agent tests to the new APIs, then delete the temporary `handleUserMessage` wrapper. (The subagent-turn-runner caller is migrated separately in Task 3 because it needs the new `startTurn` policy plumbing; until Task 3 lands, the runner still references `handleUserMessage`.)

Because the runner is migrated in Task 3, we must NOT remove `handleUserMessage` until Task 3. So this task migrates `agent-session-service.ts` and `agent.test.ts` only, and leaves the wrapper in place. The wrapper removal happens at the end of Task 3.

**Files:**

- Modify: `apps/backend/src/services/agent-session/agent-session-service.ts:106`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts` (9 call sites)

- [ ] **Step 1: Migrate the service-layer call site**

In `apps/backend/src/services/agent-session/agent-session-service.ts`, change line 106 inside `sendCompletion`:

```typescript
const agent = await getStore(agentType).get(agentId);
if (!agent) return false;
agent.enqueueUserTurn(userMessage);
return true;
```

- [ ] **Step 2: Migrate the Agent test call sites**

In `apps/backend/src/agent-core/agent/agent.test.ts`, replace every `agent.handleUserMessage(` with `agent.enqueueUserTurn(`. There are 9 occurrences (lines 263, 527, 580, 625, 659, 683, 737, 768, 802). The argument strings are unchanged.

- [ ] **Step 3: Run the affected tests**

Run: `cd apps/backend && bun run test agent.test.ts`
Expected: PASS.

- [ ] **Step 4: Typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: no errors (the runner still uses `handleUserMessage`, which still exists).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/agent-session/agent-session-service.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "refactor: migrate Agent user-message call sites to enqueueUserTurn"
```

---

## Task 3: Inject a `startTurn` policy into `runSubagentTurn` and remove `handleUserMessage`

`runSubagentTurn` stops calling `handleUserMessage` directly. It receives `startTurn: () => boolean`. The turn sequence: attach abort listener → capture `startIndex` → if already aborted emit start + complete(failure) and return → call `startTurn()`; if `false`, return a busy failure WITHOUT emitting the start event or subscribing → emit start event → subscribe → `onTurnStarted?.()` → stream. The busy-failure message moves into this file. After this task, `handleUserMessage` has no callers and is removed from `Agent`.

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts:196-214`
- Modify: `apps/backend/src/agent-core/agent/agent.ts` (remove the `handleUserMessage` wrapper)
- Test: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Update the dispatch test mocks and add a busy-start test**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`:

(a) In `createForwardingMockSubagent`, rename the `handleUserMessage` method to `enqueueUserTurn` (the dispatch path now calls `enqueueUserTurn` via its `startTurn` policy):

```typescript
    handledMessages,
    enqueueUserTurn(message: string) {
      onHandleUserMessage?.();
      handledMessages.push(message);
    },
```

(b) In `createResumedTurnMockSubagent`, rename `handleUserMessage` to `enqueueUserTurn`:

```typescript
    handleUserMessage(message: string) {
      handledMessages.push(message);
    },
```

becomes

```typescript
    enqueueUserTurn(message: string) {
      handledMessages.push(message);
    },
```

(c) Update the three `runSubagentTurn(...)` calls in this file (the "forwards dispatched subagent events", "streams a resumed turn", and "does not start the subagent when the parent signal is already aborted" tests) to pass a `startTurn` policy that mirrors the real dispatch policy. For each call, add this field alongside `context/subagent/task/startEvent`:

```typescript
      startTurn: () => {
        subagent.enqueueUserTurn('Inspect the code');
        return true;
      },
```

Use the SAME task string that the test passes as `task` for that call:

- "forwards dispatched subagent events" → `'Inspect the code'`
- "streams a resumed turn from the current subagent log end" → `'Continue the work'`
- "does not start the subagent when the parent signal is already aborted" → `'Continue the work'`

For the already-aborted test, `startTurn` will never be invoked (the abort branch returns first), so `handledMessages` stays `[]` as the existing assertion expects.

(d) Add a new test at the end of the `dispatchAgentTool` describe block (after the already-aborted test, before the `subagent output event wrapping` describe) verifying that a `startTurn` returning `false` produces a busy failure with no events:

```typescript
it('returns a busy failure and emits no events when startTurn rejects', async () => {
  const events: unknown[] = [];
  const dispatchContext = createMockContext({
    workingDirectory: tmpDir,
    onSubAgentEvent: (event) => {
      events.push(event);
    },
  });
  const subagent = createForwardingMockSubagent(tmpDir);

  const result = await runSubagentTurn({
    context: dispatchContext,
    subagent,
    task: 'Continue the work',
    startEvent: {
      type: 'subagent-resume',
      agentId: subagent.id,
      task: 'Continue the work',
      agentType: SubAgentType.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: tmpDir,
    },
    startTurn: () => false,
  });

  expect(result.status).toBe('failure');
  expect(result.content).toContain('already running');
  expect(subagent.handledMessages).toEqual([]);
  expect(events).toEqual([]);
});
```

- [ ] **Step 2: Run the dispatch tests to verify the new test fails**

Run: `cd apps/backend && bun run test dispatch-agent-tool.test.ts`
Expected: FAIL — `RunSubagentTurnInput` has no `startTurn` property (type error) and/or the busy-start test fails because the runner does not yet honor `startTurn`.

- [ ] **Step 3: Rewrite `runSubagentTurn`**

Replace the body of `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`. `task` is removed from `RunSubagentTurnInput` entirely: the runner no longer forwards the message itself — the caller's `startTurn` closure and `startEvent` own the task. The new input interface:

```typescript
export interface RunSubagentTurnInput {
  readonly context: ToolExecutionContext;
  readonly subagent: Agent;
  readonly startEvent: SseSubagentDispatchEvent | SseSubagentResumeEvent;
  /**
   * Starts the subagent turn. Returns false when the subagent is busy and the
   * turn must be rejected. Dispatch always returns true; resume delegates to
   * the subagent's start-only-if-idle claim.
   */
  readonly startTurn: () => boolean;
  readonly onTurnStarted?: () => void;
}
```

Then rewrite the function. The key ordering: capture `startIndex` and check `aborted` BEFORE `startTurn()`; only subscribe and emit the start event after a successful start.

```typescript
export async function runSubagentTurn({
  context,
  subagent,
  task,
  startEvent,
  startTurn,
  onTurnStarted,
}: RunSubagentTurnInput): Promise<ToolExecuteResult<SubagentTurnResult>> {
  const onAbort = () => {
    subagent.abort();
  };
  context.signal.addEventListener('abort', onAbort, {once: true});

  try {
    const startIndex = subagent.getSseEventCount();

    if (context.signal.aborted) {
      context.onSubAgentEvent(startEvent);
      context.onSubAgentEvent({
        type: 'subagent-complete',
        agentId: subagent.id,
        status: 'failure',
      });

      return {
        data: {message: 'Subagent was aborted'},
        content: 'Subagent was aborted.',
        status: 'failure',
      };
    }

    if (!startTurn()) {
      const message =
        `Subagent ${subagent.id} is already running. ` +
        'Wait for it to finish before resuming it.';
      return {data: {message}, content: message, status: 'failure'};
    }

    context.onSubAgentEvent(startEvent);

    let lastReplyText = '';
    let completed = false;
    let failureMessage: string | null = null;
    const eventIter = subagent.subscribe({
      startIndex,
      signal: context.signal,
    });

    onTurnStarted?.();

    for await (const entry of eventIter) {
      const {event} = entry;
      context.onSubAgentEvent(buildSubagentOutputEvent(subagent.id, event));

      if (event.type === 'message-start' && event.role === 'assistant') {
        lastReplyText = '';
      }
      if (event.type === 'text-delta') {
        lastReplyText += event.content;
      }
      if (event.type === 'error') {
        failureMessage = event.message;
        break;
      }
      // Subagent's sseLog is never sealed; break on done to end iteration.
      // If the parent aborts, the reader ends silently without a done event.
      if (event.type === 'done') {
        completed = true;
        break;
      }
    }

    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: completed ? 'success' : 'failure',
    });

    if (completed) {
      const summary =
        lastReplyText ||
        'Subagent completed the task but produced no text summary.';
      return {data: {summary}, content: summary, status: 'success'};
    }

    if (failureMessage) {
      return {
        data: {message: `Subagent error: ${failureMessage}`},
        content: `Subagent error: ${failureMessage}`,
        status: 'failure',
      };
    }

    return {
      data: {message: 'Subagent was aborted'},
      content: 'Subagent was aborted.',
      status: 'failure',
    };
  } catch (error: unknown) {
    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: subagent.id,
      status: 'failure',
    });

    const message = error instanceof Error ? error.message : String(error);
    return {
      data: {message: `Subagent error: ${message}`},
      content: `Subagent error: ${message}`,
      status: 'failure',
    };
  } finally {
    context.signal.removeEventListener('abort', onAbort);
  }
}
```

Note: the destructure drops `task` accordingly:

```typescript
export async function runSubagentTurn({
  context,
  subagent,
  startEvent,
  startTurn,
  onTurnStarted,
}: RunSubagentTurnInput): Promise<ToolExecuteResult<SubagentTurnResult>> {
```

- [ ] **Step 4: Update `dispatch-agent-tool.ts` to pass `startTurn` and drop `task`**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`, replace the `runSubagentTurn({...})` call (lines 196-214) with:

```typescript
return runSubagentTurn({
  context,
  subagent,
  startEvent: {
    type: 'subagent-dispatch',
    agentId: subagent.id,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
  },
  // A freshly created subagent is never busy, so this always returns true.
  startTurn: () => {
    subagent.enqueueUserTurn(task);
    return true;
  },
  // Register after the turn starts so the registry does not briefly treat
  // a newly created subagent as idle on the normal dispatch path.
  onTurnStarted: () => {
    registerSubAgent(context, subagent, agentType);
  },
});
```

- [ ] **Step 5: Update the dispatch-test `runSubagentTurn` calls to drop `task`**

Back in `dispatch-agent-tool.test.ts`, remove the `task:` field from the three `runSubagentTurn({...})` calls updated in Step 1(c) (the `startTurn` closure and `startEvent.task` already carry the task). The new busy-start test from Step 1(d) also drops its top-level `task:` field. Each call now passes `context`, `subagent`, `startEvent`, `startTurn`, and optionally `onTurnStarted`.

- [ ] **Step 6: Remove the temporary `handleUserMessage` wrapper from `agent.ts`**

In `apps/backend/src/agent-core/agent/agent.ts`, delete the temporary wrapper added in Task 1:

```typescript
  /** Temporary wrapper — removed once all call sites migrate. */
  handleUserMessage(userMessage: string): void {
    this.enqueueUserTurn(userMessage);
  }
```

- [ ] **Step 7: Run the dispatch tests and typecheck**

Run: `cd apps/backend && bun run test dispatch-agent-tool.test.ts`
Expected: PASS — including the new busy-start test, the unchanged forwarding/resumed/aborted tests.

Run: `cd apps/backend && bun run typecheck`
Expected: no errors. (If `handleUserMessage` is referenced anywhere else, the compiler flags it now — there should be none left.)

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: inject startTurn policy into runSubagentTurn and remove handleUserMessage"
```

---

## Task 4: Simplify `resume-agent-tool` to use `tryStartUserTurn`

Remove the module-level `resumeClaims` machinery. `execute()` keeps UUID validation, registry lookup, then a single `runSubagentTurn` call with a `subagent-resume` start event and a `startTurn` policy delegating to `tryStartUserTurn`.

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`
- Test: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`

- [ ] **Step 1: Update the resume-test mocks and the busy/idle-claim tests**

In `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`:

(a) In `createMockSubagent`, replace the `handleUserMessage` method with `tryStartUserTurn`, honoring the `isRunning` override so a "busy" mock rejects the start:

```typescript
    handledMessages,
    tryStartUserTurn(message: string) {
      if (overrides.isRunning ?? false) return false;
      handledMessages.push(message);
      return true;
    },
```

(b) The existing "returns a busy failure for running subagents" test (isRunning: true) still applies — the `startTurn` policy will call `tryStartUserTurn`, which returns `false`, and `runSubagentTurn` returns the busy failure. Keep this test as-is; it asserts `result.content` contains `'already running'`.

(c) Replace the "rejects a second same-id resume while the first resume is claimed" test (lines 167-193) — which depended on the module-level `resumeClaims` set — with a test of the per-Agent claim. The mock must reflect that once a turn starts it becomes busy:

```typescript
it('rejects a second resume once the first has claimed the subagent', async () => {
  let releaseBlocker!: () => void;
  const blocker = new Promise<void>((resolve) => {
    releaseBlocker = resolve;
  });
  const context = createMockContext();

  // Mock whose claim flips isRunning true on first start, so a concurrent
  // second resume observes a busy subagent — no module-level claim set.
  let running = false;
  const handledMessages: string[] = [];
  const agentId = crypto.randomUUID();
  const subagent = {
    id: agentId,
    title: 'Reusable Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    tryStartUserTurn(message: string) {
      if (running) return false;
      running = true;
      handledMessages.push(message);
      return true;
    },
    abort: vi.fn(),
    async *subscribe() {
      await blocker;
      yield {nextIndex: 1, event: {type: 'done', reason: 'complete'}};
    },
    getWorkingDirectory() {
      return '/workspace/project';
    },
    getThinkingLevel() {
      return 'none' as const;
    },
    getSseEventCount() {
      return 0;
    },
    toSnapshot() {
      throw new Error('runSubagentTurn should not snapshot subagents');
    },
  } as unknown as Agent & {handledMessages: string[]};
  Object.defineProperty(subagent, 'isRunning', {get: () => running});
  context.subagentRegistry.register(subagent, SubAgentType.GENERAL);

  const first = resumeAgentTool.execute(
    {agentId: subagent.id, task: 'First'},
    context,
  );
  await Promise.resolve();

  const second = await resumeAgentTool.execute(
    {agentId: subagent.id, task: 'Second'},
    context,
  );

  releaseBlocker();
  await first;

  expect(second.status).toBe('failure');
  expect(second.content).toContain('already running');
  expect(handledMessages).toEqual(['First']);
});
```

(d) The "runs a follow-up turn on a registered idle subagent" test stays — its mock now exposes `tryStartUserTurn` from the change in (a), and it still asserts `subagent.handledMessages` equals `['Continue analysis']` plus the `subagent-resume` / `subagent-output` / `subagent-complete` event sequence.

- [ ] **Step 2: Run the resume tests to verify failure**

Run: `cd apps/backend && bun run test resume-agent-tool.test.ts`
Expected: FAIL — the mock no longer has `handleUserMessage`, and the rewritten claim test exercises behavior the current `resume-agent-tool.ts` does not yet implement via `startTurn`.

- [ ] **Step 3: Rewrite `resume-agent-tool.ts`**

Replace the entire file `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts` with:

```typescript
import {agentIdSchema} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteFailureResult,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  runSubagentTurn,
  type SubagentTurnResult,
} from './subagent-turn-runner.js';

const parameters = z.object({
  agentId: z.string().min(1).describe('Subagent id to resume.'),
  task: z.string().min(1).describe('Follow-up task for the subagent.'),
});

function failure(message: string): ToolExecuteFailureResult {
  return {data: {message}, content: message, status: 'failure'};
}

/** Tool that resumes an idle live subagent with a follow-up task. */
export const resumeAgentTool: ToolDefinition<
  typeof parameters,
  SubagentTurnResult
> = {
  name: 'resume_agent',
  displayName: 'Resume Agent',
  description: 'Resumes a subagent by sending it a follow-up task.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<SubagentTurnResult>> {
    const parsedAgentId = agentIdSchema.safeParse(args.agentId);
    if (!parsedAgentId.success) {
      return failure(
        `Invalid subagent id "${args.agentId}"; id must be a UUID.`,
      );
    }

    const agentId = parsedAgentId.data;
    const handle = context.subagentRegistry.get(agentId);
    if (!handle) {
      return failure(
        `Subagent ${agentId} is not available to resume. Dispatch a new subagent if needed.`,
      );
    }

    return runSubagentTurn({
      context,
      subagent: handle.agent,
      startEvent: {
        type: 'subagent-resume',
        agentId: handle.agent.id,
        task: args.task,
        agentType: handle.agentType,
        thinkingLevel: handle.agent.getThinkingLevel(),
        workingDirectory: handle.agent.getWorkingDirectory(),
      },
      startTurn: () => handle.agent.tryStartUserTurn(args.task),
    });
  },
};
```

- [ ] **Step 4: Run the resume tests to verify they pass**

Run: `cd apps/backend && bun run test resume-agent-tool.test.ts`
Expected: PASS — invalid-id, unknown-id, busy, idle-success, and the rewritten concurrent-claim test.

- [ ] **Step 5: Typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts
git commit -m "refactor: replace resumeClaims with per-Agent tryStartUserTurn claim"
```

---

## Task 5: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `cd apps/backend && bun run test`
Expected: PASS — all suites green. Pay attention to `agent.test.ts`, `dispatch-agent-tool.test.ts`, `resume-agent-tool.test.ts`, and any `agent-session` / `subagent-registry` / `agent-store` suites that exercise `isRunning`.

- [ ] **Step 2: Typecheck the whole backend**

Run: `cd apps/backend && bun run typecheck`
Expected: no errors.

- [ ] **Step 3: Lint**

Run: `cd apps/backend && bun run lint`
Expected: no errors. In particular, confirm no `no-unused-vars` from the removed `task` parameter or removed `resumeClaims` helpers.

- [ ] **Step 4: Confirm `handleUserMessage` and `resumeClaims` are fully gone**

Run: `grep -rn "handleUserMessage\|resumeClaims" apps/backend/src`
Expected: no matches.

- [ ] **Step 5: Final commit (if lint/format produced changes)**

Only if the previous steps modified files (e.g. formatter). Otherwise skip.

```bash
git add -A
git commit -m "chore: finalize agent turn scheduling cleanup"
```

---

## Notes on consumers that need no code change

Per the spec, broadening `isRunning` is consistent with every consumer:

- `list-resumable-agents-tool.ts:32` — a queued subagent now reports `running` rather than `idle`. More accurate; no change.
- `subagent-registry.ts:99` (`isEvictable`) and `agent-store.ts:88` (`evictIfNeeded`) — an Agent with a queued turn is no longer evictable, closing a latent startup-window eviction race. No change.

These are intentionally left untouched.
