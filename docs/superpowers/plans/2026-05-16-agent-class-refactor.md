# Agent Class Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split the large backend `Agent` class into focused collaborators while preserving the current public API and runtime behavior.

**Architecture:** `Agent` remains the public session facade and owner of mutable per-agent state. Stateless behavior moves into object-named singleton service classes, while `AgentRuntimeState` is constructed once per `Agent` to keep file caches, shell cwd, todos, and user interaction bridges isolated. The refactor lands in small behavior-preserving steps so existing `Agent` tests continue to prove event ordering, abort handling, usage reporting, title generation, persistence, and tool execution.

**Tech Stack:** TypeScript, Bun workspaces, Vitest, Zod, existing `agent-core` backend modules, existing `@omnicraft/sse-events` and `@omnicraft/tool-schemas` packages.

---

## File Map

- Create: `apps/backend/src/agent-core/agent/agent-working-directory-service.ts` - stateless singleton that creates and validates default per-agent temp directories.
- Create: `apps/backend/src/agent-core/agent/agent-working-directory-service.test.ts` - focused coverage for default working-directory creation and invalid IDs.
- Create: `apps/backend/src/agent-core/agent/agent-runtime-state.ts` - per-agent state holder for caches, shell cwd, todo state, and user interaction bridge.
- Create: `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts` - focused coverage that runtime state is isolated per instance and builds tool contexts correctly.
- Create: `apps/backend/src/agent-core/agent/agent-llm-stream-translator.ts` - stateless singleton that converts `LlmSessionEventStream` events into SSE events while collecting tool calls.
- Create: `apps/backend/src/agent-core/agent/agent-llm-stream-translator.test.ts` - focused stream mapping tests.
- Create: `apps/backend/src/agent-core/agent/agent-tool-executor.ts` - stateless singleton that executes one tool call using passed-in per-agent state.
- Create: `apps/backend/src/agent-core/agent/agent-tool-executor.test.ts` - focused tool execution tests for success, output events, subagent events, and errors.
- Create: `apps/backend/src/agent-core/agent/agent-usage-reporter.ts` - stateless singleton that builds `SseUsage` and `usage-update` events.
- Create: `apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts` - focused usage event tests.
- Create: `apps/backend/src/agent-core/agent/agent-turn-runner.ts` - stateless singleton that owns the agent loop internals and yields events upward.
- Modify: `apps/backend/src/agent-core/agent/agent.ts` - keep public facade responsibilities and delegate internals to the new collaborators.
- Keep: `apps/backend/src/agent-core/agent/index.ts` - do not export the new internal collaborators from the package barrel unless production callers need them.
- Keep: `apps/backend/src/agent-core/agent/agent.test.ts` - existing integration-style behavior coverage must continue to pass.

All commands below run from the repository root. Use Bun because this repository is a Bun workspace and `apps/backend/package.json` defines `test`, `lint`, and `typecheck` scripts.

---

### Task 1: Extract Working Directory Service

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-working-directory-service.ts`
- Create: `apps/backend/src/agent-core/agent/agent-working-directory-service.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing service test**

Create `apps/backend/src/agent-core/agent/agent-working-directory-service.test.ts`:

```typescript
import crypto from 'node:crypto';
import {realpathSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {agentWorkingDirectoryService} from './agent-working-directory-service.js';

const tmpDirsToCleanup = new Set<string>();

afterEach(() => {
  for (const dir of tmpDirsToCleanup) {
    rmSync(dir, {recursive: true, force: true});
  }
  tmpDirsToCleanup.clear();
});

describe('AgentWorkingDirectoryService', () => {
  it('creates an owner-only real directory for a valid agent id', () => {
    const agentId = crypto.randomUUID();
    const expected = path.join(realpathSync(os.tmpdir()), agentId);
    tmpDirsToCleanup.add(expected);

    const dir =
      agentWorkingDirectoryService.createDefaultWorkingDirectory(agentId);

    expect(dir).toBe(expected);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('rejects non-UUID ids before building a tmp path', () => {
    expect(() =>
      agentWorkingDirectoryService.createDefaultWorkingDirectory('../escape'),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-working-directory-service.test.ts
```

Expected: fail because `agent-working-directory-service.js` does not exist.

- [ ] **Step 3: Create the service**

Create `apps/backend/src/agent-core/agent/agent-working-directory-service.ts`:

```typescript
import {chmodSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {agentSnapshotSchema} from './types.js';

export class AgentWorkingDirectoryService {
  createDefaultWorkingDirectory(agentId: string): string {
    // Defense in depth: agentId reaches here from snapshots on disk. Reject
    // anything that isn't a UUID so path.join can't escape os.tmpdir().
    agentSnapshotSchema.shape.id.parse(agentId);
    const dir = path.join(os.tmpdir(), agentId);
    mkdirSync(dir, {recursive: true, mode: 0o700});
    // lstat (not stat) so a pre-planted symlink at `dir` is rejected before
    // chmod/realpath would follow it to a target we don't own.
    if (!lstatSync(dir).isDirectory()) {
      throw new Error(`Agent tmp path is not a real directory: ${dir}`);
    }
    // mkdir's `mode` is only applied on creation and can be masked by umask, so
    // re-assert 0o700 to cover the "directory already exists" case.
    chmodSync(dir, 0o700);
    return realpathSync(dir);
  }
}

export const agentWorkingDirectoryService = new AgentWorkingDirectoryService();
```

- [ ] **Step 4: Wire `Agent` to the service**

In `apps/backend/src/agent-core/agent/agent.ts`, remove these imports:

```typescript
import {chmodSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
```

Remove the local `createAgentTmpDir()` function.

Add this import near the other local agent imports:

```typescript
import {agentWorkingDirectoryService} from './agent-working-directory-service.js';
```

Replace both default working-directory expressions with:

```typescript
agentWorkingDirectoryService.createDefaultWorkingDirectory(this.id);
```

The snapshot branch should read:

```typescript
this.workingDirectory =
  snapshot.options.workingDirectory ??
  agentWorkingDirectoryService.createDefaultWorkingDirectory(this.id);
```

The fresh-agent branch should read:

```typescript
this.workingDirectory =
  options.workingDirectory ??
  agentWorkingDirectoryService.createDefaultWorkingDirectory(this.id);
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-working-directory-service.test.ts src/agent-core/agent/agent.test.ts
```

Expected: pass with the new service test and the existing `Agent default working directory` tests passing.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-working-directory-service.ts apps/backend/src/agent-core/agent/agent-working-directory-service.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: extract agent working directory service" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 2: Extract Per-Agent Runtime State

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-runtime-state.ts`
- Create: `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing runtime-state test**

Create `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts`:

```typescript
import type {SseSubAgentEvent} from '@omnicraft/sse-events';
import {describe, expect, it} from 'vitest';

import type {LlmConfig} from '../llm-api/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
};

const LIGHT_CONFIG: LlmConfig = {
  ...MAIN_CONFIG,
  model: 'light-model',
};

describe('AgentRuntimeState', () => {
  it('keeps shell and todo state isolated per agent instance', () => {
    const first = new AgentRuntimeState('/workspace/one');
    const second = new AgentRuntimeState('/workspace/two');

    const firstContext = first.buildToolExecutionContext({
      callId: 'call-1',
      agentId: 'agent-1',
      sessionsDir: null,
      availableSkills: new Map(),
      workingDirectory: '/workspace/one',
      signal: new AbortController().signal,
      onSubAgentEvent: () => {},
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    });
    const secondContext = second.buildToolExecutionContext({
      callId: 'call-2',
      agentId: 'agent-2',
      sessionsDir: null,
      availableSkills: new Map(),
      workingDirectory: '/workspace/two',
      signal: new AbortController().signal,
      onSubAgentEvent: () => {},
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    firstContext.shellState.cwd = '/workspace/one/subdir';
    firstContext.todoStore.append([
      {subject: 'first task', description: 'belongs to first agent'},
    ]);

    expect(firstContext.shellState.cwd).toBe('/workspace/one/subdir');
    expect(secondContext.shellState.cwd).toBe('/workspace/two');
    expect(first.todoVersion).toBe(1);
    expect(second.todoVersion).toBe(0);
    expect(first.listTodos()).toEqual([
      {
        index: 0,
        subject: 'first task',
        description: 'belongs to first agent',
        status: 'pending',
      },
    ]);
    expect(second.listTodos()).toEqual([]);
  });

  it('builds a tool context with the supplied per-call fields', () => {
    const state = new AgentRuntimeState('/workspace/project');
    const signal = new AbortController().signal;
    const subAgentEvents: SseSubAgentEvent[] = [];

    const context = state.buildToolExecutionContext({
      callId: 'call-123',
      agentId: 'agent-123',
      sessionsDir: '/sessions',
      availableSkills: new Map(),
      workingDirectory: '/workspace/project',
      signal,
      onSubAgentEvent: (event) => {
        subAgentEvents.push(event);
      },
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    context.onSubAgentEvent({
      type: 'subagent-complete',
      agentId: 'child-agent',
      status: 'success',
    });

    expect(context.callId).toBe('call-123');
    expect(context.agentId).toBe('agent-123');
    expect(context.sessionsDir).toBe('/sessions');
    expect(context.workingDirectory).toBe('/workspace/project');
    expect(context.signal).toBe(signal);
    expect(subAgentEvents).toEqual([
      {type: 'subagent-complete', agentId: 'child-agent', status: 'success'},
    ]);
  });

  it('submits responses through the per-agent interaction bridge', async () => {
    const state = new AgentRuntimeState('/workspace/project');
    const context = state.buildToolExecutionContext({
      callId: 'call-1',
      agentId: 'agent-1',
      sessionsDir: null,
      availableSkills: new Map(),
      workingDirectory: '/workspace/project',
      signal: new AbortController().signal,
      onSubAgentEvent: () => {},
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    });

    const responsePromise =
      context.userInteractionBridge.waitForResponse('interaction-1');

    expect(state.submitUserResponse('missing', {ok: false})).toBe(false);
    expect(state.submitUserResponse('interaction-1', {ok: true})).toBe(true);
    await expect(responsePromise).resolves.toEqual({ok: true});
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-runtime-state.test.ts
```

Expected: fail because `agent-runtime-state.js` does not exist.

- [ ] **Step 3: Create `AgentRuntimeState`**

Create `apps/backend/src/agent-core/agent/agent-runtime-state.ts`:

```typescript
import type {SseSubAgentEvent} from '@omnicraft/sse-events';

import type {LlmConfig} from '../llm-api/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {
  ShellState,
  TodoState,
  ToolExecutionContext,
} from '../tool/index.js';
import {UserInteractionBridge} from '../user-interaction/index.js';
import {FileContentCache} from './state/file-content-cache.js';
import {FileStatTracker} from './state/file-stat-tracker.js';
import {TodoStore, type TodoItem} from './state/todo-store.js';

export interface BuildToolExecutionContextInput {
  readonly callId: string;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly onSubAgentEvent: (event: SseSubAgentEvent) => void;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
}

export class AgentRuntimeState {
  private readonly fileCache = new FileContentCache();
  private readonly fileStatTracker = new FileStatTracker();
  private readonly shellState: ShellState;
  private readonly userInteractionBridge = new UserInteractionBridge();
  private readonly todoStore = new TodoStore();
  private readonly todoState: TodoState = {lastObservedVersion: undefined};

  constructor(workingDirectory: string) {
    this.shellState = {cwd: workingDirectory};
  }

  get todoVersion(): number {
    return this.todoStore.version;
  }

  listTodos(): TodoItem[] {
    return this.todoStore.list();
  }

  submitUserResponse(id: string, result: unknown): boolean {
    return this.userInteractionBridge.submitResponse(id, result);
  }

  buildToolExecutionContext(
    input: BuildToolExecutionContextInput,
  ): ToolExecutionContext {
    return {
      callId: input.callId,
      agentId: input.agentId,
      sessionsDir: input.sessionsDir,
      availableSkills: input.availableSkills,
      workingDirectory: input.workingDirectory,
      fileCache: this.fileCache,
      fileStatTracker: this.fileStatTracker,
      shellState: this.shellState,
      signal: input.signal,
      onSubAgentEvent: input.onSubAgentEvent,
      userInteractionBridge: this.userInteractionBridge,
      todoStore: this.todoStore,
      todoState: this.todoState,
      getConfig: input.getConfig,
      getLightConfig: input.getLightConfig,
    };
  }
}
```

- [ ] **Step 4: Make `Agent` own one runtime-state instance**

In `apps/backend/src/agent-core/agent/agent.ts`, remove these imports:

```typescript
import type {
  ShellState,
  TodoState,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
import {UserInteractionBridge} from '../user-interaction/index.js';
import {FileContentCache} from './state/file-content-cache.js';
import {FileStatTracker} from './state/file-stat-tracker.js';
import {TodoStore} from './state/todo-store.js';
```

Replace them with:

```typescript
import type {ToolDefinition} from '../tool/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
```

Remove these fields from `Agent`:

```typescript
private readonly fileCache = new FileContentCache();
private readonly fileStatTracker = new FileStatTracker();
private readonly shellState: ShellState;
private readonly userInteractionBridge = new UserInteractionBridge();
private readonly todoStore = new TodoStore();
private readonly todoState: TodoState = {lastObservedVersion: undefined};
```

Add this field:

```typescript
private readonly runtimeState: AgentRuntimeState;
```

In the constructor, replace:

```typescript
this.shellState = {cwd: this.workingDirectory};
```

with:

```typescript
this.runtimeState = new AgentRuntimeState(this.workingDirectory);
```

Update `submitUserResponse()`:

```typescript
submitUserResponse(id: string, result: unknown): boolean {
  return this.runtimeState.submitUserResponse(id, result);
}
```

In `runAgentLoop()`, replace todo-version access:

```typescript
const todoVersionBefore = this.runtimeState.todoVersion;
```

and replace the todo-update condition:

```typescript
if (this.runtimeState.todoVersion !== todoVersionBefore) {
  toolSseEventChannel.push({
    type: 'todo-update',
    items: this.runtimeState.listTodos(),
  } satisfies SseTodoUpdateEvent);
}
```

In `executeTool()`, replace the inline `ToolExecutionContext` object with:

```typescript
const context = this.runtimeState.buildToolExecutionContext({
  callId: toolCall.callId,
  agentId: this.id,
  sessionsDir: this.sessionsDir,
  availableSkills: buildAvailableSkills(this.skillRegistries),
  workingDirectory: this.workingDirectory,
  signal,
  onSubAgentEvent: (event) => {
    toolSseEventChannel.push(event);
  },
  getConfig: this.getConfig,
  getLightConfig: this.getLightConfig ?? this.getConfig,
});
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-runtime-state.test.ts src/agent-core/agent/agent.test.ts
```

Expected: pass, with existing tool, todo, abort, and user-interaction behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-runtime-state.ts apps/backend/src/agent-core/agent/agent-runtime-state.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: isolate agent runtime state" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 3: Extract Stream Consumer

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-llm-stream-translator.ts`
- Create: `apps/backend/src/agent-core/agent/agent-llm-stream-translator.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing stream-consumer test**

Create `apps/backend/src/agent-core/agent/agent-llm-stream-translator.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import type {LlmToolCall} from '../llm-api/index.js';
import type {LlmSessionEventStream} from '../llm-session/index.js';
import {
  type AgentLlmStreamTranslatorEvent,
  agentLlmStreamTranslator,
} from './agent-llm-stream-translator.js';

async function collectWithReturn<TReturn>(
  stream: AsyncGenerator<AgentLlmStreamTranslatorEvent, TReturn, undefined>,
): Promise<{events: AgentLlmStreamTranslatorEvent[]; result: TReturn}> {
  const events: AgentLlmStreamTranslatorEvent[] = [];
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      return {events, result: next.value};
    }
    events.push(next.value);
  }
}

describe('AgentLlmStreamTranslator', () => {
  it('yields SSE events and returns collected tool calls', async () => {
    const toolCall: LlmToolCall = {
      callId: 'call-1',
      toolName: 'mock_tool',
      arguments: '{"ok":true}',
    };

    async function* llmStream(): LlmSessionEventStream {
      yield {
        type: 'message-start',
        messageId: 'assistant-message',
        createdAt: 1,
      };
      yield {type: 'text-delta', content: 'hello'};
      yield {type: 'thinking-start'};
      yield {type: 'thinking-delta', content: 'thought'};
      yield {type: 'thinking-end'};
      yield {type: 'tool-call', toolCall};
      yield {
        type: 'compaction-sse',
        event: {
          type: 'context-compaction-start',
          compactionId: 'compaction-1',
          reason: 'after-turn',
          beforeTokens: 100,
          messageCount: 3,
        },
      };
    }

    const {events, result} = await collectWithReturn(
      agentLlmStreamTranslator.consume(llmStream()),
    );

    expect(events).toEqual([
      {
        type: 'message-start',
        role: 'assistant',
        messageId: 'assistant-message',
        createdAt: 1,
        content: '',
      },
      {type: 'text-delta', content: 'hello'},
      {type: 'thinking-start'},
      {type: 'thinking-delta', content: 'thought'},
      {type: 'thinking-end'},
      {
        type: 'context-compaction-start',
        compactionId: 'compaction-1',
        reason: 'after-turn',
        beforeTokens: 100,
        messageCount: 3,
      },
    ]);
    expect(result).toEqual([toolCall]);
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-llm-stream-translator.test.ts
```

Expected: fail because `agent-llm-stream-translator.js` does not exist.

- [ ] **Step 3: Create the stream consumer**

Create `apps/backend/src/agent-core/agent/agent-llm-stream-translator.ts`:

```typescript
import type {
  SseContextCompactionEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
} from '@omnicraft/sse-events';

import type {LlmToolCall} from '../llm-api/index.js';
import type {LlmSessionEventStream} from '../llm-session/index.js';

export type AgentLlmStreamTranslatorEvent =
  | SseTextDeltaEvent
  | SseThinkingStartEvent
  | SseThinkingDeltaEvent
  | SseThinkingEndEvent
  | SseMessageStartEvent
  | SseContextCompactionEvent;

export class AgentLlmStreamTranslator {
  async *consume(
    stream: LlmSessionEventStream,
  ): AsyncGenerator<AgentLlmStreamTranslatorEvent, LlmToolCall[], undefined> {
    const toolCalls: LlmToolCall[] = [];
    for await (const event of stream) {
      switch (event.type) {
        case 'text-delta':
        case 'thinking-start':
        case 'thinking-delta':
        case 'thinking-end':
          yield event;
          break;
        case 'message-start':
          yield {
            type: 'message-start',
            role: 'assistant',
            messageId: event.messageId,
            createdAt: event.createdAt,
            content: '',
          } satisfies SseMessageStartEvent;
          break;
        case 'tool-call':
          toolCalls.push(event.toolCall);
          break;
        case 'compaction-sse':
          yield event.event;
          break;
      }
    }
    return toolCalls;
  }
}

export const agentLlmStreamTranslator = new AgentLlmStreamTranslator();
```

- [ ] **Step 4: Wire `Agent` to the stream consumer**

In `apps/backend/src/agent-core/agent/agent.ts`, add:

```typescript
import {agentLlmStreamTranslator} from './agent-llm-stream-translator.js';
```

Replace:

```typescript
toolCalls = yield * this.consumeStream(userStream);
```

with:

```typescript
toolCalls = yield * agentLlmStreamTranslator.consume(userStream);
```

Replace:

```typescript
toolCalls =
  yield *
  this.consumeStream(
    this.llmSession.submitToolResults(
      orderedResults,
      toolDefs,
      systemPrompt,
      thinkingLevel,
      signal,
    ),
  );
```

with:

```typescript
toolCalls =
  yield *
  agentLlmStreamTranslator.consume(
    this.llmSession.submitToolResults(
      orderedResults,
      toolDefs,
      systemPrompt,
      thinkingLevel,
      signal,
    ),
  );
```

Remove the private `consumeStream()` method from `Agent`.

Remove now-unused imports from `agent.ts`:

```typescript
SseContextCompactionEvent,
SseTextDeltaEvent,
SseThinkingDeltaEvent,
SseThinkingEndEvent,
SseThinkingStartEvent,
LlmSessionEventStream,
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-llm-stream-translator.test.ts src/agent-core/agent/agent.test.ts
```

Expected: pass, with existing stream, usage, compaction, and abort tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-llm-stream-translator.ts apps/backend/src/agent-core/agent/agent-llm-stream-translator.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: extract agent stream consumer" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 4: Extract Tool Executor

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-tool-executor.ts`
- Create: `apps/backend/src/agent-core/agent/agent-tool-executor.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing tool-executor test**

Create `apps/backend/src/agent-core/agent/agent-tool-executor.test.ts`:

```typescript
import {AsyncChannel} from '@/helpers/async-channel.js';
import type {SseSubAgentEvent} from '@omnicraft/sse-events';
import {z} from 'zod';
import {describe, expect, it} from 'vitest';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {ToolDefinition, ToolExecutionContext} from '../tool/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
import {
  type AgentToolSseEvent,
  agentToolExecutor,
} from './agent-tool-executor.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
};

const LIGHT_CONFIG: LlmConfig = {
  ...MAIN_CONFIG,
  model: 'light-model',
};

async function collectChannel(
  channel: AsyncChannel<AgentToolSseEvent>,
): Promise<AgentToolSseEvent[]> {
  const events: AgentToolSseEvent[] = [];
  for await (const event of channel) {
    events.push(event);
  }
  return events;
}

function executeInput(overrides: {
  readonly toolCall?: LlmToolCall;
  readonly tool?: ToolDefinition;
  readonly channel?: AsyncChannel<AgentToolSseEvent>;
}) {
  const toolCall =
    overrides.toolCall ??
    ({
      callId: 'call-1',
      toolName: 'mock_tool',
      arguments: '{"value":"ok"}',
    } satisfies LlmToolCall);
  const channel = overrides.channel ?? new AsyncChannel<AgentToolSseEvent>();
  const availableTools = new Map<string, ToolDefinition>();
  if (overrides.tool) {
    availableTools.set(overrides.tool.name, overrides.tool);
  }

  return {
    toolCall,
    availableTools,
    toolSseEventChannel: channel,
    runtimeState: new AgentRuntimeState('/workspace/project'),
    agentId: 'agent-1',
    sessionsDir: '/sessions',
    availableSkills: new Map<string, SkillDefinition>(),
    workingDirectory: '/workspace/project',
    signal: new AbortController().signal,
    getConfig: () => Promise.resolve(MAIN_CONFIG),
    getLightConfig: () => Promise.resolve(LIGHT_CONFIG),
    channel,
  };
}

describe('AgentToolExecutor', () => {
  it('executes a visible tool and forwards output and subagent events', async () => {
    let receivedContext: ToolExecutionContext | null = null;
    const subAgentEvent: SseSubAgentEvent = {
      type: 'subagent-complete',
      agentId: 'child-agent',
      status: 'success',
    };
    const parameters = z.object({value: z.string()});
    const tool: ToolDefinition<typeof parameters> = {
      name: 'mock_tool',
      displayName: 'Mock Tool',
      description: 'Tool used by the executor test',
      parameters,
      suppressToolEvents: false,
      execute: (args, context, onOutput) => {
        receivedContext = context;
        onOutput?.(`value:${args.value}`);
        context.onSubAgentEvent(subAgentEvent);
        return {
          status: 'success',
          content: `result:${args.value}`,
          data: {message: 'ok'},
        };
      },
    };
    const input = executeInput({tool});
    const eventsPromise = collectChannel(input.channel);

    const result = await agentToolExecutor.execute(input);
    input.channel.close();
    const events = await eventsPromise;

    expect(result).toEqual({
      status: 'success',
      content: 'result:ok',
      data: {message: 'ok'},
    });
    expect(receivedContext).toMatchObject({
      callId: 'call-1',
      agentId: 'agent-1',
      sessionsDir: '/sessions',
      workingDirectory: '/workspace/project',
    });
    expect(events).toEqual([
      {type: 'tool-execute-delta', callId: 'call-1', content: 'value:ok'},
      subAgentEvent,
    ]);
  });

  it('does not create output callbacks for suppressed tools', async () => {
    let onOutputWasProvided = false;
    const tool: ToolDefinition = {
      name: 'mock_tool',
      displayName: 'Mock Tool',
      description: 'Suppressed tool used by the executor test',
      parameters: z.object({}),
      suppressToolEvents: true,
      execute: (_args, _context, onOutput) => {
        onOutputWasProvided = onOutput !== undefined;
        return {status: 'success', content: 'ok', data: {message: 'ok'}};
      },
    };
    const input = executeInput({
      tool,
      toolCall: {callId: 'call-1', toolName: 'mock_tool', arguments: '{}'},
    });

    const result = await agentToolExecutor.execute(input);

    expect(result.status).toBe('success');
    expect(onOutputWasProvided).toBe(false);
  });

  it('normalizes thrown tool errors into error results', async () => {
    const tool: ToolDefinition = {
      name: 'mock_tool',
      displayName: 'Mock Tool',
      description: 'Throwing tool used by the executor test',
      parameters: z.object({}),
      suppressToolEvents: false,
      execute: () => {
        throw new Error('tool exploded');
      },
    };
    const input = executeInput({
      tool,
      toolCall: {callId: 'call-1', toolName: 'mock_tool', arguments: '{}'},
    });

    const result = await agentToolExecutor.execute(input);

    expect(result).toEqual({
      status: 'error',
      content: 'Error: tool exploded',
      data: {message: 'tool exploded'},
    });
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-tool-executor.test.ts
```

Expected: fail because `agent-tool-executor.js` does not exist.

- [ ] **Step 3: Create the tool executor**

Create `apps/backend/src/agent-core/agent/agent-tool-executor.ts`:

```typescript
import assert from 'node:assert';

import type {
  SseSubAgentEvent,
  SseTodoUpdateEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
} from '@omnicraft/sse-events';
import type {AnyToolResultData} from '@omnicraft/tool-schemas';

import type {AsyncChannel} from '@/helpers/async-channel.js';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {ToolDefinition} from '../tool/index.js';
import type {AgentRuntimeState} from './agent-runtime-state.js';

export type AgentToolSseEvent =
  | SseToolExecuteEndEvent
  | SseToolExecuteDeltaEvent
  | SseSubAgentEvent
  | SseTodoUpdateEvent;

export interface ExecuteAgentToolInput {
  readonly toolCall: LlmToolCall;
  readonly availableTools: ReadonlyMap<string, ToolDefinition>;
  readonly toolSseEventChannel: AsyncChannel<AgentToolSseEvent>;
  readonly runtimeState: AgentRuntimeState;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
}

export interface ExecuteAgentToolResult {
  readonly content: string;
  readonly status: 'success' | 'failure' | 'error';
  readonly data: AnyToolResultData;
}

export class AgentToolExecutor {
  async execute(input: ExecuteAgentToolInput): Promise<ExecuteAgentToolResult> {
    const tool = input.availableTools.get(input.toolCall.toolName);
    assert(
      tool,
      `executeTool called with unknown tool: ${input.toolCall.toolName}`,
    );

    const onOutput = tool.suppressToolEvents
      ? undefined
      : (chunk: string) => {
          input.toolSseEventChannel.push({
            type: 'tool-execute-delta',
            callId: input.toolCall.callId,
            content: chunk,
          } satisfies SseToolExecuteDeltaEvent);
        };

    const context = input.runtimeState.buildToolExecutionContext({
      callId: input.toolCall.callId,
      agentId: input.agentId,
      sessionsDir: input.sessionsDir,
      availableSkills: input.availableSkills,
      workingDirectory: input.workingDirectory,
      signal: input.signal,
      onSubAgentEvent: (event) => {
        input.toolSseEventChannel.push(event);
      },
      getConfig: input.getConfig,
      getLightConfig: input.getLightConfig,
    });

    try {
      const parsedArgs: unknown = tool.parameters.parse(
        JSON.parse(input.toolCall.arguments),
      );
      const result = await tool.execute(parsedArgs, context, onOutput);
      return {
        content: result.content,
        status: result.status,
        data: result.data as AnyToolResultData,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {content: `Error: ${message}`, status: 'error', data: {message}};
    }
  }
}

export const agentToolExecutor = new AgentToolExecutor();
```

- [ ] **Step 4: Wire `Agent` to the tool executor**

In `apps/backend/src/agent-core/agent/agent.ts`, add:

```typescript
import {
  type AgentToolSseEvent,
  agentToolExecutor,
} from './agent-tool-executor.js';
```

Replace the inline `AsyncChannel` type parameter with:

```typescript
const toolSseEventChannel = new AsyncChannel<AgentToolSseEvent>();
```

Before creating `executions`, compute available skills once:

```typescript
const availableSkills = buildAvailableSkills(this.skillRegistries);
```

Replace the call to `this.executeTool(...)` with:

```typescript
const result = await agentToolExecutor.execute({
  toolCall,
  availableTools,
  toolSseEventChannel,
  runtimeState: this.runtimeState,
  agentId: this.id,
  sessionsDir: this.sessionsDir,
  availableSkills,
  workingDirectory: this.workingDirectory,
  signal,
  getConfig: this.getConfig,
  getLightConfig: this.getLightConfig ?? this.getConfig,
});
```

Remove the private `executeTool()` method from `Agent`.

Remove now-unused imports from `agent.ts`:

```typescript
import assert from 'node:assert';
import type {AnyToolResultData} from '@omnicraft/tool-schemas';
import type {ToolExecutionContext} from '../tool/index.js';
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-tool-executor.test.ts src/agent-core/agent/agent.test.ts
```

Expected: pass, with existing tool-start, tool-end, todo-update, max-round, abort, and unknown-tool behavior unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-tool-executor.ts apps/backend/src/agent-core/agent/agent-tool-executor.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: extract agent tool executor" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 5: Extract Usage Reporter

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-usage-reporter.ts`
- Create: `apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing usage-reporter test**

Create `apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {LlmConfig} from '../llm-api/index.js';
import type {LlmSession} from '../llm-session/index.js';
import {modelCapacity} from '../model-capacity/index.js';
import {agentUsageReporter} from './agent-usage-reporter.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
};

describe('AgentUsageReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds usage-update events from config, model capacity, and session usage', async () => {
    vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockResolvedValue(200_000);
    const llmSession = {
      getUsage: () => ({
        currentContextInputTokens: 40,
        latestCallOutputTokens: 8,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
      }),
    } satisfies Pick<LlmSession, 'getUsage'>;

    const event = await agentUsageReporter.buildUsageUpdateEvent({
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      llmSession,
      thinkingLevel: 'high' satisfies ThinkingLevel,
    });

    expect(event).toEqual({
      type: 'usage-update',
      usage: {
        model: 'main-model',
        contextWindowTokens: 200_000,
        currentContextInputTokens: 40,
        latestCallOutputTokens: 8,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
        thinkingLevel: 'high',
      },
    });
  });
});
```

- [ ] **Step 2: Run the focused test to verify it fails**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-usage-reporter.test.ts
```

Expected: fail because `agent-usage-reporter.js` does not exist.

- [ ] **Step 3: Create the usage reporter**

Create `apps/backend/src/agent-core/agent/agent-usage-reporter.ts`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseUsage, SseUsageUpdateEvent} from '@omnicraft/sse-events';

import type {LlmConfig} from '../llm-api/index.js';
import type {LlmSession} from '../llm-session/index.js';
import {modelCapacity} from '../model-capacity/index.js';

export interface BuildAgentUsageInput {
  readonly getConfig: () => Promise<LlmConfig>;
  readonly llmSession: Pick<LlmSession, 'getUsage'>;
  readonly thinkingLevel: ThinkingLevel;
}

export class AgentUsageReporter {
  async buildUsage(input: BuildAgentUsageInput): Promise<SseUsage> {
    const config = await input.getConfig();
    const contextWindowTokens = await modelCapacity.getMaxPromptTokens(config);
    const usage = input.llmSession.getUsage();
    return {
      model: config.model,
      contextWindowTokens,
      ...usage,
      thinkingLevel: input.thinkingLevel,
    };
  }

  async buildUsageUpdateEvent(
    input: BuildAgentUsageInput,
  ): Promise<SseUsageUpdateEvent> {
    return {
      type: 'usage-update',
      usage: await this.buildUsage(input),
    };
  }
}

export const agentUsageReporter = new AgentUsageReporter();
```

- [ ] **Step 4: Wire `Agent` to the usage reporter**

In `apps/backend/src/agent-core/agent/agent.ts`, remove:

```typescript
import type {SseUsage, SseUsageUpdateEvent} from '@omnicraft/sse-events';
import {modelCapacity} from '../model-capacity/index.js';
```

Add:

```typescript
import {agentUsageReporter} from './agent-usage-reporter.js';
```

Replace `buildSseUsage()` and `buildUsageUpdateEvent()` with:

```typescript
private async buildUsageUpdateEvent(): Promise<SseUsageUpdateEvent> {
  return agentUsageReporter.buildUsageUpdateEvent({
    getConfig: this.getConfig,
    llmSession: this.llmSession,
    thinkingLevel: this.thinkingLevel,
  });
}
```

Keep the `SseUsageUpdateEvent` type import while this private wrapper exists:

```typescript
import type {SseUsageUpdateEvent} from '@omnicraft/sse-events';
```

- [ ] **Step 5: Run focused tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent-usage-reporter.test.ts src/agent-core/agent/agent.test.ts
```

Expected: pass, with existing `Agent usage reporting` tests unchanged.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-usage-reporter.ts apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: extract agent usage reporter" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 6: Extract Turn Runner

**Files:**

- Create: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Run the existing behavior tests before extraction**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent.test.ts
```

Expected: pass before moving the loop. These tests are the safety net for event ordering, usage updates, compaction lifecycle, abort flow, snapshot restore, and default working directories.

- [ ] **Step 2: Create the turn-runner shell and input types**

Create `apps/backend/src/agent-core/agent/agent-turn-runner.ts` with the imports, event type, and input type:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTodoUpdateEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';
import type {ToolName} from '@omnicraft/tool-schemas';

import {AsyncChannel} from '@/helpers/async-channel.js';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {LlmSession, ToolResult} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {ToolDefinition, ToolRegistry} from '../tool/index.js';
import {
  buildAvailableSkills,
  buildAvailableTools,
  buildSystemPrompt,
} from './catalog/agent-catalog.js';
import type {AgentRuntimeState} from './agent-runtime-state.js';
import {agentLlmStreamTranslator} from './agent-llm-stream-translator.js';
import {
  type AgentToolSseEvent,
  agentToolExecutor,
} from './agent-tool-executor.js';
import {agentUsageReporter} from './agent-usage-reporter.js';
import type {AgentEventStream} from './types.js';

export interface RunAgentTurnInput {
  readonly userMessage: string;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly workingDirectory: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly signal: AbortSignal;
  readonly llmSession: LlmSession;
  readonly runtimeState: AgentRuntimeState;
  readonly toolRegistries: readonly ToolRegistry[];
  readonly skillRegistries: readonly SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly compactAfterTurn: (
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
  ) => Promise<void>;
}
```

If the formatter splits the long catalog import, keep the imported names unchanged:

```typescript
import {
  buildAvailableSkills,
  buildAvailableTools,
  buildSystemPrompt,
} from './catalog/agent-catalog.js';
```

- [ ] **Step 3: Move the agent loop into `AgentTurnRunner.run()`**

In `agent-turn-runner.ts`, add:

```typescript
export class AgentTurnRunner {
  async *run(input: RunAgentTurnInput): AgentEventStream {
    const inFlightToolCalls = new Set<string>();
    const maxRounds = await input.getMaxToolRounds();

    const availableTools = buildAvailableTools(
      input.toolRegistries,
      input.skillRegistries,
    );
    const availableSkills = buildAvailableSkills(input.skillRegistries);
    const toolDefs = [...availableTools.values()];
    const systemPrompt = buildSystemPrompt(
      input.baseSystemPrompt,
      input.toolRegistries,
      input.skillRegistries,
      input.workingDirectory,
    );

    const {
      stream: userStream,
      messageId,
      createdAt,
    } = input.llmSession.sendUserMessage(
      input.userMessage,
      toolDefs,
      systemPrompt,
      input.thinkingLevel,
      input.signal,
    );

    yield {
      type: 'message-start',
      role: 'user',
      messageId,
      createdAt,
      content: input.userMessage,
    } satisfies SseMessageStartEvent;

    let toolCalls: LlmToolCall[];
    try {
      toolCalls = yield* agentLlmStreamTranslator.consume(userStream);
    } catch (error: unknown) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }
      throw error;
    }
    yield await agentUsageReporter.buildUsageUpdateEvent(input);

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

      for (const toolCall of toolCalls) {
        const tool = availableTools.get(toolCall.toolName);
        if (!tool || tool.suppressToolEvents) continue;
        inFlightToolCalls.add(toolCall.callId);
        yield {
          type: 'tool-execute-start',
          callId: toolCall.callId,
          toolName: tool.name as ToolName,
          displayName: tool.displayName,
          arguments: toolCall.arguments,
        } satisfies SseToolExecuteStartEvent;
      }

      const toolSseEventChannel = new AsyncChannel<AgentToolSseEvent>();
      const toolResults = new Map<string, ToolResult>();

      for (const toolCall of toolCalls) {
        if (availableTools.has(toolCall.toolName)) continue;
        toolResults.set(toolCall.callId, {
          callId: toolCall.callId,
          content: `Error: Unknown tool: ${toolCall.toolName}`,
          status: 'failure',
        });
      }

      const executions = toolCalls
        .filter((tc) => availableTools.has(tc.toolName))
        .map(async (toolCall) => {
          const todoVersionBefore = input.runtimeState.todoVersion;

          const result = await agentToolExecutor.execute({
            toolCall,
            availableTools,
            toolSseEventChannel,
            runtimeState: input.runtimeState,
            agentId: input.agentId,
            sessionsDir: input.sessionsDir,
            availableSkills,
            workingDirectory: input.workingDirectory,
            signal: input.signal,
            getConfig: input.getConfig,
            getLightConfig: input.getLightConfig,
          });

          const tool = availableTools.get(toolCall.toolName);
          if (!tool?.suppressToolEvents) {
            toolSseEventChannel.push({
              type: 'tool-execute-end',
              callId: toolCall.callId,
              result: result.content,
              status: result.status,
              data: result.data,
            } satisfies SseToolExecuteEndEvent);
          }

          if (input.runtimeState.todoVersion !== todoVersionBefore) {
            toolSseEventChannel.push({
              type: 'todo-update',
              items: input.runtimeState.listTodos(),
            } satisfies SseTodoUpdateEvent);
          }

          toolResults.set(toolCall.callId, {
            callId: toolCall.callId,
            content: result.content,
            status: result.status === 'success' ? 'success' : 'failure',
          });
        });

      void Promise.all(executions)
        .catch(() => {
          // Individual tool errors are converted by agentToolExecutor.
        })
        .finally(() => {
          toolSseEventChannel.close();
        });

      for await (const event of toolSseEventChannel) {
        if (event.type === 'tool-execute-end') {
          inFlightToolCalls.delete(event.callId);
        }
        yield event;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (input.signal.aborted) break;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      const orderedResults = toolCalls.flatMap((tc) => {
        const result = toolResults.get(tc.callId);
        return result ? [result] : [];
      });

      try {
        toolCalls = yield* agentLlmStreamTranslator.consume(
          input.llmSession.submitToolResults(
            orderedResults,
            toolDefs,
            systemPrompt,
            input.thinkingLevel,
            input.signal,
          ),
        );
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (input.signal.aborted) {
          yield* this.emitAbortCompletion({
            inFlightToolCalls,
            tools: toolDefs,
            systemPrompt,
            input,
          });
          return;
        }
        throw error;
      }
      yield await agentUsageReporter.buildUsageUpdateEvent(input);
    }

    yield* this.emitDoneAfterTurn({
      reason: 'complete',
      tools: toolDefs,
      systemPrompt,
      input,
    });
  }
```

- [ ] **Step 4: Add turn-runner completion helpers**

In the same class, below `run()`, add:

```typescript
  private async *emitAbortCompletion({
    inFlightToolCalls,
    tools,
    systemPrompt,
    input,
  }: {
    readonly inFlightToolCalls: Set<string>;
    readonly tools: readonly ToolDefinition[];
    readonly systemPrompt: string;
    readonly input: RunAgentTurnInput;
  }): AgentEventStream {
    for (const callId of inFlightToolCalls) {
      yield {
        type: 'tool-execute-end',
        callId,
        result: 'Aborted',
        status: 'error',
        data: {message: 'Aborted'},
      } satisfies SseToolExecuteEndEvent;
    }
    yield* this.emitDoneAfterTurn({
      reason: 'aborted',
      tools,
      systemPrompt,
      input,
    });
  }

  private async *emitDoneAfterTurn({
    reason,
    tools,
    systemPrompt,
    input,
  }: {
    readonly reason: SseDoneEvent['reason'];
    readonly tools: readonly ToolDefinition[];
    readonly systemPrompt: string;
    readonly input: RunAgentTurnInput;
  }): AgentEventStream {
    await input.compactAfterTurn(tools, systemPrompt, input.thinkingLevel);
    yield await agentUsageReporter.buildUsageUpdateEvent(input);
    yield {type: 'done', reason} satisfies SseDoneEvent;
  }
}

export const agentTurnRunner = new AgentTurnRunner();
```

- [ ] **Step 5: Delegate `Agent.runAgentLoop()` to `agentTurnRunner`**

In `apps/backend/src/agent-core/agent/agent.ts`, add:

```typescript
import {agentTurnRunner} from './agent-turn-runner.js';
```

Replace the protected `runAgentLoop()` async generator with:

```typescript
protected runAgentLoop(
  userMessage: string,
  thinkingLevel: ThinkingLevel,
  signal: AbortSignal,
): AgentEventStream {
  return agentTurnRunner.run({
    userMessage,
    agentId: this.id,
    sessionsDir: this.sessionsDir,
    workingDirectory: this.workingDirectory,
    thinkingLevel,
    signal,
    llmSession: this.llmSession,
    runtimeState: this.runtimeState,
    toolRegistries: this.toolRegistries,
    skillRegistries: this.skillRegistries,
    baseSystemPrompt: this.baseSystemPrompt,
    getConfig: this.getConfig,
    getLightConfig: this.getLightConfig ?? this.getConfig,
    getMaxToolRounds: this.getMaxToolRounds,
    compactAfterTurn: (tools, systemPrompt, compactThinkingLevel) =>
      this.compactAfterTurn(tools, systemPrompt, compactThinkingLevel),
  });
}
```

Remove these private methods from `Agent` because `AgentTurnRunner` now owns them:

```typescript
emitAbortCompletion;
emitDoneAfterTurn;
buildUsageUpdateEvent;
```

Keep `compactAfterTurn()` in `Agent`; it appends compaction events to `sseLog` and logs best-effort compaction failures.

Remove now-unused imports from `agent.ts`:

```typescript
import type {
  SseDoneEvent,
  SseSubAgentEvent,
  SseTodoUpdateEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';
import type {ToolName} from '@omnicraft/tool-schemas';
import {AsyncChannel} from '@/helpers/async-channel.js';
import type {LlmToolCall} from '../llm-api/index.js';
import type {ToolResult} from '../llm-session/index.js';
import type {ToolDefinition} from '../tool/index.js';
import {
  buildAvailableSkills,
  buildAvailableTools,
  buildSystemPrompt,
} from './catalog/agent-catalog.js';
import {agentLlmStreamTranslator} from './agent-llm-stream-translator.js';
import {
  type AgentToolSseEvent,
  agentToolExecutor,
} from './agent-tool-executor.js';
import {agentUsageReporter} from './agent-usage-reporter.js';
```

Keep `ToolDefinition` imported if `compactAfterTurn()` still references it:

```typescript
import type {ToolDefinition} from '../tool/index.js';
```

- [ ] **Step 6: Run focused tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent.test.ts
```

Expected: pass. Pay special attention to these existing sections in the output:

- `Agent usage reporting`
- `Agent compaction lifecycle`
- `Agent abort flow`
- `Agent snapshot restore`
- `Agent default working directory`

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-turn-runner.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "refactor: extract agent turn runner" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

---

### Task 7: Final Verification And Import Cleanup

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: any new test file that fails lint or typecheck
- Test: all backend agent tests

- [ ] **Step 1: Run all agent-core agent tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent
```

Expected: pass for all tests under `apps/backend/src/agent-core/agent`.

- [ ] **Step 2: Run backend typecheck**

Run:

```bash
bun --filter '@omnicraft/backend' typecheck
```

Expected: pass with no TypeScript errors. If TypeScript reports unused imports in `agent.ts` or a new collaborator, remove only those imports.

- [ ] **Step 3: Run backend lint**

Run:

```bash
bun --filter '@omnicraft/backend' lint
```

Expected: pass with no ESLint errors. If lint reports formatting or line-length changes in the new files, run Prettier on the touched files:

```bash
bun prettier --write --ignore-unknown apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent-working-directory-service.ts apps/backend/src/agent-core/agent/agent-working-directory-service.test.ts apps/backend/src/agent-core/agent/agent-runtime-state.ts apps/backend/src/agent-core/agent/agent-runtime-state.test.ts apps/backend/src/agent-core/agent/agent-llm-stream-translator.ts apps/backend/src/agent-core/agent/agent-llm-stream-translator.test.ts apps/backend/src/agent-core/agent/agent-tool-executor.ts apps/backend/src/agent-core/agent/agent-tool-executor.test.ts apps/backend/src/agent-core/agent/agent-usage-reporter.ts apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts apps/backend/src/agent-core/agent/agent-turn-runner.ts
```

Then re-run:

```bash
bun --filter '@omnicraft/backend' lint
```

Expected: pass.

- [ ] **Step 4: Run the focused behavior test one final time**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/agent/agent.test.ts
```

Expected: pass with no changed behavior in the public `Agent` API.

- [ ] **Step 5: Inspect the final diff**

Run:

```bash
git --no-pager diff --stat
git --no-pager diff -- apps/backend/src/agent-core/agent
```

Expected: `agent.ts` is smaller, new collaborators are focused, and no concrete agent constructors or restore flows changed.

- [ ] **Step 6: Commit final cleanup if there are changes**

If Steps 2 or 3 required import cleanup or formatting changes, commit them:

```bash
git add apps/backend/src/agent-core/agent
git commit -m "chore: clean up agent refactor imports" -m "Co-authored-by: Copilot <223556219+Copilot@users.noreply.github.com>"
```

If there are no changes after Step 5, skip this commit.
