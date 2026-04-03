# Stop Chat Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Stop button that halts chat generation mid-stream, keeping partial content, with full AbortSignal propagation from frontend to LLM SDKs.

**Architecture:** Frontend creates an AbortController per send, aborting the fetch on Stop. Backend service creates its own AbortController, returns an `abort()` handle to the router, and threads the signal through Agent → LlmSession → LLM SDK. The router calls `abort()` on client disconnect.

**Tech Stack:** React 19, TypeScript, Koa, Anthropic SDK, OpenAI SDK

---

## File Map

| Layer                 | File                                                                  | Change                                           |
| --------------------- | --------------------------------------------------------------------- | ------------------------------------------------ |
| Frontend API          | `apps/frontend/src/api/chat/chat.ts`                                  | Add `signal` param to `streamChatCompletion`     |
| Frontend Hook         | `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`                 | Add AbortController, expose `stopGeneration`     |
| Frontend Container    | `apps/frontend/src/pages/chat/ChatPage.tsx`                           | Pass `stopGeneration` + `isStreaming` down       |
| Frontend View         | `apps/frontend/src/pages/chat/ChatPageView.tsx`                       | Pass `onStop` + `isStreaming` to ChatInput       |
| Frontend Component    | `apps/frontend/src/pages/chat/components/ChatInput/ChatInput.tsx`     | Add `onStop` + `isStreaming` props               |
| Frontend View         | `apps/frontend/src/pages/chat/components/ChatInput/ChatInputView.tsx` | Show Stop button when streaming                  |
| Backend Types         | `apps/backend/src/agent-core/llm-api/types.ts`                        | Add `signal` to `LlmCompletionOptions`           |
| Backend Claude        | `apps/backend/src/agent-core/llm-api/claude-adapter.ts`               | Pass signal to SDK                               |
| Backend OpenAI        | `apps/backend/src/agent-core/llm-api/openai-adapter.ts`               | Pass signal to SDK                               |
| Backend LlmSession    | `apps/backend/src/agent-core/llm-session/llm-session.ts`              | Thread signal through all methods                |
| Backend Agent         | `apps/backend/src/agent-core/agent/agent.ts`                          | Accept signal, check in loop                     |
| Backend Service       | `apps/backend/src/services/chat/chat-service.ts`                      | Return `{ eventStream, abort }`                  |
| Backend Service Types | `apps/backend/src/services/chat/types.ts`                             | Add `StreamCompletionResult` type                |
| Backend Router        | `apps/backend/src/dispatcher/chat/router.ts`                          | Destructure result, call `abort()` on disconnect |

---

### Task 1: Add `signal` to `LlmCompletionOptions`

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts`

- [ ] **Step 1: Add signal field to LlmCompletionOptions**

```typescript
/** Options for a streaming LLM completion request. */
export interface LlmCompletionOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly systemPrompt?: string;
  readonly tools: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: No errors (field is optional, existing callers unaffected).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/types.ts
git commit -m "feat(backend): add signal field to LlmCompletionOptions"
```

---

### Task 2: Pass signal to Claude SDK

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/claude-adapter.ts`

- [ ] **Step 1: Pass signal to `client.messages.stream()`**

Change the `stream` call in `streamClaude` to include the signal from options:

```typescript
const stream = client.messages.stream({
  model: config.model,
  max_tokens: 4096,
  system: systemPrompt,
  messages: messages.map(toSdkMessage),
  tools: claudeTools,
  signal: options.signal,
});
```

This is the only change in the file — add `signal: options.signal` to the stream call options.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/claude-adapter.ts
git commit -m "feat(backend): pass abort signal to Claude SDK stream"
```

---

### Task 3: Pass signal to OpenAI SDK

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/openai-adapter.ts`

- [ ] **Step 1: Pass signal to `client.chat.completions.create()`**

Change the `create` call in `streamOpenAI` to include the signal from options:

```typescript
const stream = await client.chat.completions.create(
  {
    model: config.model,
    messages: sdkMessages,
    stream: true,
    stream_options: {include_usage: true},
    ...(openaiTools.length > 0 ? {tools: openaiTools} : {}),
  },
  {signal: options.signal},
);
```

Note: OpenAI SDK takes signal in the second argument (request options), not in the body.

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/openai-adapter.ts
git commit -m "feat(backend): pass abort signal to OpenAI SDK stream"
```

---

### Task 4: Thread signal through LlmSession

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`

- [ ] **Step 1: Add signal parameter to all four methods**

Add `signal?: AbortSignal` as the last parameter to `sendUserMessage`, `submitToolResults`, `sendMessages`, and `streamCompletion`. Thread it through the call chain, ultimately passing it to `llmApi.streamCompletion`.

`sendUserMessage`:

```typescript
  async *sendUserMessage(
    content: string,
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    yield* this.sendMessages([{role: 'user', content}], tools, systemPrompt, signal);
  }
```

`submitToolResults`:

```typescript
  async *submitToolResults(
    results: ToolResult[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const toolMessages: LlmMessage[] = results.map((result) => ({
      role: 'tool' as const,
      callId: result.callId,
      content: result.content,
    }));
    yield* this.sendMessages(toolMessages, tools, systemPrompt, signal);
  }
```

`sendMessages`:

```typescript
  private async *sendMessages(
    messages: LlmMessage[],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const release = await this.mutex.acquire();
    const rollbackIndex = this.messages.length;
    this.messages.push(...messages);
    let completed = false;
    try {
      yield* this.streamCompletion(tools, systemPrompt, signal);
      completed = true;
    } finally {
      if (!completed) {
        this.messages.length = rollbackIndex;
      }
      release();
    }
  }
```

`streamCompletion` — pass signal to `llmApi.streamCompletion`:

```typescript
  private async *streamCompletion(
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
  ): LlmSessionEventStream {
    const llmConfig = await this.getConfig();
    const eventStream = llmApi.streamCompletion({
      config: llmConfig,
      messages: this.messages,
      systemPrompt: systemPrompt || undefined,
      tools,
      signal,
    });
    // ... rest of the method is unchanged
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: No errors (signal is optional, existing callers unaffected).

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/llm-session.ts
git commit -m "feat(backend): thread abort signal through LlmSession"
```

---

### Task 5: Add signal to Agent.handleUserMessage

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Add signal parameter and abort checks**

Add `signal?: AbortSignal` to `handleUserMessage`. Pass it to `sendUserMessage` and `submitToolResults`. Check `signal?.aborted` at the start of each tool execution round.

```typescript
  async *handleUserMessage(
    userMessage: string,
    signal?: AbortSignal,
  ): AgentEventStream {
    const maxRounds = await this.getMaxToolRounds();

    let toolCalls = yield* this.consumeStream(
      this.llmSession.sendUserMessage(
        userMessage,
        [...this.getAvailableTools().values()],
        this.buildSystemPrompt(),
        signal,
      ),
    );

    let round = 0;
    while (toolCalls.length > 0) {
      if (signal?.aborted) return;

      round++;
      if (round > maxRounds) {
        yield {
          type: 'done',
          reason: 'max_rounds_reached',
        } satisfies AgentDoneEvent;
        return;
      }

      const availableTools = this.getAvailableTools();
      const toolResults: ToolResult[] = [];

      for (const toolCall of toolCalls) {
        if (signal?.aborted) return;

        const tool = availableTools.get(toolCall.toolName);
        yield {
          type: 'tool-execute-start',
          callId: toolCall.callId,
          toolName: toolCall.toolName,
          displayName: tool?.displayName ?? toolCall.toolName,
          arguments: toolCall.arguments,
        } satisfies AgentToolExecuteStartEvent;

        const result = await this.executeTool(toolCall, availableTools);

        yield {
          type: 'tool-execute-end',
          callId: toolCall.callId,
          result: result.content,
          isError: result.isError,
        } satisfies AgentToolExecuteEndEvent;

        toolResults.push({callId: toolCall.callId, content: result.content});
      }

      toolCalls = yield* this.consumeStream(
        this.llmSession.submitToolResults(
          toolResults,
          [...this.getAvailableTools().values()],
          this.buildSystemPrompt(),
          signal,
        ),
      );
    }

    yield {type: 'done', reason: 'complete'} satisfies AgentDoneEvent;
  }
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts
git commit -m "feat(backend): add abort signal to agent loop with per-round checks"
```

---

### Task 6: Update chatService to return abort handle

**Files:**

- Modify: `apps/backend/src/services/chat/chat-service.ts`
- Modify: `apps/backend/src/services/chat/types.ts`
- Modify: `apps/backend/src/services/chat/index.ts`

- [ ] **Step 1: Add `StreamCompletionResult` type**

In `apps/backend/src/services/chat/types.ts`, add:

```typescript
import type {AgentEventStream} from '@/agent-core/agent/index.js';

/** Result of streamCompletion: the event stream and an abort handle. */
export interface StreamCompletionResult {
  eventStream: AgentEventStream;
  abort: () => void;
}
```

- [ ] **Step 2: Export the new type from index.ts**

In `apps/backend/src/services/chat/index.ts`, add the export:

```typescript
export {chatService} from './chat-service.js';
export type {CreateSessionResult, StreamCompletionResult} from './types.js';
export {CreateSessionError} from './types.js';
```

- [ ] **Step 3: Update `chatService.streamCompletion` to return abort handle**

In `apps/backend/src/services/chat/chat-service.ts`, change `streamCompletion`:

```typescript
  /**
   * Streams a completion for the given agent.
   * Returns undefined if the agent does not exist.
   * Returns the event stream and an abort function to cancel the stream.
   */
  streamCompletion(
    agentId: string,
    userMessage: string,
  ): StreamCompletionResult | undefined {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    const abortController = new AbortController();
    const eventStream = agent.handleUserMessage(
      userMessage,
      abortController.signal,
    );
    return {
      eventStream,
      abort: () => {
        abortController.abort();
      },
    };
  },
```

Also add the import at the top of the file:

```typescript
import type {CreateSessionResult, StreamCompletionResult} from './types.js';
```

And remove the existing `import type {AgentEventStream} from '@/agent-core/agent/index.js';` since it's no longer used directly.

- [ ] **Step 4: Verify TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: Compile error in `router.ts` because `streamCompletion` now returns `StreamCompletionResult | undefined` instead of `AgentEventStream | undefined`. This is expected and fixed in Task 7.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/services/chat/types.ts apps/backend/src/services/chat/index.ts apps/backend/src/services/chat/chat-service.ts
git commit -m "feat(backend): return abort handle from chatService.streamCompletion"
```

---

### Task 7: Update router to call abort on disconnect

**Files:**

- Modify: `apps/backend/src/dispatcher/chat/router.ts`

- [ ] **Step 1: Destructure result and call abort in onDisconnect**

Update the completions handler to destructure `{ eventStream, abort }` and call `abort()` in the disconnect handler:

```typescript
/** POST /chat/session/:id/completions — streams a chat completion. */
router.post(CHAT_SESSION_COMPLETIONS, (ctx) => {
  const {id} = ctx.params;

  let message: string;
  try {
    const body = chatCompletionsBody.parse(ctx.request.body);
    message = body.message;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = chatService.streamCompletion(id, message);
  if (!result) {
    ctx.response.status = StatusCodes.NOT_FOUND;
    ctx.response.body = {error: `Session not found: ${id}`};
    return;
  }

  const {eventStream, abort} = result;

  ctx.response.type = 'text/event-stream';
  ctx.response.set('Cache-Control', 'no-cache');
  ctx.response.set('Connection', 'keep-alive');
  ctx.response.set('X-Accel-Buffering', 'no');

  const stream = new PassThrough();
  ctx.body = stream;

  const onDisconnect = () => {
    ctx.req.off('close', onDisconnect);
    abort();
    if (!stream.destroyed) {
      stream.destroy();
    }
    void eventStream.return();
  };
  ctx.req.on('close', onDisconnect);

  void pumpEventStream(stream, eventStream).finally(() => {
    ctx.req.off('close', onDisconnect);
  });
});
```

- [ ] **Step 2: Verify backend TypeScript compiles**

Run: `cd apps/backend && bunx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Run backend tests**

Run: `cd apps/backend && bun run test`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/dispatcher/chat/router.ts
git commit -m "feat(backend): call abort on client disconnect in chat router"
```

---

### Task 8: Add signal to frontend `streamChatCompletion`

**Files:**

- Modify: `apps/frontend/src/api/chat/chat.ts`

- [ ] **Step 1: Add optional signal parameter and pass to fetch**

```typescript
/**
 * Sends a message to a chat session and yields SSE events.
 * Uses fetch() + ReadableStream since EventSource does not support POST.
 */
export async function* streamChatCompletion(
  sessionId: string,
  message: string,
  signal?: AbortSignal,
): AsyncGenerator<SseEvent, void, undefined> {
  const res = await fetch(`${BASE}/session/${sessionId}/completions`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({message}),
    signal,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Chat request failed (${res.status.toString()}): ${body}`);
  }

  for await (const data of parseSseStream(res)) {
    const parsed: unknown = JSON.parse(data);
    yield sseEventSchema.parse(parsed);
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/api/chat/chat.ts
git commit -m "feat(frontend): add abort signal to streamChatCompletion"
```

---

### Task 9: Add AbortController and stopGeneration to useStreamChat

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`

- [ ] **Step 1: Add AbortController ref, stopGeneration, and AbortError handling**

```typescript
import {useCallback, useRef, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import type {useMessages} from './useMessages.js';
import type {useSession} from './useSession.js';

type MessagesHook = ReturnType<typeof useMessages>;
type SessionHook = ReturnType<typeof useSession>;

interface UseStreamChatOptions {
  sessionId: SessionHook['sessionId'];
  resetSession: SessionHook['resetSession'];
  addUserMessage: MessagesHook['addUserMessage'];
  appendAssistantText: MessagesHook['appendAssistantText'];
  pushToolExecutionStart: MessagesHook['pushToolExecutionStart'];
  pushToolExecutionEnd: MessagesHook['pushToolExecutionEnd'];
  removeLastAssistantMessageIfEmpty: MessagesHook['removeLastAssistantMessageIfEmpty'];
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  resetSession,
  addUserMessage,
  appendAssistantText,
  pushToolExecutionStart,
  pushToolExecutionEnd,
  removeLastAssistantMessageIfEmpty,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const activeSessionId = sessionId ?? (await resetSession());
      if (!activeSessionId) return;

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      addUserMessage(trimmed);

      try {
        const stream = streamChatCompletion(
          activeSessionId,
          trimmed,
          abortController.signal,
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              appendAssistantText(event.content);
              break;
            case 'tool-execute-start':
              pushToolExecutionStart({
                type: 'tool-execution-start',
                callId: event.callId,
                toolName: event.toolName,
                displayName: event.displayName,
                arguments: event.arguments,
              });
              break;
            case 'tool-execute-end':
              pushToolExecutionEnd({
                type: 'tool-execution-end',
                callId: event.callId,
                result: event.result,
                isError: event.isError,
              });
              break;
            case 'done':
              if (event.reason === 'max_rounds_reached') {
                setMaxRoundsReached(true);
              }
              removeLastAssistantMessageIfEmpty();
              break;
            case 'error':
              removeLastAssistantMessageIfEmpty();
              setStreamError(event.message);
              break;
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // Intentional stop — not an error. Keep partial content.
        } else {
          console.error('Chat completion failed', e);
          removeLastAssistantMessageIfEmpty();
          const message =
            e instanceof Error ? e.message : 'An unexpected error occurred';
          setStreamError(message);
        }
      } finally {
        abortControllerRef.current = null;
        removeLastAssistantMessageIfEmpty();
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      resetSession,
      addUserMessage,
      appendAssistantText,
      pushToolExecutionStart,
      pushToolExecutionEnd,
      removeLastAssistantMessageIfEmpty,
    ],
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

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useStreamChat.ts
git commit -m "feat(frontend): add AbortController and stopGeneration to useStreamChat"
```

---

### Task 10: Wire stopGeneration through ChatPage and ChatPageView

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`

- [ ] **Step 1: Update ChatPage to pass stopGeneration and isStreaming**

```typescript
import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Composes hooks and passes state to the view. */
export function ChatPage() {
  const {sessionId, sessionError, resetSession, clearSessionError} =
    useSession();

  const {
    messages,
    addUserMessage,
    appendAssistantText,
    pushToolExecutionStart,
    pushToolExecutionEnd,
    removeLastAssistantMessageIfEmpty,
  } = useMessages();

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    resetSession,
    addUserMessage,
    appendAssistantText,
    pushToolExecutionStart,
    pushToolExecutionEnd,
    removeLastAssistantMessageIfEmpty,
  });

  const scrollRef = useAutoScroll();

  const displayError = sessionError ?? streamError;

  const dismissError = useCallback(() => {
    clearSessionError();
    clearStreamError();
  }, [clearSessionError, clearStreamError]);

  return (
    <ChatPageView
      messages={messages}
      isStreaming={isStreaming}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      onSend={(content) => {
        void sendMessage(content);
      }}
      onStop={stopGeneration}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
```

- [ ] **Step 2: Update ChatPageView to accept and pass the new props**

```typescript
import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {MessageList} from './components/MessageList/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSend: (content: string) => void;
  onStop: () => void;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  messages,
  isStreaming,
  error,
  maxRoundsReached,
  scrollRef,
  onSend,
  onStop,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
  return (
    <div className={styles.page}>
      {error && (
        <ChatAlert
          status='danger'
          title='Error'
          message={error}
          onDismiss={onDismissError}
        />
      )}
      {maxRoundsReached && (
        <ChatAlert
          status='warning'
          title='Tool limit reached'
          message='The assistant reached the maximum number of tool execution rounds. You can increase this limit in Settings > Agent.'
          onDismiss={onDismissMaxRoundsReached}
        />
      )}
      <div className={styles.messageListWrapper} ref={scrollRef}>
        <MessageList messages={messages} />
      </div>
      <ChatInput
        isStreaming={isStreaming}
        onSend={onSend}
        onStop={onStop}
      />
    </div>
  );
}
```

Note: `isInputDisabled` is removed. `ChatInput` now receives `isStreaming` and decides internally what to disable.

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: Compile errors in `ChatInput.tsx` because props changed. Fixed in Task 11.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPage.tsx apps/frontend/src/pages/chat/ChatPageView.tsx
git commit -m "feat(frontend): wire stopGeneration and isStreaming through ChatPage"
```

---

### Task 11: Add Stop button to ChatInput

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/ChatInput/ChatInput.tsx`
- Modify: `apps/frontend/src/pages/chat/components/ChatInput/ChatInputView.tsx`

- [ ] **Step 1: Update ChatInput container**

```typescript
import {useCallback, useState} from 'react';

import {ChatInputView} from './ChatInputView.js';

interface ChatInputProps {
  isStreaming: boolean;
  onSend: (content: string) => void;
  onStop: () => void;
}

export function ChatInput({isStreaming, onSend, onStop}: ChatInputProps) {
  const [input, setInput] = useState('');

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    onSend(input);
    setInput('');
  }, [input, onSend]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  return (
    <ChatInputView
      input={input}
      isStreaming={isStreaming}
      onInputChange={setInput}
      onKeyDown={handleKeyDown}
      onSend={handleSend}
      onStop={onStop}
    />
  );
}
```

- [ ] **Step 2: Update ChatInputView with Stop button**

```typescript
import {Button, TextArea} from '@heroui/react';
import {SendIcon, SquareIcon} from 'lucide-react';

import styles from './styles.module.css';

interface ChatInputViewProps {
  input: string;
  isStreaming: boolean;
  onInputChange: (value: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  onStop: () => void;
}

export function ChatInputView({
  input,
  isStreaming,
  onInputChange,
  onKeyDown,
  onSend,
  onStop,
}: ChatInputViewProps) {
  return (
    <div className={styles.container}>
      <TextArea
        aria-label='Chat message'
        className={styles.textarea}
        placeholder='Type a message... (Enter to send, Shift+Enter for newline)'
        rows={1}
        value={input}
        disabled={isStreaming}
        onChange={(e) => {
          onInputChange(e.target.value);
        }}
        onKeyDown={onKeyDown}
      />
      {isStreaming ? (
        <Button
          aria-label='Stop generation'
          color='danger'
          isIconOnly
          onPress={onStop}
        >
          <SquareIcon size={18} />
        </Button>
      ) : (
        <Button
          aria-label='Send message'
          isDisabled={!input.trim()}
          isIconOnly
          onPress={onSend}
        >
          <SendIcon size={18} />
        </Button>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 4: Run all frontend tests**

Run: `cd apps/frontend && bun run test`
Expected: All tests pass.

- [ ] **Step 5: Run production build**

Run: `cd apps/frontend && bun run build`
Expected: Build succeeds.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/ChatInput/ChatInput.tsx apps/frontend/src/pages/chat/components/ChatInput/ChatInputView.tsx
git commit -m "feat(frontend): add Stop button to ChatInput during streaming"
```

---

### Task 12: Full verification

- [ ] **Step 1: Run backend build and tests**

Run: `cd apps/backend && bunx tsc --noEmit && bun run test`
Expected: TypeScript compiles, all tests pass.

- [ ] **Step 2: Run frontend build and tests**

Run: `cd apps/frontend && bun run build && bun run test`
Expected: Build succeeds, all tests pass.

- [ ] **Step 3: Manual verification — Stop during text streaming**

Start the dev server. Send a message. While the assistant is streaming text, click the Stop button.
Expected: Streaming stops immediately. Partial text is kept. Stop button reverts to Send button. User can send a new message.

- [ ] **Step 4: Manual verification — Stop during tool execution**

Send a message that triggers a tool call. While the tool is executing, click Stop.
Expected: Streaming stops. Partial content is kept. User can send a new message.

- [ ] **Step 5: Manual verification — Normal completion still works**

Send a simple message and let it complete naturally (don't click Stop).
Expected: Behaves exactly as before — stream completes, done event received, Send button stays.
