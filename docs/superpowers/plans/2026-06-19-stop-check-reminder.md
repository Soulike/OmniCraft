# Stop-Check Reminders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the agent loop run extensible checks at the moment a turn would end, and inject a hidden reminder to the LLM when a check is unsatisfied (first check: incomplete TODOs), visible to the LLM and persisted for debugging but never rendered in the UI.

**Architecture:** A new `stop-check-reminder` SSE event carries the reminder; the frontend ignores it, so it stays hidden live and on reload (history reload is pure SSE replay). A per-agent-type `StopCheck[]` is plumbed through `AgentOptions` → `Agent` → `RunAgentTurnInput`. The turn runner evaluates checks when the LLM returns no tool calls; if any fire, it injects a `<system-reminder>` user message via `LlmSession.sendReminder` and continues the loop, bounded by the existing `maxRounds`. A shared `advanceTurn` helper removes the consume/abort/usage duplication.

**Tech Stack:** TypeScript (nodenext), Bun (package manager + runtime, but Node APIs only), Zod (SSE schemas), Vitest (`bun run test`), Koa backend, React frontend.

**Spec:** `docs/superpowers/specs/2026-06-19-stop-check-reminder-design.md`

**Conventions (from CLAUDE.md):**

- Run tests with `bun run test` (NEVER `bun test`).
- Relative imports use `.js` extension; cross-module imports use `@/*`.
- No `console`; backend uses `logger` from `@/logger.js` outside request context.
- No `any`; no default exports (backend); early-return style.
- Commit messages follow Conventional Commits. Pre-commit hook runs prettier/lint — do not re-verify compile/test just because it formatted files.

---

## File Structure

**Create:**

- `apps/backend/src/agent-core/agent/stop-checks/types.ts` — `StopCheck` / `StopCheckContext` interfaces.
- `apps/backend/src/agent-core/agent/stop-checks/todo-stop-check.ts` — `todoStopCheck` implementation.
- `apps/backend/src/agent-core/agent/stop-checks/index.ts` — barrel re-exporting the interface and checks.
- `apps/backend/src/agent-core/agent/stop-checks/todo-stop-check.test.ts` — unit test for the TODO check.

**Modify:**

- `packages/sse-events/src/schema.ts` — add `sseStopCheckReminderEventSchema` + type; add to base-event array.
- `packages/sse-events/src/index.ts` — export the new schema + type.
- `apps/backend/src/agent-core/llm-session/llm-session.ts` — add `sendReminder`.
- `apps/backend/src/agent-core/agent/types.ts` — add `stopChecks` to `AgentOptions`.
- `apps/backend/src/agent-core/agent/agent.ts` — store + forward `stopChecks`.
- `apps/backend/src/agent-core/agent/agent-turn-runner.ts` — `advanceTurn` helper, `stopChecks` input, `evaluateStopChecks`, loop rewrite.
- `apps/backend/src/agent/agents/main-agent/main-agent.ts` — `stopChecks: [todoStopCheck]`.
- `apps/backend/src/agent/agents/coding-agent/coding-agent.ts` — `stopChecks: [todoStopCheck]`.
- `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` — `stopChecks: []`.
- `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts` — `stopChecks: []`.
- `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts` — ignore `stop-check-reminder`.

**Test (modify):**

- `apps/backend/src/agent-core/agent/agent-turn-runner.test.ts` — reminder behavior, merged checks, max-rounds termination, no `message-start`, `stopChecks` default.
- `apps/backend/src/agent-core/llm-session/llm-session.test.ts` — `sendReminder` wraps + records.

---

## Task 1: Add the `stop-check-reminder` SSE event

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `packages/sse-events/src/index.ts`

- [ ] **Step 1: Add the schema and type**

In `packages/sse-events/src/schema.ts`, immediately after the `sseTodoUpdateEventSchema` / `SseTodoUpdateEvent` block (around line 145, after the "Todo update event" section), add:

```ts
// ---------------------------------------------------------------------------
// Stop-check reminder event
// ---------------------------------------------------------------------------

/** A hidden reminder injected when a stop-check blocks the turn from ending.
 *  Persisted and replayed for debugging, but ignored by the frontend so it
 *  never renders in the UI. `content` is the unwrapped reminder text; the
 *  `<system-reminder>` wrapper is applied only when injecting to the LLM. */
export const sseStopCheckReminderEventSchema = z.object({
  type: z.literal('stop-check-reminder'),
  checkNames: z.array(z.string()),
  content: z.string(),
  messageId: z.string(),
  createdAt: z.number(),
});
export type SseStopCheckReminderEvent = z.infer<
  typeof sseStopCheckReminderEventSchema
>;
```

- [ ] **Step 2: Add the schema to the base-event array**

In `packages/sse-events/src/schema.ts`, add `sseStopCheckReminderEventSchema` to the `sseBaseEventSchemas` array (the `const sseBaseEventSchemas = [...] as const;` block). Insert it after `sseTodoUpdateEventSchema`:

```ts
  sseTodoUpdateEventSchema,
  sseStopCheckReminderEventSchema,
  sseContextCompactionStartEventSchema,
```

Adding it to `sseBaseEventSchemas` includes it in both `sseBaseEventSchema` and `sseEventSchema` (the full union), and lets it appear inside `subagent-output` wrappers — correct, since subagents run the same loop.

- [ ] **Step 3: Export from the barrel**

In `packages/sse-events/src/index.ts`, add `SseStopCheckReminderEvent` to the `export type {...}` block (alphabetical, after `SseSubagentResumeEvent` / before `SseTextDeltaEvent`):

```ts
  SseStopCheckReminderEvent,
```

and add `sseStopCheckReminderEventSchema` to the `export {...}` value block (after `sseSessionTitleEventSchema`):

```ts
  sseStopCheckReminderEventSchema,
```

- [ ] **Step 4: Typecheck the package**

Run: `bun run --filter @omnicraft/sse-events build` (or the package's typecheck/build script — check `packages/sse-events/package.json` `scripts`).
Expected: PASS, no type errors.

- [ ] **Step 5: Commit**

```bash
git add packages/sse-events/src/schema.ts packages/sse-events/src/index.ts
git commit -m "feat(sse-events): add stop-check-reminder event"
```

---

## Task 2: Add the `StopCheck` interface and `todoStopCheck`

**Files:**

- Create: `apps/backend/src/agent-core/agent/stop-checks/types.ts`
- Create: `apps/backend/src/agent-core/agent/stop-checks/todo-stop-check.ts`
- Create: `apps/backend/src/agent-core/agent/stop-checks/index.ts`
- Test: `apps/backend/src/agent-core/agent/stop-checks/todo-stop-check.test.ts`

- [ ] **Step 1: Write the interface**

Create `apps/backend/src/agent-core/agent/stop-checks/types.ts`:

```ts
import type {AgentRuntimeState} from '../agent-runtime-state.js';

/** Read-only context handed to a stop-check at the turn-end boundary. */
export interface StopCheckContext {
  readonly runtimeState: AgentRuntimeState;
}

/**
 * A check evaluated when the agent would end its turn. Returns reminder text to
 * block the turn from ending (the text is injected to the LLM), or null to allow
 * it. May be sync or async; async checks (e.g. shelling out to `git status`) are
 * supported.
 */
export interface StopCheck {
  readonly name: string;
  evaluate(ctx: StopCheckContext): string | null | Promise<string | null>;
}
```

- [ ] **Step 2: Write the failing test for `todoStopCheck`**

Create `apps/backend/src/agent-core/agent/stop-checks/todo-stop-check.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {AgentRuntimeState} from '../agent-runtime-state.js';
import {todoStopCheck} from './todo-stop-check.js';

function runtimeStateWithTodos(
  todos: readonly {subject: string; description: string; completed: boolean}[],
): AgentRuntimeState {
  const state = new AgentRuntimeState('/workspace/project');
  const context = state.buildToolExecutionContext({
    callId: 'c1',
    agentId: 'a1',
    sessionsDir: null,
    subagentRegistry: {} as never,
    availableSkills: new Map(),
    workingDirectory: '/workspace/project',
    signal: new AbortController().signal,
    onSubAgentEvent: () => undefined,
    getConfig: () => Promise.reject(new Error('unused')),
    getLightConfig: () => Promise.reject(new Error('unused')),
  });
  context.todoStore.append(
    todos.map((t) => ({subject: t.subject, description: t.description})),
  );
  todos.forEach((t, index) => {
    if (t.completed) context.todoStore.update(index, {status: 'completed'});
  });
  return state;
}

describe('todoStopCheck', () => {
  it('returns null when there are no todos', async () => {
    const state = new AgentRuntimeState('/workspace/project');
    expect(await todoStopCheck.evaluate({runtimeState: state})).toBeNull();
  });

  it('returns null when all todos are completed', async () => {
    const state = runtimeStateWithTodos([
      {subject: 'a', description: 'da', completed: true},
    ]);
    expect(await todoStopCheck.evaluate({runtimeState: state})).toBeNull();
  });

  it('returns a reminder listing unfinished todos', async () => {
    const state = runtimeStateWithTodos([
      {subject: 'done one', description: 'd1', completed: true},
      {subject: 'open one', description: 'd2', completed: false},
    ]);
    const reminder = await todoStopCheck.evaluate({runtimeState: state});
    expect(reminder).not.toBeNull();
    expect(reminder).toContain('1 unfinished');
    expect(reminder).toContain('open one');
    expect(reminder).not.toContain('done one');
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `bun run test todo-stop-check`
Expected: FAIL — `Cannot find module './todo-stop-check.js'`.

- [ ] **Step 4: Implement `todoStopCheck`**

Create `apps/backend/src/agent-core/agent/stop-checks/todo-stop-check.ts`:

```ts
import type {StopCheck} from './types.js';

export const todoStopCheck: StopCheck = {
  name: 'incomplete-todos',
  evaluate({runtimeState}) {
    const todos = runtimeState.listTodos();
    if (todos.length === 0) return null;
    const unfinished = todos.filter((todo) => todo.status !== 'completed');
    if (unfinished.length === 0) return null;
    return (
      `Note: the TODO list still has ${unfinished.length} unfinished ` +
      `item(s):\n` +
      unfinished
        .map((todo) => `- [${todo.status}] ${todo.subject}`)
        .join('\n') +
      `\nThis is just a reminder of the current state. If they are done, ` +
      `update their status; if they are intentionally being left for later ` +
      `or are no longer needed, you can proceed.`
    );
  },
};
```

- [ ] **Step 5: Write the barrel**

Create `apps/backend/src/agent-core/agent/stop-checks/index.ts`:

```ts
export type {StopCheck, StopCheckContext} from './types.js';
export {todoStopCheck} from './todo-stop-check.js';
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `bun run test todo-stop-check`
Expected: PASS (3 tests).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core/agent/stop-checks/
git commit -m "feat(agent): add StopCheck interface and todoStopCheck"
```

---

## Task 3: Add `LlmSession.sendReminder`

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Test: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/backend/src/agent-core/llm-session/llm-session.test.ts`, add a test. Match the existing harness in that file (it spies on `llmApi.streamCompletion` and drains the returned stream). Add near the other `sendUserMessage` tests:

```ts
it('sendReminder wraps content in <system-reminder> and records a user message', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  const streamSpy = vi
    .spyOn(llmApi, 'streamCompletion')
    .mockReturnValue(normalStream());
  const session = new LlmSession(() => Promise.resolve(MAIN_CONFIG));

  const result = session.sendReminder('two items left', [], '', 'none');
  await drain(result.stream);

  const sentMessages = streamSpy.mock.calls[0]?.[0].messages ?? [];
  const reminder = sentMessages.find((m) => m.role === 'user');
  expect(reminder?.content).toBe(
    '<system-reminder>\ntwo items left\n</system-reminder>',
  );
  expect(typeof result.messageId).toBe('string');
  expect(session.getMessages().some((m) => m.id === result.messageId)).toBe(
    true,
  );
});
```

Note: reuse this file's existing `normalStream()`, `drain()`, and `MAIN_CONFIG` helpers — they already exist in `llm-session.test.ts` (confirm names at top of the file; if `MAIN_CONFIG` is named differently, use that name).

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test llm-session`
Expected: FAIL — `session.sendReminder is not a function`.

- [ ] **Step 3: Implement `sendReminder`**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, add a method right after `sendUserMessage` (which ends around line 121), mirroring its shape:

```ts
  /**
   * Injects a hidden reminder as a `user` message wrapped in
   * `<system-reminder>` and continues the conversation. Used by the turn runner
   * when a stop-check blocks the turn from ending. The reminder is visible to
   * the LLM but is surfaced to clients via a `stop-check-reminder` SSE event
   * (not `message-start`), so it never renders in the UI.
   */
  sendReminder(
    content: string,
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
    signal?: AbortSignal,
  ): SendUserMessageResult {
    const reminderMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user' as const,
      content: `<system-reminder>\n${content}\n</system-reminder>`,
    };
    return {
      stream: this.sendMessages(
        [reminderMessage],
        tools,
        systemPrompt,
        thinkingLevel,
        signal,
      ),
      messageId: reminderMessage.id,
      createdAt: reminderMessage.createdAt,
    };
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test llm-session`
Expected: PASS (including the new test).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/llm-session.test.ts
git commit -m "feat(agent): add LlmSession.sendReminder for hidden reminders"
```

---

## Task 4: Extract the `advanceTurn` helper (pure refactor)

This is a behavior-preserving refactor of the existing two consume sites. Existing turn-runner tests must stay green; no new behavior.

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`

- [ ] **Step 1: Add imports**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`, ensure these types are imported. `LlmToolCall` is already imported from `../llm-api/index.js` (line 13). Add `LlmSessionEventStream` to the existing `import type {LlmSession, ToolResult}` line (line 14) so it reads:

```ts
import type {
  LlmSession,
  LlmSessionEventStream,
  ToolResult,
} from '../llm-session/index.js';
```

Add `AgentEvent` to the `./types.js` import (line 30):

```ts
import type {AgentEvent, AgentEventStream} from './types.js';
```

- [ ] **Step 2: Add the `advanceTurn` private generator**

In the `AgentTurnRunner` class, add this method (place it just after `run`, before `emitAbortCompletion`):

```ts
  private async *advanceTurn(
    stream: LlmSessionEventStream,
    input: RunAgentTurnInput,
  ): AsyncGenerator<
    AgentEvent,
    {aborted: boolean; toolCalls: LlmToolCall[]},
    undefined
  > {
    try {
      const toolCalls = yield* agentLlmStreamTranslator.consume(stream);
      yield await agentUsageReporter.buildUsageUpdateEvent(input);
      return {aborted: false, toolCalls};
    } catch (error: unknown) {
      if (input.signal.aborted) return {aborted: true, toolCalls: []};
      throw error;
    }
  }
```

- [ ] **Step 3: Migrate the initial consume site**

Replace the initial consume block (currently lines ~93–108: the `let toolCalls; try { toolCalls = yield* ...consume(userStream); } catch ... ` plus the `yield await agentUsageReporter...` line) with:

```ts
const initial = yield * this.advanceTurn(userStream, input);
if (initial.aborted) {
  yield *
    this.emitAbortCompletion({
      inFlightToolCalls,
      tools: toolDefs,
      systemPrompt,
      input,
    });
  return;
}
let toolCalls = initial.toolCalls;
```

(Delete the now-redundant standalone `yield await agentUsageReporter.buildUsageUpdateEvent(input);` that followed the old try/catch — `advanceTurn` now yields it.)

- [ ] **Step 4: Migrate the in-loop consume site**

Replace the in-loop consume block (currently lines ~236–259: the `try { toolCalls = yield* ...consume(submitToolResults(...)); } catch ...` plus the trailing `yield await agentUsageReporter...`) with:

```ts
const next =
  yield *
  this.advanceTurn(
    input.llmSession.submitToolResults(
      orderedResults,
      toolDefs,
      systemPrompt,
      input.thinkingLevel,
      input.signal,
    ),
    input,
  );
if (next.aborted) {
  yield *
    this.emitAbortCompletion({
      inFlightToolCalls,
      tools: toolDefs,
      systemPrompt,
      input,
    });
  return;
}
toolCalls = next.toolCalls;
```

- [ ] **Step 5: Run the existing turn-runner tests**

Run: `bun run test agent-turn-runner`
Expected: PASS — all existing tests green (pure refactor, no behavior change).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-turn-runner.ts
git commit -m "refactor(agent): extract advanceTurn to dedupe consume/abort/usage"
```

---

## Task 5: Plumb `stopChecks` through options and turn input

Plumbing only, defaulting to an empty list. No reminder behavior yet — wiring stays inert until Task 6.

**Files:**

- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`

- [ ] **Step 1: Add `stopChecks` to `AgentOptions`**

In `apps/backend/src/agent-core/agent/types.ts`, add an import at the top:

```ts
import type {StopCheck} from './stop-checks/index.js';
```

Add the field to the `AgentOptions` interface (after `skillRegistries`):

```ts
  readonly stopChecks: readonly StopCheck[];
```

- [ ] **Step 2: Add `stopChecks` to `RunAgentTurnInput`**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`, add the import:

```ts
import type {StopCheck} from './stop-checks/index.js';
```

Add the field to the `RunAgentTurnInput` interface (after `skillRegistries`):

```ts
  readonly stopChecks: readonly StopCheck[];
```

- [ ] **Step 3: Store and forward `stopChecks` in `Agent`**

In `apps/backend/src/agent-core/agent/agent.ts`:

Add a private field declaration alongside the other registry fields (near line 52, where `toolRegistries`/`skillRegistries` are declared — search for `private readonly skillRegistries`):

```ts
  private readonly stopChecks: readonly StopCheck[];
```

Add the import at the top of the file (with the other `./` type imports):

```ts
import type {StopCheck} from './stop-checks/index.js';
```

Assign it in the constructor, right after `this.skillRegistries = options.skillRegistries;`:

```ts
this.stopChecks = options.stopChecks;
```

Forward it in `runAgentLoop`'s `agentTurnRunner.run({...})` call, after `skillRegistries: this.skillRegistries,`:

```ts
      stopChecks: this.stopChecks,
```

- [ ] **Step 4: Default `stopChecks` in the test helper**

In `apps/backend/src/agent-core/agent/agent-turn-runner.test.ts`, add `stopChecks: []` to the `defaults` object inside `createInput` (after `skillRegistries: [],`):

```ts
    stopChecks: [],
```

This keeps every existing test compiling with the new required field.

- [ ] **Step 5: Typecheck — every `AgentOptions` construction now needs `stopChecks`**

Run: `bun run test agent-turn-runner`
Expected: the turn-runner tests PASS. The backend will NOT fully typecheck yet because `MainAgent`, `CodingAgent`, `ExploreSubAgent`, `GeneralSubAgent` construct `AgentOptions` without `stopChecks` — that is fixed in Task 7. If your runner uses strict project-wide typecheck in the test command, expect those four files to error; that is expected and resolved in Task 7. Proceed.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/types.ts apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent-turn-runner.ts apps/backend/src/agent-core/agent/agent-turn-runner.test.ts
git commit -m "feat(agent): plumb stopChecks through AgentOptions and turn input"
```

---

## Task 6: Integrate the stop-check loop in the turn runner

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`
- Test: `apps/backend/src/agent-core/agent/agent-turn-runner.test.ts`

- [ ] **Step 1: Add a test helper that builds a runtime state with an unfinished todo**

In `apps/backend/src/agent-core/agent/agent-turn-runner.test.ts`, add near the other helpers (top of file, after imports). It mirrors the todo-store access used elsewhere:

```ts
function runtimeStateWithUnfinishedTodo(
  workingDirectory: string,
): AgentRuntimeState {
  const state = new AgentRuntimeState(workingDirectory);
  const context = state.buildToolExecutionContext({
    callId: 'seed',
    agentId: 'agent-1',
    sessionsDir: null,
    subagentRegistry: new SubagentRegistry(),
    availableSkills: new Map(),
    workingDirectory,
    signal: new AbortController().signal,
    onSubAgentEvent: () => undefined,
    getConfig: () => Promise.resolve(MAIN_CONFIG),
    getLightConfig: () => Promise.resolve(MAIN_CONFIG),
  });
  context.todoStore.append([{subject: 'finish me', description: 'pending'}]);
  return state;
}
```

- [ ] **Step 2: Write the failing tests**

Add these tests inside the `describe('AgentTurnRunner', ...)` block. They use a stub `StopCheck` and the existing `textCompletionStream` / `toolCallCompletionStream` helpers.

```ts
it('emits a stop-check-reminder and continues when a check fires', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion')
    .mockReturnValueOnce(textCompletionStream('first stop'))
    .mockReturnValueOnce(textCompletionStream('after reminder'));

  let calls = 0;
  const onceCheck = {
    name: 'once',
    evaluate: () => (calls++ === 0 ? 'please reconsider' : null),
  };

  const events = await collectAll(
    agentTurnRunner.run(createInput({stopChecks: [onceCheck]})),
  );

  const reminder = events.find((e) => e.type === 'stop-check-reminder');
  expect(reminder).toMatchObject({
    type: 'stop-check-reminder',
    checkNames: ['once'],
    content: 'please reconsider',
  });
  expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
});

it('does not emit a message-start for the reminder round', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion')
    .mockReturnValueOnce(textCompletionStream('first stop'))
    .mockReturnValueOnce(textCompletionStream('after reminder'));

  let calls = 0;
  const onceCheck = {
    name: 'once',
    evaluate: () => (calls++ === 0 ? 'reconsider' : null),
  };

  const events = await collectAll(
    agentTurnRunner.run(createInput({stopChecks: [onceCheck]})),
  );

  const userStarts = events.filter(
    (e) => e.type === 'message-start' && e.role === 'user',
  );
  // Only the initial user message starts; the reminder round emits none.
  expect(userStarts).toHaveLength(1);
});

it('merges multiple firing checks into one reminder', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion')
    .mockReturnValueOnce(textCompletionStream('first stop'))
    .mockReturnValueOnce(textCompletionStream('after reminder'));

  let aCalls = 0;
  let bCalls = 0;
  const checkA = {name: 'a', evaluate: () => (aCalls++ === 0 ? 'alpha' : null)};
  const checkB = {name: 'b', evaluate: () => (bCalls++ === 0 ? 'beta' : null)};

  const events = await collectAll(
    agentTurnRunner.run(createInput({stopChecks: [checkA, checkB]})),
  );

  const reminder = events.find((e) => e.type === 'stop-check-reminder');
  expect(reminder).toMatchObject({
    checkNames: ['a', 'b'],
    content: 'alpha\n\nbeta',
  });
});

it('logs and skips a rejecting check, still merging others', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion')
    .mockReturnValueOnce(textCompletionStream('first stop'))
    .mockReturnValueOnce(textCompletionStream('after reminder'));

  let good = 0;
  const boom = {
    name: 'boom',
    evaluate: () => {
      throw new Error('check failed');
    },
  };
  const ok = {name: 'ok', evaluate: () => (good++ === 0 ? 'still here' : null)};

  const events = await collectAll(
    agentTurnRunner.run(createInput({stopChecks: [boom, ok]})),
  );

  const reminder = events.find((e) => e.type === 'stop-check-reminder');
  expect(reminder).toMatchObject({checkNames: ['ok'], content: 'still here'});
});

it('keeps reminding an always-firing check until max rounds', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
    textCompletionStream('no tools'),
  );

  const always = {name: 'always', evaluate: () => 'still not done'};

  const events = await collectAll(
    agentTurnRunner.run(
      createInput({stopChecks: [always], getMaxToolRounds: () => 2}),
    ),
  );

  expect(events.at(-1)).toMatchObject({
    type: 'done',
    reason: 'max_rounds_reached',
  });
  const reminders = events.filter((e) => e.type === 'stop-check-reminder');
  expect(reminders).toHaveLength(2);
});

it('does not emit a reminder when no check fires', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(textCompletionStream());

  const never = {name: 'never', evaluate: () => null};

  const events = await collectAll(
    agentTurnRunner.run(createInput({stopChecks: [never]})),
  );

  expect(events.some((e) => e.type === 'stop-check-reminder')).toBe(false);
  expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `bun run test agent-turn-runner`
Expected: FAIL — the new tests fail (no `stop-check-reminder` event emitted; the runner currently ends the turn directly).

- [ ] **Step 4: Add the `logger` import and `evaluateStopChecks` helper**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`, add the import near the top (after the `@/helpers/...` import):

```ts
import {logger} from '@/logger.js';
```

Add the helper method to the class (place it after `advanceTurn`):

```ts
  private async evaluateStopChecks(
    stopChecks: readonly StopCheck[],
    runtimeState: AgentRuntimeState,
  ): Promise<{checkNames: string[]; content: string} | null> {
    const settled = await Promise.allSettled(
      stopChecks.map(async (check) => ({
        name: check.name,
        content: await check.evaluate({runtimeState}),
      })),
    );

    const fired: {name: string; content: string}[] = [];
    for (const [index, result] of settled.entries()) {
      if (result.status === 'rejected') {
        logger.error(
          {err: result.reason, check: stopChecks[index].name},
          'Stop-check evaluation failed; skipping',
        );
        continue;
      }
      if (result.value.content !== null) {
        fired.push({name: result.value.name, content: result.value.content});
      }
    }

    if (fired.length === 0) return null;
    return {
      checkNames: fired.map((entry) => entry.name),
      content: fired.map((entry) => entry.content).join('\n\n'),
    };
  }
```

Add the `AgentRuntimeState` type import if not already present (check existing imports; it is imported as `import type {AgentRuntimeState} from './agent-runtime-state.js';` at line 18 — already there).

- [ ] **Step 5: Rewrite the loop to `while (true)` with the stop-check branch**

Replace the existing `let round = 0;\n    while (toolCalls.length > 0) {` loop header and its body structure. The loop currently begins with the abort check, then `round++`/maxRounds, then tool execution, then the (already-migrated) `advanceTurn` for `submitToolResults`. Restructure so the top of the loop handles the no-tool-calls case:

Change the loop opening from:

```ts
    let round = 0;
    while (toolCalls.length > 0) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      round++;
      if (round > maxRounds) {
        yield* this.emitDoneAfterTurn({
          reason: 'max_rounds_reached',
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }
```

to:

```ts
    let round = 0;
    while (true) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      if (toolCalls.length === 0) {
        const reminder = await this.evaluateStopChecks(
          input.stopChecks,
          input.runtimeState,
        );
        if (!reminder) break;

        round++;
        if (round > maxRounds) {
          yield* this.emitDoneAfterTurn({
            reason: 'max_rounds_reached',
            tools: toolDefs,
            systemPrompt,
            input,
          });
          return;
        }

        const {stream, messageId, createdAt} = input.llmSession.sendReminder(
          reminder.content,
          toolDefs,
          systemPrompt,
          input.thinkingLevel,
          input.signal,
        );
        yield {
          type: 'stop-check-reminder',
          checkNames: reminder.checkNames,
          content: reminder.content,
          messageId,
          createdAt,
        } satisfies SseStopCheckReminderEvent;

        const reminded = yield* this.advanceTurn(stream, input);
        if (reminded.aborted) {
          yield* this.emitAbortCompletion({
            inFlightToolCalls,
            tools: toolDefs,
            systemPrompt,
            input,
          });
          return;
        }
        toolCalls = reminded.toolCalls;
        continue;
      }

      round++;
      if (round > maxRounds) {
        yield* this.emitDoneAfterTurn({
          reason: 'max_rounds_reached',
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }
```

Leave the rest of the loop body (tool execution, SSE pumping, the migrated `submitToolResults` `advanceTurn` call from Task 4, and `toolCalls = next.toolCalls;`) unchanged.

After the loop, the existing final `yield* this.emitDoneAfterTurn({reason: 'complete', ...});` remains and now runs when `break` fires (all checks pass).

- [ ] **Step 6: Add the `SseStopCheckReminderEvent` import**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`, add `SseStopCheckReminderEvent` to the existing `import type {...} from '@omnicraft/sse-events';` block (lines 2–8):

```ts
  SseStopCheckReminderEvent,
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `bun run test agent-turn-runner`
Expected: PASS — all existing tests plus the six new ones.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-turn-runner.ts apps/backend/src/agent-core/agent/agent-turn-runner.test.ts
git commit -m "feat(agent): inject hidden stop-check reminders before ending a turn"
```

---

## Task 7: Wire `stopChecks` per agent type

**Files:**

- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`
- Modify: `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`

- [ ] **Step 1: MainAgent — add `todoStopCheck`**

In `apps/backend/src/agent/agents/main-agent/main-agent.ts`, add the import (with the other `@/agent-core/agent/...` imports):

```ts
import {todoStopCheck} from '@/agent-core/agent/stop-checks/index.js';
```

In the `AgentOptions` object passed to `super(...)`, add after `skillRegistries: [coreSkillRegistry],`:

```ts
        stopChecks: [todoStopCheck],
```

- [ ] **Step 2: CodingAgent — add `todoStopCheck`**

In `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`, add the same import and the same `stopChecks: [todoStopCheck],` line after `skillRegistries: [coreSkillRegistry],`.

- [ ] **Step 3: ExploreSubAgent — empty list**

In `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`, add after `skillRegistries: [coreSkillRegistry],`:

```ts
      stopChecks: [],
```

(No import needed — read-only agent has no TODO tool, so no check.)

- [ ] **Step 4: GeneralSubAgent — empty list**

In `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`, add after `skillRegistries: [coreSkillRegistry],`:

```ts
      stopChecks: [],
```

- [ ] **Step 5: Typecheck the backend**

Run: `bun run test` (from `apps/backend`, or the repo script that typechecks + tests the backend).
Expected: PASS — all four `AgentOptions` constructions now satisfy the required `stopChecks` field; full backend test suite green.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/agents/
git commit -m "feat(agent): enable todo stop-check for main/coding agents only"
```

---

## Task 8: Frontend ignores the reminder event

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`
- Test: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`, add a test that feeds a `stop-check-reminder` event and asserts no user bubble renders for it. Follow the file's existing pattern (it builds a `ChatSessionApi` via `createApi([...events])` and renders `StreamingMessageDisplay`). Model it on an existing "renders a user message" test in that file, adding the reminder event and asserting its content is absent:

```ts
it('ignores stop-check-reminder events (no bubble rendered)', async () => {
  const api = createApi([
    {
      type: 'message-start',
      role: 'user',
      messageId: 'u1',
      createdAt: 1,
      content: 'hello',
    },
    {
      type: 'stop-check-reminder',
      checkNames: ['incomplete-todos'],
      content: 'SECRET REMINDER TEXT',
      messageId: 'r1',
      createdAt: 2,
    },
    {type: 'done', reason: 'complete'},
  ]);

  // render via the same harness the other tests use (renderStreamChat/
  // StreamingMessageDisplay wrapped in providers + api context)
  renderWithApi(api);

  await waitFor(() => {
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
  expect(screen.queryByText('SECRET REMINDER TEXT')).not.toBeInTheDocument();
});
```

If the file lacks a `renderWithApi` helper, reuse whatever render wrapper the existing tests call (search the file for `render(` and copy that exact setup). The assertion that matters: the reminder `content` never appears in the DOM.

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run test useStreamChat`
Expected: FAIL — TypeScript `switch` exhaustiveness or runtime: the event currently falls through with no `case`, but more importantly the test compiles only once the event type exists (it does, from Task 1). The test should fail or error because there is no explicit handling; confirm it fails before adding the case. (If it happens to pass because the unknown event is silently dropped, still add the explicit `case` in Step 3 for clarity and to prevent `default`-branch warnings.)

- [ ] **Step 3: Add the explicit ignore case**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, in the `switch (event.type)` block, add a case alongside the other non-routed handling (e.g. right after the `session-title` case):

```ts
              case 'stop-check-reminder':
                // Hidden reminder: not routed to the UI. It remains in
                // sse-events.jsonl for debugging.
                break;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run test useStreamChat`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx
git commit -m "feat(frontend): ignore stop-check-reminder events in the chat stream"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full backend test suite**

Run: `bun run test` in `apps/backend`.
Expected: PASS.

- [ ] **Step 2: Run the full frontend test suite**

Run: `bun run test` in `apps/frontend`.
Expected: PASS.

- [ ] **Step 3: Run lint and format check**

Run the repo's lint + format-check scripts (check root `package.json` — e.g. `bun run lint`, `bun run format:check`).
Expected: PASS.

- [ ] **Step 4: Manual smoke (optional but recommended)**

Start the dev server (`bun dev` from repo root, per memory). In the chat UI, give the agent a task that makes it create a TODO and then stop early. Confirm in the browser that no extra bubble appears, and confirm in the backend session's `sse-events.jsonl` that a `stop-check-reminder` entry was written. Verify in both light and dark themes if any UI changed (none expected here).

---

## Self-Review Notes

- **Spec coverage:** SSE event (Task 1 ↔ spec §1); StopCheck interface + todoStopCheck (Task 2 ↔ §2); per-agent ownership (Tasks 5+7 ↔ §2 "Ownership"); sendReminder (Task 3 ↔ §3); advanceTurn + loop + evaluateStopChecks + allSettled (Tasks 4+6 ↔ §4); frontend ignore (Task 8 ↔ §5); error handling via allSettled (Task 6 test ↔ Error Handling); termination via maxRounds (Task 6 test ↔ Goals). All covered.
- **Type consistency:** `StopCheck.evaluate` returns `string | null | Promise<string | null>` (Task 2) and is awaited in `evaluateStopChecks` (Task 6). `advanceTurn` returns `{aborted, toolCalls}` used identically at all three sites. `SseStopCheckReminderEvent` fields (`checkNames`, `content`, `messageId`, `createdAt`) match between schema (Task 1) and emission (Task 6).
- **Ordering:** Task 4 (refactor) precedes Task 6 (which reuses `advanceTurn`). Task 5 (plumbing, empty default) precedes Task 6/7. Task 7 resolves the `AgentOptions` required-field errors introduced in Task 5.
