# Session Decoupling Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Decouple Agent execution from frontend SSE connections so sessions persist independently and support reconnection via session ID.

**Architecture:** Convert Agent from pull-based (async generator consumed by HTTP handler) to push-based (internal background pump writing to AgentSseLog). Frontend connects via a persistent `GET /events` SSE endpoint that replays historical events and tails new ones. Turns are serialized via Mutex; abort writes proper completion events to the log.

**Tech Stack:** Bun, Koa, Zod, React, React Router, SSE

**Spec:** `docs/superpowers/specs/2026-04-14-session-decoupling-design.md`

---

## File Structure

**Modified:**

- `packages/sse-events/src/schema.ts` — Add `'aborted'` to done reason; add optional `content` to message-start (for replay)
- `apps/backend/src/agent-core/agent/agent-sse-log.ts` — Remove `seal()`/`get sealed`; readers end via AbortSignal only
- `apps/backend/src/agent-core/agent/agent-sse-log.test.ts` — Update tests for no-seal behavior
- `apps/backend/src/agent-core/agent/agent.ts` — Push-based refactor: add `sseLog`, `mutex`, `runTurn`, `pump`, `subscribe`, `abort`; extract `runAgentLoop` with abort completion
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` — Use `subscribe()` + `abort()` instead of generator iteration
- `apps/backend/src/services/chat/chat-service.ts` — Update `streamCompletion`; add `subscribe`, `abortCompletion`
- `apps/backend/src/dispatcher/chat/router.ts` — Modify completions (202, no SSE); add `GET /events`, `POST /abort`
- `apps/backend/src/dispatcher/chat/path.ts` — Add path constants for new endpoints
- `apps/backend/src/dispatcher/chat/helpers/sse.ts` — Export `writeSseEvent` (currently used only internally)
- `apps/frontend/src/api/chat/chat.ts` — Replace `streamChatCompletion` with `sendMessage` + `subscribeEvents` + `abortCompletion`
- `apps/frontend/src/router/router.tsx` — Add `:sessionId?` parameter to chat route
- `apps/frontend/src/pages/chat/ChatPage.tsx` — Remove `useParams` / `initialSessionId` prop wiring (provider reads param internally)
- `apps/frontend/src/pages/chat/hooks/useStreamChat.ts` — Persistent SSE connection effect, POST-only `sendMessage`/`stopGeneration`
- `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/hooks/useMessages.ts` — Remove `completeUnfinishedTools`, `stream-end` handler; add `done` handler; update `message-start` handler for replay
- `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts` — Remove `stream-end` from `ChatEventMap`
- `apps/frontend/src/pages/chat/contexts/SessionIdContext/SessionIdProvider.tsx` — Replace `useState` with `useParams`; `createNewSessionId` navigates after creation; `clearSessionId` navigates to `/chat`

---

### Task 1: SSE Event Schema Changes

**Files:**

- Modify: `packages/sse-events/src/schema.ts`

- [ ] **Step 1: Add `'aborted'` to done reason enum**

```typescript
// packages/sse-events/src/schema.ts — line 68
// Change:
reason: z.enum(['complete', 'max_rounds_reached']),
// To:
reason: z.enum(['complete', 'max_rounds_reached', 'aborted']),
```

- [ ] **Step 2: Add required `content` to message-start event**

The `content` field carries message text. For user messages it's the full text (enables session replay). For assistant messages it's an empty string (content arrives via `text-delta`).

```typescript
// packages/sse-events/src/schema.ts — lines 37-42
// Change:
export const sseMessageStartEventSchema = z.object({
  type: z.literal('message-start'),
  role: z.enum(['user', 'assistant']),
  messageId: z.string(),
  createdAt: z.number(),
});
// To:
export const sseMessageStartEventSchema = z.object({
  type: z.literal('message-start'),
  role: z.enum(['user', 'assistant']),
  messageId: z.string(),
  createdAt: z.number(),
  content: z.string(),
});
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/sse-events && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```
feat(sse-events): add 'aborted' done reason and content to message-start
```

---

### Task 2: AgentSseLog — Remove Seal

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-sse-log.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-sse-log.test.ts`

- [ ] **Step 1: Update tests — remove seal-based tests, add no-seal tests**

Remove or update test cases that use `seal()`. Add a test verifying that `append` works indefinitely and readers end only via `AbortSignal`.

In `agent-sse-log.test.ts`, remove tests that call `log.seal()` or assert `log.sealed`. Replace the "reader ends when log is sealed" test with:

```typescript
describe('reader ends only via AbortSignal', () => {
  it('reader blocks indefinitely when not aborted', async () => {
    const log = new AgentSseLog();
    log.append(textDelta('a'));

    const reader = log.createReader();
    const iter = reader[Symbol.asyncIterator]();

    // First event is available immediately
    const first = await iter.next();
    expect(first.value).toEqual(textDelta('a'));

    // Next call blocks — resolve a race to prove it
    const timeout = new Promise<'timeout'>((r) =>
      setTimeout(() => r('timeout'), 50),
    );
    const next = iter.next().then(() => 'resolved' as const);
    expect(await Promise.race([next, timeout])).toBe('timeout');
  });

  it('reader ends when signal is aborted after draining', async () => {
    const log = new AgentSseLog();
    log.append(textDelta('a'));
    log.append(textDelta('b'));

    const controller = new AbortController();
    const collected = collect(log.createReader({signal: controller.signal}));

    // Let the reader drain existing events, then abort
    await new Promise((r) => setTimeout(r, 10));
    controller.abort();

    const events = await collected;
    expect(events).toEqual([textDelta('a'), textDelta('b')]);
  });
});
```

Remove the `'append and seal basics'` test assertions about sealed state and throwing on sealed append. Replace with:

```typescript
it('append always works (no seal)', () => {
  const log = new AgentSseLog();
  log.append(textDelta('a'));
  log.append(textDelta('b'));
  log.append(textDelta('c'));
  expect(log.length).toBe(3);
  // Can keep appending indefinitely
  log.append(doneEvent());
  expect(log.length).toBe(4);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/backend && bun test agent-sse-log`
Expected: FAIL (seal still exists, removed tests reference it)

- [ ] **Step 3: Remove seal from AgentSseLog**

In `agent-sse-log.ts`:

1. Remove `private isSealedFlag = false;`
2. Remove `get sealed(): boolean` getter
3. Remove `seal(): void` method
4. Remove `if (this.isSealedFlag)` guard from `append()`
5. Remove `if (this.isSealedFlag) return;` from `readerIterator()`

The resulting class:

```typescript
export class AgentSseLog {
  private readonly events: SseEvent[] = [];
  private readonly waiters = new Set<() => void>();

  get length(): number {
    return this.events.length;
  }

  append(event: SseEvent): void {
    this.events.push(event);
    this.notifyWaiters();
  }

  createReader(options?: AgentSseLogReaderOptions): AsyncIterable<SseEvent> {
    const startIndex = options?.startIndex ?? 0;
    assert(startIndex >= 0, 'startIndex must be non-negative');
    const signal = options?.signal;
    return {
      [Symbol.asyncIterator]: () => this.readerIterator(startIndex, signal),
    };
  }

  private async *readerIterator(
    cursor: number,
    signal?: AbortSignal,
  ): AsyncIterableIterator<SseEvent> {
    if (signal?.aborted) return;

    for (;;) {
      while (cursor < this.events.length) {
        yield this.events[cursor];
        cursor++;
        if (signal?.aborted) return;
      }

      // Wait for new events or abort.
      const aborted = await this.waitForChange(signal);
      if (aborted) return;
    }
  }

  private waitForChange(signal?: AbortSignal): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      const cleanup = (): void => {
        this.waiters.delete(onNotify);
        signal?.removeEventListener('abort', onAbort);
      };

      const onNotify = (): void => {
        cleanup();
        resolve(false);
      };

      const onAbort = (): void => {
        cleanup();
        resolve(true);
      };

      this.waiters.add(onNotify);

      if (signal) {
        if (signal.aborted) {
          cleanup();
          resolve(true);
          return;
        }
        signal.addEventListener('abort', onAbort, {once: true});
      }
    });
  }

  private notifyWaiters(): void {
    const current = [...this.waiters];
    this.waiters.clear();
    for (const notify of current) {
      notify();
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/backend && bun test agent-sse-log`
Expected: PASS

- [ ] **Step 5: Commit**

```
refactor(backend): remove seal from AgentSseLog
```

---

### Task 3: Agent Class Refactor

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/types.ts` (if needed for export)

This is the largest task. It restructures the Agent from pull-based to push-based execution.

- [ ] **Step 1: Add new imports and properties**

Add imports at top of `agent.ts`:

```typescript
import {Mutex} from '@/helpers/mutex.js';

import {AgentSseLog} from './agent-sse-log.js';
```

Add new properties to the `Agent` class (after `userInteractionBridge`):

```typescript
/** Append-only event log. All turns write to the same log. */
readonly sseLog = new AgentSseLog();

/** Serializes turns — only one runs at a time. */
private readonly mutex = new Mutex();

/** Per-turn abort controller. Null when no turn is running. */
private abortController: AbortController | null = null;
```

- [ ] **Step 2: Add `subscribe()` and `abort()` methods**

Add after `submitUserResponse()`:

```typescript
/** Returns an async iterable of events from this agent's log. */
subscribe(options?: AgentSseLogReaderOptions): AsyncIterable<SseEvent> {
  return this.sseLog.createReader(options);
}

/** Aborts the currently running turn, if any. */
abort(): void {
  this.abortController?.abort();
}
```

Add necessary imports:

```typescript
import type {SseEvent} from '@omnicraft/sse-events';

import type {AgentSseLogReaderOptions} from './agent-sse-log.js';
```

- [ ] **Step 3: Add `runTurn()` and `pump()` private methods**

```typescript
/**
 * Acquires the turn mutex, runs the agent loop, and pumps events to sseLog.
 * Multiple calls queue safely behind the mutex.
 */
private async runTurn(
  userMessage: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  const release = await this.mutex.acquire();
  try {
    this.abortController = new AbortController();
    const stream = this.runAgentLoop(
      userMessage,
      thinkingLevel,
      this.abortController.signal,
    );
    await this.pump(stream);
  } finally {
    this.abortController = null;
    release();
  }
}

/** Consumes an event stream and appends each event to sseLog. */
private async pump(stream: AgentEventStream): Promise<void> {
  try {
    for await (const event of stream) {
      this.sseLog.append(event);
    }
  } catch {
    this.sseLog.append({type: 'error', message: 'An internal error occurred'});
  }
}
```

- [ ] **Step 4: Add `emitAbortCompletion()` private method**

```typescript
/**
 * Yields tool-execute-end events for any in-flight tools,
 * then yields done(aborted). Ensures the sseLog always has
 * a complete event sequence after abort.
 */
private async *emitAbortCompletion(
  inFlightToolCalls: Set<string>,
): AgentEventStream {
  for (const callId of inFlightToolCalls) {
    yield {
      type: 'tool-execute-end',
      callId,
      result: 'Aborted',
      status: 'error',
      data: {message: 'Aborted'},
    } satisfies SseToolExecuteEndEvent;
  }
  yield {
    type: 'done',
    reason: 'aborted',
    usage: await this.buildSseUsage(),
  } satisfies SseDoneEvent;
}
```

- [ ] **Step 5: Rename `handleUserMessage` to `runAgentLoop` (private), add abort completion**

Rename the existing `handleUserMessage` generator to `private async *runAgentLoop`. Keep the same body with these changes:

1. Add `inFlightToolCalls` tracking set at the top of the method.
2. At each `tool-execute-start` yield, add the callId to the set.
3. When yielding events from the tool channel, delete callIds for `tool-execute-end` events. Add `if (signal.aborted) break;` to exit the channel loop early.
4. At each abort checkpoint, replace bare `return` with `yield* this.emitAbortCompletion(inFlightToolCalls); return;`.

```typescript
private async *runAgentLoop(
  userMessage: string,
  thinkingLevel: ThinkingLevel,
  signal: AbortSignal,
): AgentEventStream {
  const inFlightToolCalls = new Set<string>();
  const maxRounds = await this.getMaxToolRounds();

  const {
    stream: userStream,
    messageId,
    createdAt,
  } = this.llmSession.sendUserMessage(
    userMessage,
    [...this.getAvailableTools().values()],
    this.buildSystemPrompt(),
    thinkingLevel,
    signal,
  );

  yield {
    type: 'message-start',
    role: 'user',
    messageId,
    createdAt,
    content: userMessage,
  } satisfies SseMessageStartEvent;

  let toolCalls = yield* this.consumeStream(userStream);

  let round = 0;
  while (toolCalls.length > 0) {
    if (signal.aborted) {
      yield* this.emitAbortCompletion(inFlightToolCalls);
      return;
    }

    round++;
    if (round > maxRounds) {
      yield {
        type: 'done',
        reason: 'max_rounds_reached',
        usage: await this.buildSseUsage(),
      } satisfies SseDoneEvent;
      return;
    }

    const availableTools = this.getAvailableTools();

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

    const toolSseEventChannel = new AsyncChannel<
      SseToolExecuteEndEvent | SseToolExecuteDeltaEvent | SseSubAgentEvent
    >();
    const toolResults = new Map<string, ToolResult>();

    for (const toolCall of toolCalls) {
      if (availableTools.has(toolCall.toolName)) continue;
      toolResults.set(toolCall.callId, {
        callId: toolCall.callId,
        content: `Error: Unknown tool: ${toolCall.toolName}`,
      });
    }

    const executions = toolCalls
      .filter((tc) => availableTools.has(tc.toolName))
      .map(async (toolCall) => {
        const result = await this.executeTool(
          toolCall,
          availableTools,
          toolSseEventChannel,
          signal,
        );

        const tool = availableTools.get(toolCall.toolName);
        if (!tool?.suppressToolEvents) {
          toolSseEventChannel.push({
            type: 'tool-execute-end' as const,
            callId: toolCall.callId,
            result: result.content,
            status: result.status,
            data: result.data,
          } satisfies SseToolExecuteEndEvent);
        }

        toolResults.set(toolCall.callId, {
          callId: toolCall.callId,
          content: result.content,
        });
      });

    void Promise.all(executions)
      .catch(() => {})
      .finally(() => {
        toolSseEventChannel.close();
      });

    for await (const event of toolSseEventChannel) {
      if (event.type === 'tool-execute-end') {
        inFlightToolCalls.delete(event.callId);
      }
      yield event;
      if (signal.aborted) break;
    }

    if (signal.aborted) {
      yield* this.emitAbortCompletion(inFlightToolCalls);
      return;
    }

    const orderedResults = toolCalls.flatMap((tc) => {
      const result = toolResults.get(tc.callId);
      return result ? [result] : [];
    });

    toolCalls = yield* this.consumeStream(
      this.llmSession.submitToolResults(
        orderedResults,
        [...this.getAvailableTools().values()],
        this.buildSystemPrompt(),
        thinkingLevel,
        signal,
      ),
    );
  }

  yield {
    type: 'done',
    reason: 'complete',
    usage: await this.buildSseUsage(),
  } satisfies SseDoneEvent;
}
```

- [ ] **Step 6: Update `consumeStream` — add `content` to assistant message-start**

In the existing `consumeStream` private method, update the `message-start` case to include the required `content` field (empty string for assistant):

```typescript
case 'message-start':
  yield {
    type: 'message-start',
    role: 'assistant',
    messageId: event.messageId,
    createdAt: event.createdAt,
    content: '',
  } satisfies SseMessageStartEvent;
  break;
```

- [ ] **Step 7: Replace `handleUserMessage` with fire-and-forget**

```typescript
/**
 * Handles a user message by running the full Agent Loop in the background.
 * Events are written to {@link sseLog}. Use {@link subscribe} to read them.
 */
handleUserMessage(
  userMessage: string,
  thinkingLevel: ThinkingLevel,
): void {
  void this.runTurn(userMessage, thinkingLevel);
}
```

Remove `signal` from the method's JSDoc and parameter list. The method no longer returns `AgentEventStream`.

- [ ] **Step 8: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: Errors in chat-service.ts, router.ts, dispatch-agent-tool.ts (they still use the old signature). These will be fixed in subsequent tasks.

- [ ] **Step 9: Commit**

```
refactor(backend): convert Agent to push-based execution with sseLog
```

---

### Task 4: Subagent Dispatch Tool Adaptation

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`

- [ ] **Step 1: Update dispatch tool to use push-based pattern**

Replace the try block (lines 177-229) with:

```typescript
// Link parent abort signal to subagent
const onAbort = () => subagent.abort();
context.signal.addEventListener('abort', onAbort, {once: true});

context.onSubAgentEvent({
  type: 'subagent-dispatch',
  agentId: subagent.id,
  task,
  agentType,
  thinkingLevel,
  workingDirectory,
});

try {
  // Subscribe before starting — ensures the reader is in place before events flow.
  let lastReplyText = '';
  let completed = false;
  const eventIter = subagent.subscribe({signal: context.signal});

  subagent.handleUserMessage(task, thinkingLevel);

  for await (const event of eventIter) {
    // Subagents cannot emit subagent events (no SubAgentToolRegistry),
    // so all events are base events. Cast is safe by construction.
    context.onSubAgentEvent({
      type: 'subagent-output',
      agentId: subagent.id,
      event: event as SseBaseEvent,
    });

    if (event.type === 'message-start' && event.role === 'assistant') {
      lastReplyText = '';
    }
    if (event.type === 'text-delta') {
      lastReplyText += event.content;
    }
    // Subagent's sseLog is never sealed — break on done to end iteration.
    // If the parent aborts, the reader ends silently (no done seen).
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
    return {
      data: {summary},
      content: summary,
      status: 'success',
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
```

Remove the `SseBaseEvent` type import if not already present; add it:

```typescript
import type {SseBaseEvent} from '@omnicraft/sse-events';
```

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS for this file (agent.ts errors remain from Task 3)

- [ ] **Step 3: Commit**

```
refactor(backend): adapt dispatch-agent-tool to push-based Agent
```

---

### Task 5: Chat Service Layer Updates

**Files:**

- Modify: `apps/backend/src/services/chat/chat-service.ts`

- [ ] **Step 1: Update `streamCompletion` and add new methods**

Replace `streamCompletion` (currently returns `{eventStream, abort}`):

```typescript
/**
 * Sends a user message to the agent. The agent runs in the background;
 * use {@link subscribe} to read events. Returns false if agent not found.
 */
sendCompletion(
  agentId: string,
  userMessage: string,
  thinkingLevel: ThinkingLevel,
): boolean {
  const agent = AgentStore.getInstance().get(agentId);
  if (!agent) return false;
  agent.handleUserMessage(userMessage, thinkingLevel);
  return true;
}

/**
 * Returns an async iterable of SSE events for the given agent.
 * Returns undefined if agent not found.
 */
subscribe(
  agentId: string,
  options?: AgentSseLogReaderOptions,
): AsyncIterable<SseEvent> | undefined {
  const agent = AgentStore.getInstance().get(agentId);
  if (!agent) return undefined;
  return agent.subscribe(options);
}

/**
 * Aborts the currently running turn for the given agent.
 * Returns false if agent not found.
 */
abortCompletion(agentId: string): boolean {
  const agent = AgentStore.getInstance().get(agentId);
  if (!agent) return false;
  agent.abort();
  return true;
}
```

Add imports:

```typescript
import type {SseEvent} from '@omnicraft/sse-events';

import type {AgentSseLogReaderOptions} from '@/agent-core/agent/agent-sse-log.js';
```

Remove the old `StreamCompletionResult` type and the `AbortController` usage from the old `streamCompletion`.

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: Errors only in router.ts (still uses old API)

- [ ] **Step 3: Commit**

```
refactor(backend): update chat service for push-based agent
```

---

### Task 6: Backend API Changes

**Files:**

- Modify: `apps/backend/src/dispatcher/chat/path.ts`
- Modify: `apps/backend/src/dispatcher/chat/router.ts`
- Modify: `apps/backend/src/dispatcher/chat/helpers/sse.ts`

- [ ] **Step 1: Add path constants**

```typescript
// path.ts — add:
export const CHAT_SESSION_EVENTS = '/chat/session/:id/events';
export const CHAT_SESSION_ABORT = '/chat/session/:id/abort';
```

- [ ] **Step 2: Export `writeSseEvent` from sse.ts**

Change `function writeSseEvent` to `export function writeSseEvent` in `apps/backend/src/dispatcher/chat/helpers/sse.ts`.

- [ ] **Step 3: Modify POST /completions — return 202, no SSE**

Replace the completions handler (lines 59-107 in router.ts):

```typescript
/** POST /chat/session/:id/completions — starts a chat completion in the background. */
router.post(CHAT_SESSION_COMPLETIONS, (ctx) => {
  const {id} = ctx.params;

  let message: string;
  let thinkingLevel: ThinkingLevel;
  try {
    const body = chatCompletionsRequestSchema.parse(ctx.request.body);
    message = body.message;
    thinkingLevel = body.thinkingLevel;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const found = chatService.sendCompletion(id, message, thinkingLevel);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.ACCEPTED;
});
```

- [ ] **Step 4: Add GET /events endpoint**

```typescript
/** GET /chat/session/:id/events — SSE stream of agent events. */
router.get(CHAT_SESSION_EVENTS, async (ctx) => {
  const {id} = ctx.params;
  const from = Math.max(0, Number(ctx.query['from']) || 0);

  const abortController = new AbortController();
  const eventStream = chatService.subscribe(id, {
    startIndex: from,
    signal: abortController.signal,
  });
  if (!eventStream) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.type = 'text/event-stream';
  ctx.response.set('Cache-Control', 'no-cache');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  const onDisconnect = () => {
    ctx.req.off('close', onDisconnect);
    abortController.abort();
    if (!stream.destroyed) {
      stream.destroy();
    }
  };
  ctx.req.on('close', onDisconnect);

  try {
    for await (const event of eventStream) {
      writeSseEvent(stream, event);
    }
  } finally {
    ctx.req.off('close', onDisconnect);
    if (!stream.destroyed) {
      stream.end();
    }
  }
});
```

Add imports:

```typescript
import {writeSseEvent} from './helpers/sse.js';
import {CHAT_SESSION_EVENTS, CHAT_SESSION_ABORT} from './path.js';
```

Remove imports of `pumpEventStream` if no longer used.

- [ ] **Step 5: Add POST /abort endpoint**

```typescript
/** POST /chat/session/:id/abort — aborts the running agent turn. */
router.post(CHAT_SESSION_ABORT, (ctx) => {
  const {id} = ctx.params;

  const found = chatService.abortCompletion(id);
  if (!found) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  ctx.response.status = StatusCodes.NO_CONTENT;
});
```

- [ ] **Step 6: Verify backend typecheck and lint**

Run: `cd apps/backend && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Verify backend tests**

Run: `cd apps/backend && bun test`
Expected: PASS

- [ ] **Step 8: Commit**

```
feat(backend): add /events SSE and /abort endpoints, update /completions to 202
```

---

### Task 7: Frontend API Layer

**Files:**

- Modify: `apps/frontend/src/api/chat/chat.ts`

- [ ] **Step 1: Replace `streamChatCompletion` with `sendMessage` + `subscribeEvents` + `abortCompletion`**

```typescript
/**
 * Sends a message to a chat session. The agent processes it in the background.
 * Use {@link subscribeEvents} to receive events.
 */
export async function sendMessage(
  sessionId: string,
  message: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message, thinkingLevel}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat request failed (${res.status.toString()}): ${body}`);
  }
}

/**
 * Subscribes to SSE events from a chat session.
 * Replays from {@link from} index, then tails live events.
 */
export async function* subscribeEvents(
  sessionId: string,
  from: number,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const url = `${BASE}/session/${sessionId}/events?from=${from.toString()}`;
  const res = await fetch(url, {signal});

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Event subscription failed (${res.status.toString()}): ${body}`,
    );
  }

  for await (const data of parseSseStream(res)) {
    const parsed: unknown = JSON.parse(data);
    yield sseEventSchema.parse(parsed);
  }
}

/** Aborts the currently running agent turn. */
export async function abortCompletion(sessionId: string): Promise<void> {
  const res = await fetch(`${BASE}/session/${sessionId}/abort`, {
    method: 'POST',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to abort completion (${res.status.toString()}): ${body}`,
    );
  }
}
```

Remove the old `streamChatCompletion` function.

- [ ] **Step 2: Verify typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: Errors in `useStreamChat.ts` (still imports old function). Will be fixed in Task 9.

- [ ] **Step 3: Commit**

```
feat(frontend): add sendMessage, subscribeEvents, abortCompletion API functions
```

---

### Task 8: Frontend Routing & Session ID

**Files:**

- Modify: `apps/frontend/src/router/router.tsx`
- Modify: `apps/frontend/src/pages/chat/contexts/SessionIdContext/SessionIdProvider.tsx`

- [ ] **Step 1: Add `:sessionId?` parameter to chat route**

In `router.tsx`, change the chat route:

```typescript
// From:
{
  path: ROUTES.chat(),
  element: <ChatPage />,
},
// To:
{
  path: `${ROUTES.chat()}/:sessionId?`,
  element: <ChatPage />,
},
```

- [ ] **Step 2: Update SessionIdProvider — URL as source of truth**

Replace `useState` with `useParams` for sessionId. `createNewSessionId` navigates after creation. `clearSessionId` navigates to `/chat`.

```typescript
import {useCallback, useState} from 'react';
import {useNavigate, useParams} from 'react-router';

import {createSession} from '@/api/chat/index.js';
import {ROUTES} from '@/routes.js';

import {SessionIdContext} from './SessionIdContext.js';

interface SessionIdProviderProps {
  children: React.ReactNode;
}

export function SessionIdProvider({children}: SessionIdProviderProps) {
  const {sessionId} = useParams();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  const createNewSessionId = useCallback(
    async (config?: {
      workspace?: string;
      extraAllowedPaths?: readonly string[];
    }) => {
      try {
        const id = await createSession(config);
        navigate(`/chat/${id}`, {replace: true});
        return id;
      } catch (e: unknown) {
        const message =
          e instanceof Error ? e.message : 'Failed to create session';
        setError(message);
        return null;
      }
    },
    [navigate],
  );

  const clearSessionId = useCallback(() => {
    setError(null);
    navigate(ROUTES.chat(), {replace: true});
  }, [navigate]);

  const clearCreateNewSessionIdError = useCallback(() => {
    setError(null);
  }, []);

  return (
    <SessionIdContext
      value={{
        sessionId: sessionId ?? null,
        createNewSessionIdError: error,
        createNewSessionId,
        clearSessionId,
        clearCreateNewSessionIdError,
      }}
    >
      {children}
    </SessionIdContext>
  );
}
```

- [ ] **Step 3: Commit**

```
feat(frontend): add sessionId route parameter and provider prop
```

---

### Task 9: Frontend Chat Page Refactor

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/hooks/useMessages.ts`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts`

- [ ] **Step 1: Update ChatEventMap — remove `stream-end`**

In `types.ts`, remove the `'stream-end'` entry:

```typescript
// Remove:
/** The stream ended (always fires in finally, regardless of outcome). */
'stream-end': undefined;
```

- [ ] **Step 2: Update `useMessages` — replace `stream-end` with `done`, update `message-start` for replay, remove `completeUnfinishedTools`**

In `useMessages.ts`:

**Remove** the `completeUnfinishedTools` function entirely (lines 233-267).

**Replace** `applyUserMessageStart` to handle both live and replay scenarios:

```typescript
function applyUserMessageStart(
  prev: ChatMessage[],
  event: SseMessageStartEvent,
): ChatMessage[] {
  // Look for a user message without an ID (created by user-message-sent)
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user' && prev[i].id === null) {
      const updated = [...prev];
      updated[i] = {...updated[i], id: event.messageId};
      return updated;
    }
  }
  // Replay: no user-message-sent was fired. Create from event content.
  return [
    ...prev,
    {
      id: event.messageId,
      createdAt: event.createdAt,
      role: 'user' as const,
      content: {type: 'text' as const, content: event.content},
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}
```

**Replace** the `onStreamEnd` handler and subscription with a `done` handler:

```typescript
// Remove:
const onStreamEnd = () => { ... };
eventBus.on('stream-end', onStreamEnd);
eventBus.off('stream-end', onStreamEnd);

// Add:
const onDone = () => {
  setMessages(removeTrailingAssistantMessageIfEmpty);
};
eventBus.on('done', onDone);
// In cleanup:
eventBus.off('done', onDone);
```

**Update** the `onMessageStart` call to pass the full event:

```typescript
const onMessageStart = (data: SseMessageStartEvent) => {
  if (data.role === 'user') {
    setMessages((prev) => applyUserMessageStart(prev, data));
  } else {
    setMessages((prev) =>
      applyAssistantMessageStart(prev, data.messageId, data.createdAt),
    );
  }
};
```

- [ ] **Step 3: Rewrite `useStreamChat` for persistent SSE connection**

Replace the entire `useStreamChat.ts` file:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseDoneEvent, SseEvent} from '@omnicraft/sse-events';
import {useCallback, useEffect, useRef, useState} from 'react';

import {
  abortCompletion,
  sendMessage as apiSendMessage,
  subscribeEvents,
} from '@/api/chat/index.js';
import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventMap} from '../components/StreamingMessageDisplay/index.js';
import {routeBaseEventToBus} from '../helpers/route-base-event-to-bus.js';
import {useChatEventBus} from './useChatEventBus.js';
import type {useSessionId} from './useSessionId.js';

type SessionIdHook = ReturnType<typeof useSessionId>;

interface UseStreamChatOptions {
  sessionId: SessionIdHook['sessionId'];
  createNewSessionId: SessionIdHook['createNewSessionId'];
}

/** Orchestrates the persistent SSE connection and message sending. */
export function useStreamChat({
  sessionId,
  createNewSessionId,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const subagentBusMapRef = useRef(new Map<string, EventBus<ChatEventMap>>());
  const eventBus = useChatEventBus();

  // Persistent SSE connection — connects when sessionId is set.
  useEffect(() => {
    if (!sessionId) return;

    const controller = new AbortController();
    let lastUserMessage = '';
    let assistantText = '';

    eventBus.emit('reset');

    void (async () => {
      try {
        for await (const event of subscribeEvents(
          sessionId,
          0,
          controller.signal,
        )) {
          routeEvent(
            event,
            eventBus,
            subagentBusMapRef.current,
            setIsStreaming,
            setStreamError,
            setMaxRoundsReached,
          );

          // Track turn context for title generation
          if (event.type === 'message-start' && event.role === 'user') {
            lastUserMessage = event.content;
            assistantText = '';
          }
          if (event.type === 'text-delta') {
            assistantText += event.content;
          }
          if (event.type === 'done') {
            if (assistantText) {
              eventBus.emit('turn-done', {
                sessionId,
                userMessage: lastUserMessage,
                assistantMessage: assistantText,
              });
            }
            lastUserMessage = '';
            assistantText = '';
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error('SSE connection failed', e);
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setStreamError(message);
      }
    })();

    return () => {
      controller.abort();
      subagentBusMapRef.current.clear();
    };
  }, [sessionId, eventBus]);

  const sendMessage = useCallback(
    async (content: string, thinkingLevel: ThinkingLevel) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const activeSessionId = sessionId ?? (await createNewSessionId());
      if (!activeSessionId) return;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      eventBus.emit('user-message-sent', {content: trimmed});

      try {
        await apiSendMessage(activeSessionId, trimmed, thinkingLevel);
      } catch (e: unknown) {
        console.error('Failed to send message', e);
        const message =
          e instanceof Error ? e.message : 'Failed to send message';
        eventBus.emit('stream-error', {message});
        setStreamError(message);
        setIsStreaming(false);
      }
    },
    [isStreaming, sessionId, createNewSessionId, eventBus],
  );

  const stopGeneration = useCallback(() => {
    if (!sessionId) return;
    void abortCompletion(sessionId);
  }, [sessionId]);

  const clearStreamError = useCallback(() => {
    setStreamError(null);
  }, []);

  const clearMaxRoundsReached = useCallback(() => {
    setMaxRoundsReached(false);
  }, []);

  return {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  };
}

// ---------------------------------------------------------------------------
// Event routing — extracted to keep the hook body readable
// ---------------------------------------------------------------------------

function routeEvent(
  event: SseEvent,
  eventBus: EventBus<ChatEventMap>,
  subagentBusMap: Map<string, EventBus<ChatEventMap>>,
  setIsStreaming: (v: boolean) => void,
  setStreamError: (v: string | null) => void,
  setMaxRoundsReached: (v: boolean) => void,
): void {
  switch (event.type) {
    case 'text-delta':
    case 'tool-execute-start':
    case 'tool-execute-end':
    case 'tool-execute-delta':
    case 'message-start':
    case 'thinking-start':
    case 'thinking-delta':
    case 'thinking-end':
      if (event.type === 'message-start' && event.role === 'assistant') {
        setIsStreaming(true);
      }
      routeBaseEventToBus(event, eventBus);
      break;
    case 'done':
      if ((event as SseDoneEvent).reason === 'max_rounds_reached') {
        setMaxRoundsReached(true);
      }
      routeBaseEventToBus(event, eventBus);
      setIsStreaming(false);
      break;
    case 'error':
      eventBus.emit('stream-error', {message: event.message});
      setStreamError(event.message);
      setIsStreaming(false);
      break;
    case 'subagent-dispatch': {
      const bus = new EventBus<ChatEventMap>();
      subagentBusMap.set(event.agentId, bus);
      eventBus.emit('subagent-dispatched', {
        agentId: event.agentId,
        task: event.task,
        agentType: event.agentType,
        thinkingLevel: event.thinkingLevel,
        workingDirectory: event.workingDirectory,
        eventBus: bus,
      });
      break;
    }
    case 'subagent-output': {
      const bus = subagentBusMap.get(event.agentId);
      if (bus) routeBaseEventToBus(event.event, bus);
      break;
    }
    case 'subagent-complete': {
      eventBus.emit('subagent-completed', {
        agentId: event.agentId,
        status: event.status,
      });
      subagentBusMap.delete(event.agentId);
      break;
    }
  }
}
```

- [ ] **Step 4: Simplify ChatPage — provider reads URL param internally**

`ChatPage.tsx` no longer needs to read `useParams` or pass `initialSessionId`. The provider handles it. Revert `ChatPage` to its original shape (no changes needed from current code, just verify no `initialSessionId` prop is passed):

```typescript
export function ChatPage() {
  return (
    <SessionIdProvider>
      <ChatEventBusProvider>
        <SessionConfigProvider>
          <ChatPageContent />
        </SessionConfigProvider>
      </ChatEventBusProvider>
    </SessionIdProvider>
  );
}
```

`ChatPageContent` also needs no navigation effect — the provider's `createNewSessionId` navigates after creation.

- [ ] **Step 5: Update `useSessionLifecycle` — use `clearSessionId` (which now navigates)**

In `useSessionLifecycle.ts`, add navigation:

`clearSessionId` now navigates to `/chat` internally, so `useSessionLifecycle` no longer needs its own `useNavigate`. No changes needed — `startNewSession` calls `clearSessionId()` which handles navigation.

- [ ] **Step 6: Verify frontend typecheck and lint**

Run: `cd apps/frontend && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```
feat(frontend): persistent SSE connection, POST-only messaging, session URL routing
```

---

### Task 10: Full Verification

- [ ] **Step 1: Run all backend tests**

Run: `cd apps/backend && bun test`
Expected: PASS

- [ ] **Step 2: Run all frontend checks**

Run: `cd apps/frontend && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 3: Run backend lint**

Run: `cd apps/backend && bun run lint`
Expected: PASS

- [ ] **Step 4: Manual E2E testing**

1. Start a conversation, verify events flow through `/events`
2. Click stop mid-execution, verify `tool-execute-end` and `done(aborted)` events arrive via SSE
3. Refresh the page with sessionId in URL, verify conversation replays correctly
4. Open two tabs with same sessionId, verify both receive events
5. Send a message in one tab, verify the other tab also sees events

---

## Notes

**Spec addition (not in original spec):** `SseMessageStartEvent.content` was added as a required `string` field. For user messages, it carries the full message text (enables session replay without the frontend-only `user-message-sent` event). For assistant messages, it is an empty string (content arrives via `text-delta`).

**Subagent abort behavior:** When the parent aborts, the subagent's subscribe reader ends silently (via the parent's AbortSignal). The subagent's abort completion events (written to the subagent's sseLog) may not reach the parent's event stream. The dispatch tool detects this (no `done` event seen) and emits `subagent-complete(failure)`. The subagent display may appear incomplete in the abort scenario — acceptable since the entire conversation is in an aborted state.

**Subagent `done` delivery in normal flow:** The subagent's `done` event reaches the frontend via `subagent-output(done)`, routed to the subagent's event bus through `routeBaseEventToBus`. No synthetic `done` emission is needed on `subagent-complete` — the event bus already received it naturally.
