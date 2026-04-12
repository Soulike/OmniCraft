# Subagent Chat UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display subagent execution as collapsible Disclosure panels in the chat message flow, reusing `StreamingMessageDisplay` for expanded content.

**Architecture:** Backend adds `status` to `subagent-complete` SSE events. Frontend refactors `stream-done` → `done` + `turn-done`, extracts `routeBaseEventToBus` for unified event routing, and adds `SubagentDisclosure` component that wraps `StreamingMessageDisplay` with an independent `ChatEventBus` per subagent.

**Tech Stack:** TypeScript, React, Zod, HeroUI Disclosure, lucide-react, CSS Modules, Vitest

---

### Task 1: Add `status` to `subagent-complete` SSE event schema

**Files:**

- Modify: `packages/sse-events/src/schema.ts`

- [ ] **Step 1: Update the schema**

In `packages/sse-events/src/schema.ts`, add `status` field to `sseSubagentCompleteEventSchema`:

```typescript
export const sseSubagentCompleteEventSchema = z.object({
  type: z.literal('subagent-complete'),
  agentId: z.string(),
  status: z.enum(['success', 'failure']),
});
```

- [ ] **Step 2: Run typecheck**

Run: `cd packages/sse-events && bun run typecheck`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add packages/sse-events/src/schema.ts
git commit -m "feat(sse-events): add status field to subagent-complete event"
```

---

### Task 2: Emit `status` in backend dispatch-agent-tool

**Files:**

- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`

- [ ] **Step 1: Update success path**

In `dispatch-agent-tool.ts`, around line 188, update the success-path emit:

```typescript
context.onSubAgentEvent({
  type: 'subagent-complete',
  agentId: subagent.id,
  status: 'success',
});
```

- [ ] **Step 2: Update error path**

Around line 202, update the catch-block emit:

```typescript
context.onSubAgentEvent({
  type: 'subagent-complete',
  agentId: subagent.id,
  status: 'failure',
});
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts
git commit -m "feat(backend): emit status in subagent-complete events"
```

---

### Task 3: Refactor ChatEventMap — rename `stream-done` to `done`, add `turn-done` and subagent events

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/index.ts`

- [ ] **Step 1: Update types.ts**

In `types.ts`, add `SubagentContent` interface and update `MessageContent` union:

```typescript
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';

import type {EventBus} from '@/helpers/event-bus.js';

/** Text content from the LLM or user input. */
export interface TextContent {
  type: 'text';
  content: string;
}

/** Thinking/reasoning content from the LLM. */
export interface ThinkingContent {
  type: 'thinking';
  content: string;
  done: boolean;
}

/** Subagent execution content. */
export interface SubagentContent {
  type: 'subagent';
  agentId: string;
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

/** A single content entry in a chat message. */
export type MessageContent =
  | TextContent
  | ThinkingContent
  | SseToolExecuteStartEvent
  | SseToolExecuteEndEvent
  | SubagentContent;

/** A chat message for UI rendering. Each message has exactly one content. */
export interface ChatMessage {
  id: string | null;
  createdAt: number | null;
  role: 'user' | 'assistant';
  content: MessageContent;
}

// ---------------------------------------------------------------------------
// Chat Event Bus
// ---------------------------------------------------------------------------

/** Event map for the chat page event bus. */
export interface ChatEventMap {
  /** User sent a message. */
  'user-message-sent': {content: string};
  /** A text token arrived from the LLM. */
  'text-delta': SseTextDeltaEvent;
  /** A message has started (metadata from backend). */
  'message-start': SseMessageStartEvent;
  /** A tool started executing. */
  'tool-execute-start': SseToolExecuteStartEvent;
  /** A tool finished executing. */
  'tool-execute-end': SseToolExecuteEndEvent;
  /** Intermediate streaming output from a running tool. */
  'tool-execute-delta': SseToolExecuteDeltaEvent;
  /** Thinking/reasoning has started. */
  'thinking-start': SseThinkingStartEvent;
  /** A thinking/reasoning content delta. */
  'thinking-delta': SseThinkingDeltaEvent;
  /** Thinking/reasoning has ended. */
  'thinking-end': SseThinkingEndEvent;
  /** SSE done event pass-through. Universal for agent and subagent. */
  done: SseDoneEvent;
  /** Main agent turn completed. Carries session context for title generation. */
  'turn-done': {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
  };
  /** An error occurred during streaming. */
  'stream-error': {message: string};
  /** The stream ended (always fires in finally, regardless of outcome). */
  'stream-end': undefined;
  /** Reset all display state (messages, tool output). */
  reset: undefined;
  /** A subagent was dispatched. */
  'subagent-dispatched': {
    agentId: string;
    task: string;
    eventBus: ChatEventBus;
  };
  /** A subagent completed its work. */
  'subagent-completed': {
    agentId: string;
    status: 'success' | 'failure';
  };
}

/** Typed event bus for the chat page. */
export type ChatEventBus = EventBus<ChatEventMap>;
```

- [ ] **Step 2: Update index.ts exports**

In `index.ts`, add `SubagentContent` to the type exports:

```typescript
export {StreamingMessageDisplay} from './StreamingMessageDisplay.js';
export type {
  ChatEventBus,
  ChatEventMap,
  ChatMessage,
  MessageContent,
  SubagentContent,
  TextContent,
  ThinkingContent,
} from './types.js';
```

- [ ] **Step 3: Run typecheck (expect errors from consumers of old `stream-done`)**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: FAIL — `useStreamChat.ts`, `useSessionTitle.ts`, and `useUsage.ts` reference removed `stream-done`

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/types.ts apps/frontend/src/pages/chat/components/StreamingMessageDisplay/index.ts
git commit -m "feat(frontend): refactor ChatEventMap — done, turn-done, subagent events"
```

---

### Task 4: Update `useSessionTitle` to subscribe to `turn-done`

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useSessionTitle.ts`

- [ ] **Step 1: Update subscription**

Replace the `stream-done` subscription with `turn-done`:

```typescript
import {useCallback, useEffect, useRef, useState} from 'react';

import {generateTitle} from '@/api/chat/index.js';

import type {ChatEventMap} from '../components/StreamingMessageDisplay/index.js';
import {useChatEventBus} from './useChatEventBus.js';

/**
 * Manages the session title. Subscribes to `turn-done` and generates
 * a title after the first assistant reply. Fire-and-forget — errors are
 * logged but not surfaced to the user.
 */
export function useSessionTitle() {
  const [title, setTitle] = useState<string | null>(null);
  const eventBus = useChatEventBus();
  const titleRequestedRef = useRef(false);

  useEffect(() => {
    const onTurnDone = (data: ChatEventMap['turn-done']) => {
      if (titleRequestedRef.current) return;
      if (!data.assistantMessage) return;

      titleRequestedRef.current = true;
      void generateTitle(
        data.sessionId,
        data.userMessage,
        data.assistantMessage,
      ).then(
        (generated) => {
          setTitle(generated);
        },
        (e: unknown) => {
          console.error('Failed to generate session title', e);
        },
      );
    };

    eventBus.on('turn-done', onTurnDone);
    return () => {
      eventBus.off('turn-done', onTurnDone);
    };
  }, [eventBus]);

  const clearTitle = useCallback(() => {
    setTitle(null);
    titleRequestedRef.current = false;
  }, []);

  return {title, clearTitle};
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useSessionTitle.ts
git commit -m "refactor(frontend): useSessionTitle subscribes to turn-done"
```

---

### Task 5: Update `useUsage` to subscribe to `done`

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useUsage.ts` (if exists)
- Modify: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/hooks/useUsage.ts`

- [ ] **Step 1: Check for top-level useUsage**

Check if `apps/frontend/src/pages/chat/hooks/useUsage.ts` exists. If it does, update it the same way. If not, skip.

- [ ] **Step 2: Update InfoBar's useUsage**

In `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/hooks/useUsage.ts`:

```typescript
import type {SseDoneEvent} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import {useChatEventBus} from '../../../../../hooks/useChatEventBus.js';

/** Tracks cumulative token usage from done events. */
export function useUsage() {
  const [usage, setUsage] = useState<SseDoneEvent | null>(null);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const handler = (data: SseDoneEvent) => {
      setUsage(data);
    };
    eventBus.on('done', handler);
    return () => {
      eventBus.off('done', handler);
    };
  }, [eventBus]);

  return {usage};
}
```

Note: the state type changes from `SseUsage | null` to `SseDoneEvent | null`. Check all consumers of `useUsage` and update them to access `usage.usage` instead of `usage` directly, or keep the state as `SseUsage | null` and extract just `data.usage` in the handler:

```typescript
import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import {useChatEventBus} from '../../../../../hooks/useChatEventBus.js';

/** Tracks cumulative token usage from done events. */
export function useUsage() {
  const [usage, setUsage] = useState<SseUsage | null>(null);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const handler = (data: {usage: SseUsage}) => {
      setUsage(data.usage);
    };
    eventBus.on('done', handler);
    return () => {
      eventBus.off('done', handler);
    };
  }, [eventBus]);

  return {usage};
}
```

Use the second version (extract `data.usage`) to minimize downstream changes.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/hooks/useUsage.ts
git commit -m "refactor(frontend): useUsage subscribes to done event"
```

---

### Task 6: Extract `routeBaseEventToBus` and refactor `useStreamChat`

**Files:**

- Create: `apps/frontend/src/pages/chat/helpers/route-base-event-to-bus.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`

- [ ] **Step 1: Write test for `routeBaseEventToBus`**

Create `apps/frontend/src/pages/chat/helpers/route-base-event-to-bus.test.ts`:

```typescript
import type {SseBaseEvent} from '@omnicraft/sse-events';
import {describe, expect, it, vi} from 'vitest';

import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventMap} from '../components/StreamingMessageDisplay/index.js';
import {routeBaseEventToBus} from './route-base-event-to-bus.js';

function createBus() {
  return new EventBus<ChatEventMap>();
}

describe('routeBaseEventToBus', () => {
  it('routes text-delta to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('text-delta', handler);

    const event: SseBaseEvent = {type: 'text-delta', content: 'hello'};
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes tool-execute-start to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('tool-execute-start', handler);

    const event: SseBaseEvent = {
      type: 'tool-execute-start',
      callId: 'c1',
      toolName: 'read_file',
      displayName: 'Read File',
      arguments: '{}',
    };
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes done to bus', () => {
    const bus = createBus();
    const handler = vi.fn();
    bus.on('done', handler);

    const event: SseBaseEvent = {
      type: 'done',
      reason: 'complete',
      usage: {
        model: 'test',
        maxInputTokens: 0,
        inputTokens: 0,
        outputTokens: 0,
        cacheReadInputTokens: 0,
      },
    };
    routeBaseEventToBus(event, bus);

    expect(handler).toHaveBeenCalledWith(event);
  });

  it('routes all thinking events', () => {
    const bus = createBus();
    const startHandler = vi.fn();
    const deltaHandler = vi.fn();
    const endHandler = vi.fn();
    bus.on('thinking-start', startHandler);
    bus.on('thinking-delta', deltaHandler);
    bus.on('thinking-end', endHandler);

    routeBaseEventToBus({type: 'thinking-start'}, bus);
    routeBaseEventToBus({type: 'thinking-delta', content: 'hmm'}, bus);
    routeBaseEventToBus({type: 'thinking-end'}, bus);

    expect(startHandler).toHaveBeenCalledTimes(1);
    expect(deltaHandler).toHaveBeenCalledWith({
      type: 'thinking-delta',
      content: 'hmm',
    });
    expect(endHandler).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bun run test -- --run src/pages/chat/helpers/route-base-event-to-bus.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement `routeBaseEventToBus`**

Create `apps/frontend/src/pages/chat/helpers/route-base-event-to-bus.ts`:

```typescript
import type {SseBaseEvent} from '@omnicraft/sse-events';

import type {ChatEventBus} from '../components/StreamingMessageDisplay/index.js';

/** Routes an SSE base event to a ChatEventBus. Each case narrows the event
 *  so TypeScript verifies the type↔payload correlation. */
export function routeBaseEventToBus(
  event: SseBaseEvent,
  bus: ChatEventBus,
): void {
  switch (event.type) {
    case 'text-delta':
      bus.emit(event.type, event);
      break;
    case 'tool-execute-start':
      bus.emit(event.type, event);
      break;
    case 'tool-execute-end':
      bus.emit(event.type, event);
      break;
    case 'tool-execute-delta':
      bus.emit(event.type, event);
      break;
    case 'message-start':
      bus.emit(event.type, event);
      break;
    case 'thinking-start':
      bus.emit(event.type, event);
      break;
    case 'thinking-delta':
      bus.emit(event.type, event);
      break;
    case 'thinking-end':
      bus.emit(event.type, event);
      break;
    case 'done':
      bus.emit(event.type, event);
      break;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bun run test -- --run src/pages/chat/helpers/route-base-event-to-bus.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor `useStreamChat.ts`**

Replace the contents of `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useRef, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';
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

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  createNewSessionId,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const subagentBusMapRef = useRef(new Map<string, EventBus<ChatEventMap>>());
  const eventBus = useChatEventBus();

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

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      eventBus.emit('user-message-sent', {content: trimmed});

      let assistantText = '';

      try {
        const stream = streamChatCompletion(
          activeSessionId,
          trimmed,
          thinkingLevel,
          abortController.signal,
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              assistantText += event.content;
              routeBaseEventToBus(event, eventBus);
              break;
            case 'done':
              if (event.reason === 'max_rounds_reached') {
                setMaxRoundsReached(true);
              }
              routeBaseEventToBus(event, eventBus);
              break;
            case 'message-start':
            case 'tool-execute-start':
            case 'tool-execute-end':
            case 'tool-execute-delta':
            case 'thinking-start':
            case 'thinking-delta':
            case 'thinking-end':
              routeBaseEventToBus(event, eventBus);
              break;
            case 'error':
              eventBus.emit('stream-error', {message: event.message});
              setStreamError(event.message);
              break;
            case 'subagent-dispatch': {
              const bus = new EventBus<ChatEventMap>();
              subagentBusMapRef.current.set(event.agentId, bus);
              eventBus.emit('subagent-dispatched', {
                agentId: event.agentId,
                task: event.task,
                eventBus: bus,
              });
              break;
            }
            case 'subagent-output': {
              const bus = subagentBusMapRef.current.get(event.agentId);
              if (bus) routeBaseEventToBus(event.event, bus);
              break;
            }
            case 'subagent-complete': {
              const bus = subagentBusMapRef.current.get(event.agentId);
              if (bus) bus.emit('stream-end');
              eventBus.emit('subagent-completed', {
                agentId: event.agentId,
                status: event.status,
              });
              subagentBusMapRef.current.delete(event.agentId);
              break;
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // Intentional stop — not an error. Keep partial content.
        } else {
          console.error('Chat completion failed', e);
          const message =
            e instanceof Error ? e.message : 'An unexpected error occurred';
          eventBus.emit('stream-error', {message});
          setStreamError(message);
        }
      } finally {
        if (assistantText) {
          eventBus.emit('turn-done', {
            sessionId: activeSessionId,
            userMessage: trimmed,
            assistantMessage: assistantText,
          });
        }
        abortControllerRef.current = null;
        eventBus.emit('stream-end');
        setIsStreaming(false);
      }
    },
    [isStreaming, sessionId, createNewSessionId, eventBus],
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

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
```

- [ ] **Step 6: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 7: Run all frontend tests**

Run: `cd apps/frontend && bun run test`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/chat/helpers/route-base-event-to-bus.ts apps/frontend/src/pages/chat/helpers/route-base-event-to-bus.test.ts apps/frontend/src/pages/chat/hooks/useStreamChat.ts
git commit -m "refactor(frontend): extract routeBaseEventToBus, add subagent event routing"
```

---

### Task 7: Add subagent message handling to `useMessages`

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/hooks/useMessages.ts`

- [ ] **Step 1: Add helper functions**

Add `pushSubagentStart` and `updateSubagentStatus` functions before the `useMessages` hook:

```typescript
function pushSubagentStart(
  prev: ChatMessage[],
  data: {agentId: string; task: string; eventBus: ChatEventBus},
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {
        type: 'subagent' as const,
        agentId: data.agentId,
        task: data.task,
        status: 'running' as const,
        eventBus: data.eventBus,
      },
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

function updateSubagentStatus(
  prev: ChatMessage[],
  data: {agentId: string; status: 'success' | 'failure'},
): ChatMessage[] {
  return prev.map((msg) => {
    if (
      msg.content.type === 'subagent' &&
      msg.content.agentId === data.agentId
    ) {
      return {
        ...msg,
        content: {
          ...msg.content,
          status:
            data.status === 'success'
              ? ('complete' as const)
              : ('error' as const),
        },
      };
    }
    return msg;
  });
}
```

- [ ] **Step 2: Add event subscriptions**

In the `useEffect` inside `useMessages`, add:

```typescript
const onSubagentDispatched = (data: {
  agentId: string;
  task: string;
  eventBus: ChatEventBus;
}) => {
  setMessages((prev) => pushSubagentStart(prev, data));
};
const onSubagentCompleted = (data: {
  agentId: string;
  status: 'success' | 'failure';
}) => {
  setMessages((prev) => updateSubagentStatus(prev, data));
};

eventBus.on('subagent-dispatched', onSubagentDispatched);
eventBus.on('subagent-completed', onSubagentCompleted);
```

And in the cleanup return:

```typescript
eventBus.off('subagent-dispatched', onSubagentDispatched);
eventBus.off('subagent-completed', onSubagentCompleted);
```

Also add the import for `ChatEventBus` type:

```typescript
import type {ChatEventBus, ChatMessage} from '../types.js';
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/hooks/useMessages.ts
git commit -m "feat(frontend): handle subagent events in useMessages"
```

---

### Task 8: Add `SubagentRenderItem` to `useMessageList`

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`
- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`

- [ ] **Step 1: Write tests**

Append to `useMessageList.test.ts`. Add the import at the top:

```typescript
import type {ChatEventBus} from '../../../types.js';
```

Then add the tests:

```typescript
it('converts a running subagent message to SubagentRenderItem', () => {
  const mockBus = {} as ChatEventBus;
  const messages: ChatMessage[] = [
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'subagent',
        agentId: 'agent-1',
        task: 'Search config files',
        status: 'running',
        eventBus: mockBus,
      },
    },
  ];
  const result = transformMessages(messages);
  expect(result).toEqual([
    {
      type: 'subagent',
      agentId: 'agent-1',
      task: 'Search config files',
      status: 'running',
      eventBus: mockBus,
    },
  ]);
});

it('converts a completed subagent message to SubagentRenderItem', () => {
  const mockBus = {} as ChatEventBus;
  const messages: ChatMessage[] = [
    {
      id: null,
      createdAt: null,
      role: 'assistant',
      content: {
        type: 'subagent',
        agentId: 'agent-1',
        task: 'Search config files',
        status: 'complete',
        eventBus: mockBus,
      },
    },
  ];
  const result = transformMessages(messages);
  expect(result).toEqual([
    {
      type: 'subagent',
      agentId: 'agent-1',
      task: 'Search config files',
      status: 'complete',
      eventBus: mockBus,
    },
  ]);
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd apps/frontend && bun run test -- --run src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`
Expected: FAIL — `subagent` case not handled

- [ ] **Step 3: Add SubagentRenderItem type and transform case**

Add the import at the top of `useMessageList.ts`:

```typescript
import type {ChatEventBus} from '../../../types.js';
```

Add the `SubagentRenderItem` interface:

```typescript
export interface SubagentRenderItem {
  type: 'subagent';
  agentId: string;
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

Add to the `MessageRenderItem` union:

```typescript
export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem
  | ThinkingRenderItem
  | SubagentRenderItem;
```

Add the case in `transformMessages`:

```typescript
case 'subagent': {
  items.push({
    type: 'subagent',
    agentId: content.agentId,
    task: content.task,
    status: content.status,
    eventBus: content.eventBus,
  });
  break;
}
```

Add the import:

```typescript
import type {ChatEventBus} from '../../../types.js';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd apps/frontend && bun run test -- --run src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts
git commit -m "feat(frontend): add SubagentRenderItem to useMessageList"
```

---

### Task 9: Create `SubagentDisclosure` component

**Files:**

- Create: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/index.ts`
- Create: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosure.tsx`
- Create: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/SubagentDisclosureView.tsx`
- Create: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/styles.module.css`

- [ ] **Step 1: Create styles**

Create `styles.module.css`:

```css
.card {
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
  width: 600px;
  max-width: 100%;
}

.running {
  border-color: color-mix(in oklch, var(--accent) 40%, transparent);
}

.trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 12px;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.botIcon {
  color: var(--accent);
  flex-shrink: 0;
}

.task {
  font-weight: 600;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.statusComplete {
  color: var(--success);
  flex-shrink: 0;
}

.statusError {
  color: var(--danger);
  flex-shrink: 0;
}

.body {
  padding: 0 12px 12px;
}

.content {
  background: var(--background);
  border-radius: 8px;
  padding: 12px;
  max-height: 400px;
  overflow: auto;
}
```

- [ ] **Step 2: Create SubagentDisclosureView**

Create `SubagentDisclosureView.tsx`.

**Important:** `SubagentDisclosure` lives inside `MessageList` which is rendered by `StreamingMessageDisplay`. Importing `StreamingMessageDisplay` directly creates a circular import: `StreamingMessageDisplay` → `MessageList` → `RenderItem` → `SubagentDisclosure` → `StreamingMessageDisplay`. Break the cycle with `React.lazy`:

```tsx
import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {Bot, CircleCheck, CircleX} from 'lucide-react';
import {lazy, Suspense} from 'react';

import type {ChatEventBus} from '../../../../types.js';
import styles from './styles.module.css';

const StreamingMessageDisplay = lazy(async () => {
  const {StreamingMessageDisplay} =
    await import('../../../../StreamingMessageDisplay.js');
  return {default: StreamingMessageDisplay};
});

interface SubagentDisclosureViewProps {
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

const STATUS_ICON_SIZE = 16;

export function SubagentDisclosureView({
  task,
  status,
  eventBus,
}: SubagentDisclosureViewProps) {
  return (
    <div className={clsx(styles.card, status === 'running' && styles.running)}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {status === 'running' && <Spinner size='sm' />}
            {status === 'complete' && (
              <CircleCheck
                className={styles.statusComplete}
                size={STATUS_ICON_SIZE}
              />
            )}
            {status === 'error' && (
              <CircleX className={styles.statusError} size={STATUS_ICON_SIZE} />
            )}
            <Bot className={styles.botIcon} size={STATUS_ICON_SIZE} />
            <span className={styles.task}>{task}</span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.content}>
              <Suspense>
                <StreamingMessageDisplay eventBus={eventBus} sessionId={null} />
              </Suspense>
            </div>
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
```

- [ ] **Step 3: Create container (pass-through for now)**

Create `SubagentDisclosure.tsx`:

```tsx
import type {ChatEventBus} from '../../../../types.js';
import {SubagentDisclosureView} from './SubagentDisclosureView.js';

interface SubagentDisclosureProps {
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export function SubagentDisclosure({
  task,
  status,
  eventBus,
}: SubagentDisclosureProps) {
  return (
    <SubagentDisclosureView task={task} status={status} eventBus={eventBus} />
  );
}
```

- [ ] **Step 4: Create index.ts**

Create `index.ts`:

```typescript
export {SubagentDisclosure} from './SubagentDisclosure.js';
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/SubagentDisclosure/
git commit -m "feat(frontend): add SubagentDisclosure component"
```

---

### Task 10: Wire `SubagentDisclosure` into `RenderItem`

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Add the subagent case**

Add import and case to `RenderItem.tsx`:

```tsx
import {SubagentDisclosure} from '../SubagentDisclosure/index.js';
```

Add before the closing of the switch statement (after `case 'thinking'`):

```tsx
case 'subagent':
  return (
    <div className={styles.assistantMessage}>
      <SubagentDisclosure
        task={item.task}
        status={item.status}
        eventBus={item.eventBus}
      />
    </div>
  );
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Run all frontend tests**

Run: `cd apps/frontend && bun run test`
Expected: PASS

- [ ] **Step 4: Run lint and format**

Run: `cd apps/frontend && bun run lint && bun run format:check`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): wire SubagentDisclosure into RenderItem"
```

---

### Task 11: Final verification

- [ ] **Step 1: Run full typecheck across monorepo**

Run: `cd /Users/soulike/.superset/worktrees/omni-craft/thinkable-circus && bun run typecheck`
Expected: PASS (or run individually: `cd packages/sse-events && bun run typecheck`, `cd apps/backend && bun run typecheck`, `cd apps/frontend && bunx tsc --noEmit`)

- [ ] **Step 2: Run all tests**

Run: `cd apps/frontend && bun run test`
Expected: PASS

- [ ] **Step 3: Run lint and format**

Run: `cd apps/frontend && bun run lint && bun run format:check`
Expected: PASS
