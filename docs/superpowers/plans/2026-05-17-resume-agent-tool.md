# Resume Agent Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a live-only `resume_agent` tool that resumes an existing in-memory subagent and displays each resumed turn in the frontend timeline.

**Architecture:** The backend keeps the current live-only boundary and looks up subagents through `SubagentRegistry`. `dispatch_agent` and `resume_agent` share a `runSubagentTurn` helper that emits a start event, forwards nested subagent output, emits completion, and returns the final assistant summary. The frontend treats `subagent-dispatch` and `subagent-resume` as the same timeline item with a `mode` field and a new child event bus per turn.

**Tech Stack:** TypeScript, Zod, Vitest, React, HeroUI, existing SSE event bus and tool registry infrastructure.

---

## File Structure

- Modify: `packages/sse-events/src/schema.ts`
  - Add `sseSubagentResumeEventSchema` with the same payload shape as dispatch.
  - Include resume in `SseSubAgentEvent` and top-level `sseEventSchema`.
- Modify: `packages/sse-events/src/schema.test.ts`
  - Cover resume parsing and recursive-event rejection.
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
  - Add public metadata getters for subagent resume event payloads.
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
  - Cover the new metadata getters.
- Create: `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`
  - Own the shared start/subscribe/start-turn/forward/complete/summary behavior.
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
  - Keep dispatch-specific creation, validation, and registration.
  - Delegate subagent turn execution to `runSubagentTurn`.
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`
  - Keep existing behavior covered after the refactor.
- Create: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`
  - Implement the new `resume_agent` tool.
  - Include a synchronous same-id resume claim.
- Create: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`
  - Cover missing ids, malformed ids, busy subagents, claim contention, streaming, and registry registration.
- Modify: `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`
  - Register `resumeAgentTool`.
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`
  - Route `subagent-resume` like dispatch and set `mode: 'resume'`.
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`
  - Cover replayed resumed output.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`
  - Add `SubagentMode` and carry it through subagent content/events.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts`
  - Store `mode` and `agentId` on subagent messages.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`
  - Carry mode through render items.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`
  - Update subagent transform expectations for `mode`.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`
  - Pass `agentId` and `mode` into `SubagentDisclosure`.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosure.tsx`
  - Accept `agentId` and `mode`.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx`
  - Render Dispatch/Resume mode labels and mode-specific id labels.
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/styles.module.css`
  - Add compact tag and id row styles.

---

### Task 1: Add `subagent-resume` SSE Schema

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `packages/sse-events/src/schema.test.ts`

- [ ] **Step 1: Write failing schema tests**

In `packages/sse-events/src/schema.test.ts`, update the import list:

```typescript
import {
  sseBaseEventSchema,
  sseContextCompactionEndEventSchema,
  sseContextCompactionErrorEventSchema,
  sseContextCompactionStartEventSchema,
  sseEventSchema,
  sseSubagentCompleteEventSchema,
  sseSubagentDispatchEventSchema,
  sseSubagentOutputEventSchema,
  sseSubagentResumeEventSchema,
} from './schema.js';
```

In `rejects recursive subagent events as subagent output payloads`, add resume to the `recursiveEvents` array:

```typescript
{
  type: 'subagent-resume',
  agentId,
  task: 'Inspect the next question',
  agentType: 'general',
  thinkingLevel: 'none',
  workingDirectory: '/workspace/project',
},
```

Add this new describe block after `describe('subagent-dispatch schema', ...)`:

```typescript
describe('subagent-resume schema', () => {
  it('parses a valid resume event', () => {
    const event = {
      type: 'subagent-resume',
      agentId: '11111111-1111-4111-8111-111111111111',
      task: 'Continue with the next file',
      agentType: 'general',
      thinkingLevel: 'none',
      workingDirectory: '/workspace/project',
    };

    expect(sseSubagentResumeEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
    expect(() => sseBaseEventSchema.parse(event)).toThrow();
  });

  it('rejects a non-UUID agent id', () => {
    expect(() =>
      sseSubagentResumeEventSchema.parse({
        type: 'subagent-resume',
        agentId: 'not-a-uuid',
        task: 'Continue with the next file',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      }),
    ).toThrow();
  });

  it('rejects an unknown subagent type', () => {
    expect(() =>
      sseSubagentResumeEventSchema.parse({
        type: 'subagent-resume',
        agentId: '11111111-1111-4111-8111-111111111111',
        task: 'Continue with the next file',
        agentType: 'unknown',
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run schema tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/sse-events test -- src/schema.test.ts
```

Expected: FAIL because `sseSubagentResumeEventSchema` is not exported.

- [ ] **Step 3: Implement the schema**

In `packages/sse-events/src/schema.ts`, add a shared payload base near the subagent event schemas:

```typescript
const sseSubagentStartPayloadSchema = z.object({
  agentId: agentIdSchema,
  task: z.string(),
  agentType: subAgentTypeSchema,
  thinkingLevel: thinkingLevelSchema,
  workingDirectory: z.string(),
});
```

Replace `sseSubagentDispatchEventSchema` with:

```typescript
export const sseSubagentDispatchEventSchema = z.object({
  type: z.literal('subagent-dispatch'),
  ...sseSubagentStartPayloadSchema.shape,
});
export type SseSubagentDispatchEvent = z.infer<
  typeof sseSubagentDispatchEventSchema
>;
```

Add resume immediately after dispatch:

```typescript
/** A live subagent has been resumed for a follow-up task. */
export const sseSubagentResumeEventSchema = z.object({
  type: z.literal('subagent-resume'),
  ...sseSubagentStartPayloadSchema.shape,
});
export type SseSubagentResumeEvent = z.infer<
  typeof sseSubagentResumeEventSchema
>;
```

Update the subagent union:

```typescript
export type SseSubAgentEvent =
  | SseSubagentDispatchEvent
  | SseSubagentResumeEvent
  | SseSubagentOutputEvent
  | SseSubagentCompleteEvent;
```

Update `sseEventSchema`:

```typescript
export const sseEventSchema = z.discriminatedUnion('type', [
  ...sseBaseEventSchemas,
  sseSubagentDispatchEventSchema,
  sseSubagentResumeEventSchema,
  sseSubagentOutputEventSchema,
  sseSubagentCompleteEventSchema,
]);
```

- [ ] **Step 4: Run schema tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/sse-events test -- src/schema.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/sse-events/src/schema.ts packages/sse-events/src/schema.test.ts
git commit -m "feat: add subagent resume sse event"
```

---

### Task 2: Expose Agent Metadata Needed by Resume Events

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write failing Agent getter test**

In `apps/backend/src/agent-core/agent/agent.test.ts`, add this test near existing constructor/snapshot tests:

```typescript
it('exposes working directory and thinking level for live subagent events', () => {
  const options = testAgentOptions();
  const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), options);

  expect(agent.getWorkingDirectory()).toBe(options.workingDirectory);
  expect(agent.getThinkingLevel()).toBe('high');
});
```

- [ ] **Step 2: Run the focused Agent test to verify it fails**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/agent.test.ts
```

Expected: FAIL because `getWorkingDirectory` and `getThinkingLevel` do not exist.

- [ ] **Step 3: Add Agent getters**

In `apps/backend/src/agent-core/agent/agent.ts`, add these public methods after `submitUserResponse` and before `toSnapshot()`:

```typescript
  /** Returns the Agent's current working directory. */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /** Returns the Agent's configured thinking level. */
  getThinkingLevel(): ThinkingLevel {
    return this.thinkingLevel;
  }
```

- [ ] **Step 4: Run the focused Agent test to verify it passes**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent-core/agent/agent.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "feat: expose live agent metadata"
```

---

### Task 3: Extract Shared Subagent Turn Runner

**Files:**

- Create: `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

- [ ] **Step 1: Add dispatch regression tests before refactor**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, add a fake subagent helper near the existing helpers:

```typescript
function createForwardingMockSubagent(workingDirectory: string): Agent & {
  readonly handledMessages: string[];
} {
  const handledMessages: string[] = [];
  const subagent = {
    id: '11111111-1111-4111-8111-111111111111',
    title: 'Forwarding Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    handleUserMessage(message: string) {
      handledMessages.push(message);
    },
    abort() {},
    async *subscribe() {
      yield {
        nextIndex: 1,
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'assistant-1',
          createdAt: 1,
          content: '',
        },
      };
      yield {nextIndex: 2, event: {type: 'text-delta', content: 'done'}};
      yield {nextIndex: 3, event: {type: 'done', reason: 'complete'}};
    },
    getWorkingDirectory() {
      return workingDirectory;
    },
    getThinkingLevel() {
      return 'none' as const;
    },
  } as Agent & {readonly handledMessages: string[]};

  Object.defineProperty(subagent, 'isRunning', {get: () => false});
  return subagent;
}
```

Add this test in `describe('dispatchAgentTool', ...)`:

```typescript
it('forwards dispatched subagent events and registers after the turn starts', async () => {
  const subagent = createForwardingMockSubagent(tmpDir);
  const events: unknown[] = [];
  const dispatchContext = createMockContext({
    workingDirectory: tmpDir,
    onSubAgentEvent: (event) => {
      events.push(event);
    },
  });

  const result = await runSubagentTurn({
    context: dispatchContext,
    subagent,
    agentType: SubAgentType.GENERAL,
    task: 'Inspect the code',
    startEvent: {
      type: 'subagent-dispatch',
      agentId: subagent.id,
      task: 'Inspect the code',
      agentType: SubAgentType.GENERAL,
      thinkingLevel: 'none',
      workingDirectory: tmpDir,
    },
    onTurnStarted: () =>
      registerSubAgent(dispatchContext, subagent, SubAgentType.GENERAL),
  });

  expect(result).toMatchObject({
    status: 'success',
    data: {summary: 'done'},
    content: 'done',
  });
  expect(subagent.handledMessages).toEqual(['Inspect the code']);
  expect(dispatchContext.subagentRegistry.get(subagent.id)?.agent).toBe(
    subagent,
  );
  expect(events).toEqual([
    expect.objectContaining({type: 'subagent-dispatch'}),
    expect.objectContaining({type: 'subagent-output'}),
    expect.objectContaining({type: 'subagent-output'}),
    expect.objectContaining({type: 'subagent-output'}),
    {type: 'subagent-complete', agentId: subagent.id, status: 'success'},
  ]);
});
```

Update any test imports that currently read `buildSubagentOutputEvent` from `dispatch-agent-tool.js` so the helper comes from the new runner module instead:

```typescript
import {
  buildSubagentOutputEvent,
  runSubagentTurn,
} from './subagent-turn-runner.js';
```

- [ ] **Step 2: Run dispatch tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: FAIL because `subagent-turn-runner.js` does not exist.

- [ ] **Step 3: Create `subagent-turn-runner.ts`**

Create `apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`:

```typescript
import {
  sseBaseEventSchema,
  type SseEvent,
  type SseSubagentDispatchEvent,
  type SseSubagentOutputEvent,
  type SseSubagentResumeEvent,
} from '@omnicraft/sse-events';

import type {SubAgentType} from '@omnicraft/api-schema';
import type {Agent} from '@/agent-core/agent/index.js';
import type {
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

export interface SubagentTurnResult {
  summary: string;
}

export interface RunSubagentTurnInput {
  readonly context: ToolExecutionContext;
  readonly subagent: Agent;
  readonly agentType: SubAgentType;
  readonly task: string;
  readonly startEvent: SseSubagentDispatchEvent | SseSubagentResumeEvent;
  readonly onTurnStarted?: () => void;
}

export function buildSubagentOutputEvent(
  agentId: string,
  event: SseEvent,
): SseSubagentOutputEvent {
  const baseEvent = sseBaseEventSchema.parse(event);
  return {
    type: 'subagent-output',
    agentId,
    event: baseEvent,
  };
}

export async function runSubagentTurn({
  context,
  subagent,
  task,
  startEvent,
  onTurnStarted,
}: RunSubagentTurnInput): Promise<ToolExecuteResult<SubagentTurnResult>> {
  const onAbort = () => {
    subagent.abort();
  };
  context.signal.addEventListener('abort', onAbort, {once: true});
  context.onSubAgentEvent(startEvent);

  try {
    let lastReplyText = '';
    let completed = false;
    let failureMessage: string | null = null;
    const eventIter = subagent.subscribe({signal: context.signal});

    subagent.handleUserMessage(task);
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

- [ ] **Step 4: Refactor `dispatch-agent-tool.ts` to use the helper**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`:

1. Remove imports of `SseEvent` and `SseSubagentOutputEvent` from `@omnicraft/sse-events` only if they become unused.
2. Import the helper:

```typescript
import {
  runSubagentTurn,
  type SubagentTurnResult,
} from './subagent-turn-runner.js';
```

3. Remove the local `DispatchAgentResult` interface and use `SubagentTurnResult` in the tool definition:

```typescript
export const dispatchAgentTool: ToolDefinition<
  typeof parameters,
  SubagentTurnResult
> = {
```

4. Replace the body from `// Link parent abort signal to subagent` through the end of the `try/catch` block with:

```typescript
return runSubagentTurn({
  context,
  subagent,
  agentType,
  task,
  startEvent: {
    type: 'subagent-dispatch',
    agentId: subagent.id,
    task,
    agentType,
    thinkingLevel,
    workingDirectory,
  },
  onTurnStarted: () => registerSubAgent(context, subagent, agentType),
});
```

- [ ] **Step 5: Run dispatch tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts
git commit -m "refactor: share subagent turn runner"
```

---

### Task 4: Implement `resume_agent` Backend Tool

**Files:**

- Create: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`
- Create: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/index.ts`

- [ ] **Step 1: Write failing resume tool tests**

Create `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`:

```typescript
import crypto from 'node:crypto';

import {SubAgentType} from '@omnicraft/api-schema';
import {describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {resumeAgentTool} from './resume-agent-tool.js';
import {SubAgentToolRegistry} from './sub-agent-tool-registry.js';

function createMockSubagent(
  overrides: {
    id?: string;
    isRunning?: boolean;
    output?: string;
    blockUntil?: Promise<void>;
  } = {},
): Agent & {handledMessages: string[]} {
  const handledMessages: string[] = [];
  const agentId = overrides.id ?? crypto.randomUUID();
  const subagent = {
    id: agentId,
    title: 'Reusable Subagent',
    sseLog: {activeReaderCount: 0},
    handledMessages,
    handleUserMessage(message: string) {
      handledMessages.push(message);
    },
    abort: vi.fn(),
    async *subscribe() {
      if (overrides.blockUntil) await overrides.blockUntil;
      yield {
        nextIndex: 1,
        event: {
          type: 'message-start',
          role: 'assistant',
          messageId: 'assistant-1',
          createdAt: 1,
          content: '',
        },
      };
      yield {
        nextIndex: 2,
        event: {type: 'text-delta', content: overrides.output ?? 'resumed'},
      };
      yield {nextIndex: 3, event: {type: 'done', reason: 'complete'}};
    },
    getWorkingDirectory() {
      return '/workspace/project';
    },
    getThinkingLevel() {
      return 'none' as const;
    },
  } as Agent & {handledMessages: string[]};

  Object.defineProperty(subagent, 'isRunning', {
    get: () => overrides.isRunning ?? false,
  });
  return subagent;
}

function createContextWithEvents(): ToolExecutionContext & {events: unknown[]} {
  const events: unknown[] = [];
  const context = createMockContext({
    onSubAgentEvent: (event) => {
      events.push(event);
    },
  });
  return Object.assign(context, {events});
}

describe('resumeAgentTool', () => {
  it('has the correct name', () => {
    expect(resumeAgentTool.name).toBe('resume_agent');
  });

  it('is registered by the subagent tool registry', () => {
    SubAgentToolRegistry.resetInstance();
    try {
      const registry = SubAgentToolRegistry.create();
      expect(registry.get('resume_agent')).toBe(resumeAgentTool);
    } finally {
      SubAgentToolRegistry.resetInstance();
    }
  });

  it('returns a normal failure for malformed ids', async () => {
    const context = createMockContext();
    const result = await resumeAgentTool.execute(
      {agentId: 'not-a-uuid', task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('Invalid subagent id');
    expect(result.content).toContain('must be a UUID');
  });

  it('returns a normal failure for unknown ids', async () => {
    const context = createMockContext();
    const result = await resumeAgentTool.execute(
      {agentId: crypto.randomUUID(), task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('not available to resume');
  });

  it('returns a busy failure for running subagents', async () => {
    const context = createMockContext();
    const subagent = createMockSubagent({isRunning: true});
    context.subagentRegistry.register(subagent, SubAgentType.GENERAL);

    const result = await resumeAgentTool.execute(
      {agentId: subagent.id, task: 'Continue'},
      context,
    );

    expect(result.status).toBe('failure');
    expect(result.content).toContain('already running');
  });

  it('runs a follow-up turn on a registered idle subagent', async () => {
    const context = createContextWithEvents();
    const subagent = createMockSubagent({output: 'follow-up result'});
    context.subagentRegistry.register(subagent, SubAgentType.EXPLORE);

    const result = await resumeAgentTool.execute(
      {agentId: subagent.id, task: 'Continue analysis'},
      context,
    );

    expect(result).toMatchObject({
      status: 'success',
      data: {summary: 'follow-up result'},
      content: 'follow-up result',
    });
    expect(subagent.handledMessages).toEqual(['Continue analysis']);
    expect(context.events).toEqual([
      {
        type: 'subagent-resume',
        agentId: subagent.id,
        task: 'Continue analysis',
        agentType: SubAgentType.EXPLORE,
        thinkingLevel: 'none',
        workingDirectory: '/workspace/project',
      },
      expect.objectContaining({type: 'subagent-output'}),
      expect.objectContaining({type: 'subagent-output'}),
      expect.objectContaining({type: 'subagent-output'}),
      {type: 'subagent-complete', agentId: subagent.id, status: 'success'},
    ]);
  });

  it('rejects a second same-id resume while the first resume is claimed', async () => {
    let releaseBlocker!: () => void;
    const blocker = new Promise<void>((resolve) => {
      releaseBlocker = resolve;
    });
    const context = createMockContext();
    const subagent = createMockSubagent({blockUntil: blocker});
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
    expect(subagent.handledMessages).toEqual(['First']);
  });
});
```

- [ ] **Step 2: Run resume tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/resume-agent-tool.test.ts
```

Expected: FAIL because `resume-agent-tool.ts` does not exist.

- [ ] **Step 3: Implement `resume-agent-tool.ts`**

Create `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`:

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

const resumeClaims = new Set<string>();

const parameters = z.object({
  agentId: z
    .string()
    .min(1)
    .describe(
      'UUID of the live subagent to resume. Provide this when you already know which previously dispatched subagent should receive the follow-up task.',
    ),
  task: z
    .string()
    .min(1)
    .describe(
      'Follow-up task for the subagent. Use this to tell the existing subagent exactly what additional work to perform.',
    ),
});

function failure(message: string): ToolExecuteFailureResult {
  return {data: {message}, content: message, status: 'failure'};
}

function tryClaimResume(agentId: string): (() => void) | null {
  if (resumeClaims.has(agentId)) return null;
  resumeClaims.add(agentId);
  return () => {
    resumeClaims.delete(agentId);
  };
}

export const resumeAgentTool: ToolDefinition<
  typeof parameters,
  SubagentTurnResult
> = {
  name: 'resume_agent',
  displayName: 'Resume Agent',
  description:
    'Resumes a live subagent by sending it a follow-up task. ' +
    'Use this when you already know the id of a previously dispatched subagent that is still available and you want that same subagent to resume work with its existing context.',
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

    if (handle.agent.isRunning) {
      return failure(
        `Subagent ${agentId} is already running. Wait for it to finish before resuming it.`,
      );
    }

    const releaseClaim = tryClaimResume(agentId);
    if (!releaseClaim) {
      return failure(
        `Subagent ${agentId} is already running. Wait for it to finish before resuming it.`,
      );
    }

    try {
      if (handle.agent.isRunning) {
        return failure(
          `Subagent ${agentId} is already running. Wait for it to finish before resuming it.`,
        );
      }

      return await runSubagentTurn({
        context,
        subagent: handle.agent,
        agentType: handle.agentType,
        task: args.task,
        startEvent: {
          type: 'subagent-resume',
          agentId: handle.agent.id,
          task: args.task,
          agentType: handle.agentType,
          thinkingLevel: handle.agent.getThinkingLevel(),
          workingDirectory: handle.agent.getWorkingDirectory(),
        },
      });
    } finally {
      releaseClaim();
    }
  },
};
```

- [ ] **Step 4: Register and export the tool**

In `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`:

```typescript
import {resumeAgentTool} from './resume-agent-tool.js';
```

Register it between list and dispatch:

```typescript
instance.register(listResumableAgentsTool);
instance.register(resumeAgentTool);
instance.register(dispatchAgentTool);
```

In `apps/backend/src/agent/tools/sub-agent/index.ts`, export it:

```typescript
export {resumeAgentTool} from './resume-agent-tool.js';
```

- [ ] **Step 5: Run resume tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/resume-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 6: Run subagent tool tests together**

Run:

```bash
bun --filter @omnicraft/backend test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts src/agent/tools/sub-agent/resume-agent-tool.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts apps/backend/src/agent/tools/sub-agent/index.ts
git commit -m "feat: add resume agent tool"
```

---

### Task 5: Route `subagent-resume` Through Frontend State

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`

- [ ] **Step 1: Write failing frontend stream test**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`, add this test after the existing subagent replay test:

```typescript
it('preserves replayed resumed subagent output until the subagent display mounts', async () => {
  const agentId = '11111111-1111-4111-8111-111111111111';
  const events: SseEvent[] = [
    {
      type: 'message-start',
      role: 'user',
      messageId: 'user-1',
      createdAt: 1,
      content: 'resume subagent',
    },
    {
      type: 'message-start',
      role: 'assistant',
      messageId: 'assistant-1',
      createdAt: 2,
      content: '',
    },
    {
      type: 'subagent-resume',
      agentId,
      task: 'Continue the replay path',
      agentType: 'general',
      thinkingLevel: 'none',
      workingDirectory: '/tmp/project',
    },
    {
      type: 'subagent-output',
      agentId,
      event: {
        type: 'message-start',
        role: 'user',
        messageId: 'subagent-user-1',
        createdAt: 3,
        content: 'Continue the replay path',
      },
    },
    {
      type: 'subagent-output',
      agentId,
      event: {
        type: 'message-start',
        role: 'assistant',
        messageId: 'subagent-assistant-1',
        createdAt: 4,
        content: '',
      },
    },
    {
      type: 'subagent-output',
      agentId,
      event: {type: 'text-delta', content: 'Resumed replay content'},
    },
    {type: 'subagent-output', agentId, event: {type: 'done', reason: 'complete'}},
    {type: 'subagent-complete', agentId, status: 'success'},
    {type: 'done', reason: 'complete'},
  ];

  render(
    <ChatSessionApiContext value={createApi(events)}>
      <ChatEventBusProvider>
        <HarnessContent />
      </ChatEventBusProvider>
    </ChatSessionApiContext>,
  );

  await flushAsyncWork();
  act(flushRaf);

  const trigger = await screen.findByRole('button', {
    name: /Continue the replay path/,
  });
  if (trigger.getAttribute('aria-expanded') === 'false') {
    fireEvent.click(trigger);
  }

  await flushAsyncWork();
  act(flushRaf);
  await flushAsyncWork();
  act(flushRaf);

  expect(screen.getByText('Resume')).toBeInTheDocument();
  expect(screen.getByText('Resumed replay content')).toBeInTheDocument();
});
```

- [ ] **Step 2: Update message transform tests to expect mode**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`, update existing subagent message fixtures and expectations to include `mode: 'dispatch'`:

```typescript
content: {
  type: 'subagent',
  mode: 'dispatch',
  agentId: 'agent-1',
  task: 'Search config files',
  agentType: 'general',
  thinkingLevel: 'none',
  workingDirectory: '/tmp',
  status: 'running',
  eventBus: mockBus,
},
```

and expected render item:

```typescript
{
  type: 'subagent',
  mode: 'dispatch',
  agentId: 'agent-1',
  task: 'Search config files',
  agentType: 'general',
  thinkingLevel: 'none',
  workingDirectory: '/tmp',
  status: 'running',
  eventBus: mockBus,
}
```

Add a new transform test:

```typescript
it('converts a resumed subagent message to SubagentRenderItem', () => {
  const mockBus = {} as ChatEventBus;
  const messages: ChatMessage[] = [
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'subagent',
        mode: 'resume',
        agentId: 'agent-1',
        task: 'Continue config search',
        agentType: 'general',
        thinkingLevel: 'none',
        workingDirectory: '/tmp',
        status: 'running',
        eventBus: mockBus,
      },
    },
  ];

  expect(transformMessages(messages)).toEqual([
    {
      type: 'subagent',
      mode: 'resume',
      agentId: 'agent-1',
      task: 'Continue config search',
      agentType: 'general',
      thinkingLevel: 'none',
      workingDirectory: '/tmp',
      status: 'running',
      eventBus: mockBus,
    },
  ]);
});
```

- [ ] **Step 3: Run frontend tests to verify they fail**

Run:

```bash
bun --filter @omnicraft/frontend test -- src/modules/chat-session/hooks/useStreamChat.test.tsx src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts
```

Expected: FAIL because `subagent-resume` is not routed and `mode` is not typed.

- [ ] **Step 4: Add mode to frontend message types**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`, add:

```typescript
export type SubagentMode = 'dispatch' | 'resume';
```

Update `SubagentContent`:

```typescript
export interface SubagentContent {
  type: 'subagent';
  mode: SubagentMode;
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

Update `ChatEventMap['subagent-dispatched']`:

```typescript
'subagent-dispatched': {
  mode: SubagentMode;
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  eventBus: ChatEventBus;
};
```

- [ ] **Step 5: Route resume events in `useStreamChat`**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, add these type imports:

```typescript
import type {
  SseSubagentDispatchEvent,
  SseSubagentResumeEvent,
} from '@omnicraft/sse-events';
```

Add this module-scope helper below the retry constants:

```typescript
function startSubagentDisplay(
  event: SseSubagentDispatchEvent | SseSubagentResumeEvent,
  subagentBusMap: Map<string, ChatEventBus>,
  eventBus: ChatEventBus,
): void {
  const bus = new SubagentEventBus();
  subagentBusMap.set(event.agentId, bus);
  eventBus.emit('subagent-dispatched', {
    mode: event.type === 'subagent-resume' ? 'resume' : 'dispatch',
    agentId: event.agentId,
    task: event.task,
    agentType: event.agentType,
    thinkingLevel: event.thinkingLevel,
    workingDirectory: event.workingDirectory,
    eventBus: bus,
  });
}
```

Replace the `subagent-dispatch` switch case with:

```typescript
case 'subagent-dispatch':
case 'subagent-resume':
  startSubagentDisplay(event, subagentBusMap, eventBus);
  break;
```

- [ ] **Step 6: Store mode in messages and render items**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts`, update `pushSubagentStart` input:

```typescript
data: {
  mode: 'dispatch' | 'resume';
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  eventBus: ChatEventBus;
},
```

Set `mode` in the content:

```typescript
content: {
  type: 'subagent' as const,
  mode: data.mode,
  agentId: data.agentId,
  task: data.task,
  agentType: data.agentType,
  thinkingLevel: data.thinkingLevel,
  workingDirectory: data.workingDirectory,
  status: 'running' as const,
  eventBus: data.eventBus,
},
```

Update `onSubagentDispatched` data type to include `mode: 'dispatch' | 'resume'`.

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`, update `SubagentRenderItem`:

```typescript
export interface SubagentRenderItem {
  type: 'subagent';
  mode: 'dispatch' | 'resume';
  agentId: string;
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

Include mode in `transformMessages`:

```typescript
items.push({
  type: 'subagent',
  mode: content.mode,
  agentId: content.agentId,
  task: content.task,
  agentType: content.agentType,
  thinkingLevel: content.thinkingLevel,
  workingDirectory: content.workingDirectory,
  status: content.status,
  eventBus: content.eventBus,
});
```

- [ ] **Step 7: Run frontend tests to verify they pass**

Run:

```bash
bun --filter @omnicraft/frontend test -- src/modules/chat-session/hooks/useStreamChat.test.tsx src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts
```

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts
git commit -m "feat: route resumed subagent streams"
```

---

### Task 6: Show Dispatch/Resume Mode and Subagent ID in UI

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosure.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/styles.module.css`

- [ ] **Step 1: Write failing UI tests**

If there is no existing test file for `SubagentDisclosure`, create `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.test.tsx`:

```typescript
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventMap} from '../../../../types.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

function renderView(mode: 'dispatch' | 'resume') {
  return render(
    <SubagentDisclosureView
      agentId='11111111-1111-4111-8111-111111111111'
      mode={mode}
      task='Inspect files'
      agentType='general'
      thinkingLevel='none'
      workingDirectory='/workspace/project'
      status='running'
      eventBus={new EventBus<ChatEventMap>()}
      scrollRef={{current: null}}
    />,
  );
}

describe('SubagentDisclosureView', () => {
  it('shows dispatch mode and subagent id copy', () => {
    renderView('dispatch');

    expect(screen.getByText('Dispatch')).toBeInTheDocument();
    expect(screen.getByText('Subagent ID')).toBeInTheDocument();
    expect(
      screen.getByText('11111111-1111-4111-8111-111111111111'),
    ).toBeInTheDocument();
  });

  it('shows resume mode and resumed subagent id copy', () => {
    renderView('resume');

    expect(screen.getByText('Resume')).toBeInTheDocument();
    expect(screen.getByText('Resumed subagent ID')).toBeInTheDocument();
    expect(
      screen.getByText('11111111-1111-4111-8111-111111111111'),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the UI test to verify it fails**

Run:

```bash
bun --filter @omnicraft/frontend test -- src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.test.tsx
```

Expected: FAIL because `agentId` and `mode` props do not exist on `SubagentDisclosureView`.

- [ ] **Step 3: Pass `agentId` and `mode` through render components**

In `RenderItem.tsx`, update the `subagent` case:

```tsx
<SubagentDisclosure
  agentId={item.agentId}
  mode={item.mode}
  task={item.task}
  agentType={item.agentType}
  thinkingLevel={item.thinkingLevel}
  workingDirectory={item.workingDirectory}
  status={item.status}
  eventBus={item.eventBus}
/>
```

In `SubagentDisclosure.tsx`, update props:

```typescript
interface SubagentDisclosureProps {
  agentId: string;
  mode: 'dispatch' | 'resume';
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

Pass the props into the view:

```tsx
<SubagentDisclosureView
  agentId={agentId}
  mode={mode}
  task={task}
  agentType={agentType}
  thinkingLevel={thinkingLevel}
  workingDirectory={workingDirectory}
  status={status}
  eventBus={eventBus}
  scrollRef={containerRef}
/>
```

- [ ] **Step 4: Render mode label and id row**

In `SubagentDisclosureView.tsx`, update props:

```typescript
interface SubagentDisclosureViewProps {
  agentId: string;
  mode: 'dispatch' | 'resume';
  task: string;
  agentType: string;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
  scrollRef: RefObject<HTMLDivElement | null>;
}
```

Add local labels inside the component before `return`:

```typescript
const modeLabel = mode === 'resume' ? 'Resume' : 'Dispatch';
const idLabel = mode === 'resume' ? 'Resumed subagent ID' : 'Subagent ID';
```

Add the mode tag after the bot icon in the trigger:

```tsx
<span className={clsx(styles.modeTag, mode === 'resume' && styles.resumeTag)}>
  {modeLabel}
</span>
```

Add the id row inside `taskDetail` after `taskText` and before `workingDir`:

```tsx
<div className={styles.idRow}>
  <span className={styles.label}>{idLabel}</span>
  <code className={styles.subagentId}>{agentId}</code>
</div>
```

- [ ] **Step 5: Add CSS for the mode tag and id row**

In `styles.module.css`, add:

```css
.modeTag {
  flex-shrink: 0;
  border-radius: 6px;
  padding: 2px 6px;
  font-size: 0.6875rem;
  font-weight: 600;
  color: var(--muted);
  background: color-mix(in oklch, var(--foreground) 8%, transparent);
}

.resumeTag {
  color: var(--accent);
  background: color-mix(in oklch, var(--accent) 12%, transparent);
}

.idRow {
  display: grid;
  gap: 2px;
}

.subagentId {
  font-size: 0.75rem;
  color: var(--foreground);
  font-family: ui-monospace, 'SF Mono', 'Fira Code', monospace;
  word-break: break-all;
}
```

- [ ] **Step 6: Run UI and stream tests**

Run:

```bash
bun --filter @omnicraft/frontend test -- src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.test.tsx src/modules/chat-session/hooks/useStreamChat.test.tsx src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosure.tsx apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.test.tsx apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/styles.module.css
git commit -m "feat: label resumed subagent turns"
```

---

### Task 7: Final Verification

**Files:**

- No source changes expected.

- [ ] **Step 1: Run backend typecheck and focused tests**

Run:

```bash
bun --filter @omnicraft/sse-events typecheck
bun --filter @omnicraft/sse-events test -- src/schema.test.ts
bun --filter @omnicraft/backend typecheck
bun --filter @omnicraft/backend test -- src/agent-core/agent/agent.test.ts src/agent/tools/sub-agent/dispatch-agent-tool.test.ts src/agent/tools/sub-agent/list-resumable-agents-tool.test.ts src/agent/tools/sub-agent/resume-agent-tool.test.ts
```

Expected: all commands exit 0.

- [ ] **Step 2: Run frontend typecheck and focused tests**

Run:

```bash
bun --filter @omnicraft/frontend typecheck
bun --filter @omnicraft/frontend test -- src/modules/chat-session/hooks/useStreamChat.test.tsx src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.test.tsx
```

Expected: all commands exit 0.

- [ ] **Step 3: Run lint and diff checks**

Run:

```bash
bun --filter @omnicraft/backend lint
bun --filter @omnicraft/frontend lint
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit any verification-only fixes**

If Step 1, Step 2, or Step 3 required code fixes, commit those fixes:

```bash
git status -sb
git add <fixed-files>
git commit -m "fix: stabilize resume agent tool"
```

Expected: no commit is needed when all verification commands pass without further edits.
