# Frontend Agentic UI Integration Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate backend agentic SSE events into the frontend chat UI. Display tool executions as collapsible cards, handle `max_rounds_reached` with a warning, and add Agent settings (maxToolRounds) to the settings page.

**Architecture:** Structured `MessageContent[]` replaces `content: string` in `ChatMessage`. A new `useMessageList` view-model hook transforms data-layer messages into renderable segments. `ToolExecutionCard` uses HeroUI Disclosure. `ChatAlert` is extracted as a reusable component. Settings page gets an Agent tab.

**Tech Stack:** React 19, TypeScript, HeroUI v3 (`@heroui/react`), CSS Modules, Vite

**Spec:** `docs/specs/2026-03-29-frontend-agentic-ui-design.md`

---

## File Structure

### New Files

| Path                                                                                                         | Purpose                                              |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------- |
| `apps/frontend/src/pages/chat/components/MessageList/MessageListView.tsx`                                    | Stateless view: renders `MessageRenderItem[]`        |
| `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`                                | View model: `ChatMessage[]` -> `MessageRenderItem[]` |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`     | Container (no-op, passes through to view)            |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx` | Stateless view with Disclosure + Spinner             |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/styles.module.css`         | ToolExecutionCard styles                             |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/index.ts`                  | Export barrel                                        |
| `apps/frontend/src/pages/chat/components/ChatAlert/ChatAlert.tsx`                                            | Reusable dismissible alert (error + warning)         |
| `apps/frontend/src/pages/chat/components/ChatAlert/styles.module.css`                                        | ChatAlert styles                                     |
| `apps/frontend/src/pages/chat/components/ChatAlert/index.ts`                                                 | Export barrel                                        |
| `apps/frontend/src/pages/settings/sections/agent/AgentSection.tsx`                                           | Agent settings section container                     |
| `apps/frontend/src/pages/settings/sections/agent/AgentSectionFields.tsx`                                     | Agent fields with NumberField                        |
| `apps/frontend/src/pages/settings/sections/agent/index.ts`                                                   | Export barrel                                        |

### Modified Files

| Path                                                                                                 | Change                                                                      |
| ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `apps/frontend/src/pages/chat/types.ts`                                                              | Replace `content: string` with `content: MessageContent[]` + new types      |
| `apps/frontend/src/pages/chat/hooks/useMessages.ts`                                                  | New operations for `MessageContent[]`                                       |
| `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`                                                | Handle all SSE events, expose `maxRoundsReached`                            |
| `apps/frontend/src/pages/chat/ChatPage.tsx`                                                          | Pass `maxRoundsReached` warning state to view                               |
| `apps/frontend/src/pages/chat/ChatPageView.tsx`                                                      | Replace inline Alert with ChatAlert, add max rounds warning                 |
| `apps/frontend/src/pages/chat/components/MessageList/MessageList.tsx`                                | Becomes container: calls `useMessageList`, delegates to `MessageListView`   |
| `apps/frontend/src/pages/chat/components/MessageList/styles.module.css`                              | Add styles for assistant segment layout                                     |
| `apps/frontend/src/pages/chat/components/MessageList/index.ts`                                       | No change (still exports `MessageList`)                                     |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`     | Receive `content: string` + `isStreaming: boolean` instead of `ChatMessage` |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx` | Remove dependency on `ChatMessage` type, receive `role` + `content`         |
| `apps/frontend/src/pages/settings/SettingsPage.tsx`                                                  | Add Agent tab + route mapping                                               |
| `apps/frontend/src/routes.ts`                                                                        | Add `agent` under `settings`                                                |
| `apps/frontend/src/router.tsx`                                                                       | Add `AgentSection` route                                                    |
| `apps/frontend/src/lazy-pages.tsx`                                                                   | Add lazy `AgentSection` export                                              |

---

## Tasks

### Task 1: Message Types

**Files:**

- Modify: `apps/frontend/src/pages/chat/types.ts`

- [ ] **Step 1: Replace types.ts with structured message types**

Replace the entire content of `apps/frontend/src/pages/chat/types.ts`:

```typescript
/** Text content from the LLM or user input. */
export interface TextContent {
  type: 'text';
  content: string;
}

/** A tool has started executing. */
export interface ToolExecutionStartContent {
  type: 'tool-execution-start';
  callId: string;
  toolName: string;
  arguments: string;
}

/** A tool has finished executing. */
export interface ToolExecutionEndContent {
  type: 'tool-execution-end';
  callId: string;
  result: string;
  isError: boolean;
}

/** A single content entry in a chat message. */
export type MessageContent =
  | TextContent
  | ToolExecutionStartContent
  | ToolExecutionEndContent;

/** A chat message for UI rendering. Content is an append-only array. */
export interface ChatMessage {
  role: 'user' | 'assistant';
  content: MessageContent[];
}
```

- [ ] **Step 2: Run typecheck to see expected failures**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — multiple files still expect `content: string`. This is expected; subsequent tasks fix each consumer.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/types.ts
git commit -m "feat(chat): replace string content with structured MessageContent[]"
```

---

### Task 2: useMessages Hook

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useMessages.ts`

- [ ] **Step 1: Rewrite useMessages for MessageContent[] operations**

Replace the entire content of `apps/frontend/src/pages/chat/hooks/useMessages.ts`:

```typescript
import {useCallback, useState} from 'react';

import type {
  ChatMessage,
  ToolExecutionEndContent,
  ToolExecutionStartContent,
} from '../types.js';

/** Manages the chat message history in React state. */
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /**
   * Adds a user message with text content and prepares an empty assistant
   * message for streaming. Both are added in a single state update.
   */
  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {role: 'user' as const, content: [{type: 'text' as const, content}]},
      {role: 'assistant' as const, content: []},
    ]);
  }, []);

  /**
   * Appends a text token to the last assistant message.
   * If the last entry in the assistant's content array is a TextContent,
   * the token is appended to it. Otherwise a new TextContent is pushed.
   */
  const appendTextToLastAssistant = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') {
        throw new Error(
          'Cannot append: last message is not an assistant message',
        );
      }

      const contentArray = [...last.content];
      const lastEntry = contentArray[contentArray.length - 1];

      if (lastEntry && lastEntry.type === 'text') {
        contentArray[contentArray.length - 1] = {
          ...lastEntry,
          content: lastEntry.content + token,
        };
      } else {
        contentArray.push({type: 'text', content: token});
      }

      return [...prev.slice(0, -1), {...last, content: contentArray}];
    });
  }, []);

  /**
   * Pushes a tool execution start or end entry to the last assistant message's
   * content array.
   */
  const pushContentToLastAssistant = useCallback(
    (item: ToolExecutionStartContent | ToolExecutionEndContent) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role !== 'assistant') {
          throw new Error(
            'Cannot push content: last message is not an assistant message',
          );
        }

        return [
          ...prev.slice(0, -1),
          {...last, content: [...last.content, item]},
        ];
      });
    },
    [],
  );

  /**
   * Removes the last assistant message if its content array is empty
   * (unused placeholder).
   */
  const removeLastAssistantMessageIfEmpty = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role === 'assistant' && last.content.length === 0) {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  /** Clears all messages. */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    addUserMessage,
    appendTextToLastAssistant,
    pushContentToLastAssistant,
    removeLastAssistantMessageIfEmpty,
    clearMessages,
  };
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — `useStreamChat.ts` still references old hook API names. Fixed in next task.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useMessages.ts
git commit -m "feat(chat): rewrite useMessages hook for MessageContent[] operations"
```

---

### Task 3: useStreamChat Hook

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`

- [ ] **Step 1: Rewrite useStreamChat to handle all SSE events**

Replace the entire content of `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`:

```typescript
import {useCallback, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import type {useMessages} from './useMessages.js';

type MessagesHook = ReturnType<typeof useMessages>;

interface UseStreamChatOptions {
  sessionId: string | null;
  addUserMessage: MessagesHook['addUserMessage'];
  appendTextToLastAssistant: MessagesHook['appendTextToLastAssistant'];
  pushContentToLastAssistant: MessagesHook['pushContentToLastAssistant'];
  removeLastAssistantMessageIfEmpty: MessagesHook['removeLastAssistantMessageIfEmpty'];
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  addUserMessage,
  appendTextToLastAssistant,
  pushContentToLastAssistant,
  removeLastAssistantMessageIfEmpty,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || !sessionId) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      addUserMessage(trimmed);

      try {
        const stream = streamChatCompletion(sessionId, trimmed);

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              appendTextToLastAssistant(event.content);
              break;
            case 'tool-execute-start':
              pushContentToLastAssistant({
                type: 'tool-execution-start',
                callId: event.callId,
                toolName: event.toolName,
                arguments: event.arguments,
              });
              break;
            case 'tool-execute-end':
              pushContentToLastAssistant({
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
        removeLastAssistantMessageIfEmpty();
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setStreamError(message);
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      addUserMessage,
      appendTextToLastAssistant,
      pushContentToLastAssistant,
      removeLastAssistantMessageIfEmpty,
    ],
  );

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
    clearStreamError,
    clearMaxRoundsReached,
  };
}
```

Key changes from current:

- `addUserMessage` now receives a `string` (not a `ChatMessage`)
- `appendToLastAssistantMessage` is renamed to `appendTextToLastAssistant`
- `tool-execute-start` and `tool-execute-end` events are now handled via `pushContentToLastAssistant`
- `done` event checks `event.reason` for `max_rounds_reached`
- `console.error` call is removed (project convention: no `console` usage)
- Exposes `maxRoundsReached` and `clearMaxRoundsReached`

- [ ] **Step 2: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — `ChatPage.tsx` still references old hook API. Fixed in Task 5.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useStreamChat.ts
git commit -m "feat(chat): handle all SSE events and maxRoundsReached in useStreamChat"
```

---

### Task 4: ChatAlert Component

**Files:**

- Create: `apps/frontend/src/pages/chat/components/ChatAlert/ChatAlert.tsx`
- Create: `apps/frontend/src/pages/chat/components/ChatAlert/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/ChatAlert/index.ts`

- [ ] **Step 1: Create ChatAlert component**

`apps/frontend/src/pages/chat/components/ChatAlert/ChatAlert.tsx`:

```typescript
import {Alert, CloseButton} from '@heroui/react';

import styles from './styles.module.css';

interface ChatAlertProps {
  status: 'danger' | 'warning';
  title: string;
  message: string;
  onDismiss: () => void;
}

export function ChatAlert({status, title, message, onDismiss}: ChatAlertProps) {
  return (
    <div className={styles.container}>
      <Alert status={status}>
        <Alert.Indicator />
        <Alert.Content>
          <Alert.Title>{title}</Alert.Title>
          <Alert.Description>{message}</Alert.Description>
        </Alert.Content>
        <CloseButton onPress={onDismiss} />
      </Alert>
    </div>
  );
}
```

- [ ] **Step 2: Create ChatAlert styles**

`apps/frontend/src/pages/chat/components/ChatAlert/styles.module.css`:

```css
.container {
  padding: 8px 16px 0;
}
```

- [ ] **Step 3: Create ChatAlert export**

`apps/frontend/src/pages/chat/components/ChatAlert/index.ts`:

```typescript
export {ChatAlert} from './ChatAlert.js';
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: ChatAlert itself compiles. Other files still have errors from earlier tasks.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/ChatAlert/
git commit -m "feat(chat): add ChatAlert reusable alert component"
```

---

### Task 5: ChatPage + ChatPageView

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`

- [ ] **Step 1: Update ChatPage to wire new hook API**

Replace the entire content of `apps/frontend/src/pages/chat/ChatPage.tsx`:

```typescript
import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Composes hooks and passes state to the view. */
export function ChatPage() {
  const {sessionId, sessionError, clearSessionError} = useSession();

  const {
    messages,
    addUserMessage,
    appendTextToLastAssistant,
    pushContentToLastAssistant,
    removeLastAssistantMessageIfEmpty,
  } = useMessages();

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    addUserMessage,
    appendTextToLastAssistant,
    pushContentToLastAssistant,
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
      isInputDisabled={isStreaming || !sessionId}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      onSend={(content) => {
        void sendMessage(content);
      }}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
```

- [ ] **Step 2: Update ChatPageView to use ChatAlert and support warnings**

Replace the entire content of `apps/frontend/src/pages/chat/ChatPageView.tsx`:

```typescript
import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {MessageList} from './components/MessageList/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  messages: ChatMessage[];
  isInputDisabled: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  onSend: (content: string) => void;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  messages,
  isInputDisabled,
  error,
  maxRoundsReached,
  scrollRef,
  onSend,
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
      <ChatInput onSend={onSend} isDisabled={isInputDisabled} />
    </div>
  );
}
```

Key changes from current:

- Inline `Alert` + `CloseButton` replaced by `ChatAlert` component
- New `maxRoundsReached` prop renders a warning `ChatAlert`
- Removed `Alert` and `CloseButton` imports from `@heroui/react`

- [ ] **Step 3: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: `ChatPage.tsx` and `ChatPageView.tsx` compile. MessageList still has errors (expects old `ChatMessage.content` shape). Fixed in Tasks 8-9.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPage.tsx apps/frontend/src/pages/chat/ChatPageView.tsx
git commit -m "feat(chat): wire maxRoundsReached warning and use ChatAlert"
```

---

### Task 6: useMessageList View-Model Hook

**Files:**

- Create: `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`

- [ ] **Step 1: Create the view-model types and hook**

`apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`:

```typescript
import {useMemo} from 'react';

import type {ChatMessage, MessageContent} from '../../../types.js';

/** Render model for a text segment within an assistant message. */
export interface TextRenderSegment {
  type: 'text';
  content: string;
  isStreaming: boolean;
}

/** Render model for a tool execution within an assistant message. */
export interface ToolExecutionRenderSegment {
  type: 'tool-execution';
  callId: string;
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export type AssistantSegment = TextRenderSegment | ToolExecutionRenderSegment;

export interface UserMessageRenderItem {
  type: 'user';
  text: string;
}

export interface AssistantMessageRenderItem {
  type: 'assistant';
  segments: AssistantSegment[];
}

export type MessageRenderItem =
  | UserMessageRenderItem
  | AssistantMessageRenderItem;

/**
 * Determines whether a text segment is actively streaming.
 *
 * A text segment is streaming if it is the last entry in the content array
 * and contains text (non-empty). When a message is still being streamed,
 * new text-delta events keep appending to the last TextContent. Once the
 * stream moves on to a tool call or finishes, the text is no longer the
 * last entry and is considered complete.
 */
function isTextStreaming(
  contentArray: readonly MessageContent[],
  index: number,
): boolean {
  return index === contentArray.length - 1;
}

/** Converts a ChatMessage[] into renderable MessageRenderItem[]. */
function transformMessages(messages: ChatMessage[]): MessageRenderItem[] {
  return messages.map((message): MessageRenderItem => {
    if (message.role === 'user') {
      const textEntry = message.content.find((c) => c.type === 'text');
      return {
        type: 'user',
        text: textEntry ? textEntry.content : '',
      };
    }

    // Assistant message: build segments from content array
    const segments: AssistantSegment[] = [];
    const endEvents = new Map<string, {result: string; isError: boolean}>();

    // First pass: collect all tool-execution-end events by callId
    for (const entry of message.content) {
      if (entry.type === 'tool-execution-end') {
        endEvents.set(entry.callId, {
          result: entry.result,
          isError: entry.isError,
        });
      }
    }

    // Second pass: build segments in order
    for (let i = 0; i < message.content.length; i++) {
      const entry = message.content[i];

      switch (entry.type) {
        case 'text': {
          segments.push({
            type: 'text',
            content: entry.content,
            isStreaming: isTextStreaming(message.content, i),
          });
          break;
        }
        case 'tool-execution-start': {
          const endEvent = endEvents.get(entry.callId);
          if (endEvent) {
            segments.push({
              type: 'tool-execution',
              callId: entry.callId,
              toolName: entry.toolName,
              arguments: entry.arguments,
              status: endEvent.isError ? 'error' : 'done',
              result: endEvent.result,
            });
          } else {
            segments.push({
              type: 'tool-execution',
              callId: entry.callId,
              toolName: entry.toolName,
              arguments: entry.arguments,
              status: 'running',
            });
          }
          break;
        }
        case 'tool-execution-end':
          // Already handled via the start event pairing above
          break;
      }
    }

    return {type: 'assistant', segments};
  });
}

/**
 * View-model hook that transforms ChatMessage[] into MessageRenderItem[].
 * Memoized on the messages array reference.
 */
export function useMessageList(messages: ChatMessage[]): MessageRenderItem[] {
  return useMemo(() => transformMessages(messages), [messages]);
}
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: The hook file itself compiles. Other MessageList files still have errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/hooks/
git commit -m "feat(chat): add useMessageList view-model hook"
```

---

### Task 7: ToolExecutionCard Component

**Files:**

- Create: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/index.ts`

- [ ] **Step 1: Create ToolExecutionCardView**

`apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`:

```typescript
import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';

import styles from './styles.module.css';

interface ToolExecutionCardViewProps {
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export function ToolExecutionCardView({
  toolName,
  arguments: toolArguments,
  status,
  result,
}: ToolExecutionCardViewProps) {
  return (
    <div className={styles.card}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            <span className={styles.toolName}>{toolName}</span>
            <span
              className={clsx(styles.status, {
                [styles.statusRunning]: status === 'running',
                [styles.statusDone]: status === 'done',
                [styles.statusError]: status === 'error',
              })}
            >
              {status === 'running' && (
                <>
                  <Spinner size='sm' />
                  <span>Running...</span>
                </>
              )}
              {status === 'done' && <span>Done</span>}
              {status === 'error' && <span>Error</span>}
            </span>
            <Disclosure.Indicator />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <div className={styles.section}>
              <span className={styles.label}>Arguments</span>
              <pre className={styles.pre}>{formatJson(toolArguments)}</pre>
            </div>
            {result !== undefined && (
              <div className={styles.section}>
                <span className={styles.label}>Result</span>
                <pre
                  className={clsx(styles.pre, {
                    [styles.preError]: status === 'error',
                  })}
                >
                  {result}
                </pre>
              </div>
            )}
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}

/** Attempts to pretty-print a JSON string. Falls back to the raw string. */
function formatJson(jsonString: string): string {
  try {
    return JSON.stringify(JSON.parse(jsonString) as unknown, null, 2);
  } catch {
    return jsonString;
  }
}
```

- [ ] **Step 2: Create ToolExecutionCard container**

`apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`:

```typescript
import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export function ToolExecutionCard({
  toolName,
  arguments: toolArguments,
  status,
  result,
}: ToolExecutionCardProps) {
  return (
    <ToolExecutionCardView
      toolName={toolName}
      arguments={toolArguments}
      status={status}
      result={result}
    />
  );
}
```

- [ ] **Step 3: Create ToolExecutionCard styles**

`apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/styles.module.css`:

```css
.card {
  border-radius: 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  overflow: hidden;
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

.toolName {
  font-weight: 600;
  font-size: 0.875rem;
}

.status {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 0.75rem;
}

.statusRunning {
  color: var(--muted);
}

.statusDone {
  color: var(--success);
}

.statusError {
  color: var(--danger);
}

.body {
  padding: 0 12px 12px;
}

.section {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.section + .section {
  margin-top: 8px;
}

.label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.pre {
  margin: 0;
  padding: 8px;
  background: var(--background);
  border-radius: 6px;
  font-size: 0.8125rem;
  line-height: 1.5;
  overflow-x: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.preError {
  color: var(--danger);
}
```

- [ ] **Step 4: Create ToolExecutionCard export**

`apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/index.ts`:

```typescript
export {ToolExecutionCard} from './ToolExecutionCard.js';
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: ToolExecutionCard files compile.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/
git commit -m "feat(chat): add ToolExecutionCard component with Disclosure"
```

---

### Task 8: MessageBubble Adaptation

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx`

The current `MessageBubble` receives the entire `ChatMessage` and operates on `message.content` as a string. After the type change, it needs to receive the text content directly as a `string`, plus an `isStreaming` flag to decide whether to animate.

- [ ] **Step 1: Update MessageBubble container**

Replace the entire content of `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`:

```typescript
import {useStreamingText} from './hooks/useStreamingText.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  isStreaming: boolean;
}

export function MessageBubble({role, content, isStreaming}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(content);

  const displayContent =
    role === 'assistant' && isStreaming ? displayedContent : content;

  return <MessageBubbleView role={role} content={displayContent} />;
}
```

Key changes:

- No longer imports or depends on `ChatMessage` type
- Receives `role`, `content` (plain string), and `isStreaming` as props
- Only uses streaming animation when `role === 'assistant'` AND `isStreaming === true`
- `useStreamingText` interface is unchanged — it still receives a `string`

- [ ] **Step 2: Update MessageBubbleView to remove ChatMessage dependency**

Replace the entire content of `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx`:

```typescript
import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: 'user' | 'assistant';
  content: string;
}

export function MessageBubbleView({role, content}: MessageBubbleViewProps) {
  return (
    <div
      className={clsx(styles.bubble, {
        [styles.user]: role === 'user',
        [styles.assistant]: role === 'assistant',
      })}
    >
      <div className={styles.content}>
        {content || <Skeleton className={styles.skeleton} />}
      </div>
    </div>
  );
}
```

Changes: removed `import type {ChatMessage}` and changed `role` prop type from `ChatMessage['role']` to the literal union `'user' | 'assistant'`.

- [ ] **Step 3: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: MessageBubble files compile. MessageList.tsx still references old API — fixed in next task.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/
git commit -m "feat(chat): adapt MessageBubble to receive text string directly"
```

---

### Task 9: MessageList MVVM Split

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/MessageList.tsx`
- Create: `apps/frontend/src/pages/chat/components/MessageList/MessageListView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/styles.module.css`

- [ ] **Step 1: Create MessageListView**

`apps/frontend/src/pages/chat/components/MessageList/MessageListView.tsx`:

```typescript
import type {
  AssistantMessageRenderItem,
  AssistantSegment,
  MessageRenderItem,
} from './hooks/useMessageList.js';
import {MessageBubble} from './components/MessageBubble/index.js';
import {ToolExecutionCard} from './components/ToolExecutionCard/index.js';
import styles from './styles.module.css';

interface MessageListViewProps {
  items: MessageRenderItem[];
}

export function MessageListView({items}: MessageListViewProps) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Send a message to start chatting.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {items.map((item, index) => {
          if (item.type === 'user') {
            return (
              <div key={index} className={styles.userMessage}>
                <MessageBubble
                  role='user'
                  content={item.text}
                  isStreaming={false}
                />
              </div>
            );
          }

          return (
            <div key={index} className={styles.assistantMessage}>
              <AssistantSegments segments={item.segments} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AssistantSegmentsProps {
  segments: AssistantMessageRenderItem['segments'];
}

function AssistantSegments({segments}: AssistantSegmentsProps) {
  if (segments.length === 0) {
    return (
      <MessageBubble role='assistant' content='' isStreaming={false} />
    );
  }

  return (
    <div className={styles.segmentList}>
      {segments.map((segment, index) => (
        <SegmentRenderer key={segmentKey(segment, index)} segment={segment} />
      ))}
    </div>
  );
}

interface SegmentRendererProps {
  segment: AssistantSegment;
}

function SegmentRenderer({segment}: SegmentRendererProps) {
  if (segment.type === 'text') {
    return (
      <MessageBubble
        role='assistant'
        content={segment.content}
        isStreaming={segment.isStreaming}
      />
    );
  }

  return (
    <ToolExecutionCard
      toolName={segment.toolName}
      arguments={segment.arguments}
      status={segment.status}
      result={segment.result}
    />
  );
}

/** Produces a stable key for a segment. */
function segmentKey(segment: AssistantSegment, index: number): string {
  if (segment.type === 'tool-execution') {
    return segment.callId;
  }
  return `text-${index.toString()}`;
}
```

- [ ] **Step 2: Rewrite MessageList as a container**

Replace the entire content of `apps/frontend/src/pages/chat/components/MessageList/MessageList.tsx`:

```typescript
import type {ChatMessage} from '../../types.js';
import {useMessageList} from './hooks/useMessageList.js';
import {MessageListView} from './MessageListView.js';

interface MessageListProps {
  messages: ChatMessage[];
}

/**
 * Container component for the message list.
 * Transforms ChatMessage[] into render items via the view-model hook,
 * then delegates rendering to MessageListView.
 */
export function MessageList({messages}: MessageListProps) {
  const items = useMessageList(messages);
  return <MessageListView items={items} />;
}
```

The public interface (`messages: ChatMessage[]`) is unchanged — callers do not need any updates.

- [ ] **Step 3: Update MessageList styles for segment layout**

Replace the entire content of `apps/frontend/src/pages/chat/components/MessageList/styles.module.css`:

```css
.container {
  padding: 16px;
}

.list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.userMessage {
  align-self: flex-end;
  max-width: 80%;
}

.assistantMessage {
  align-self: flex-start;
  max-width: 80%;
}

.segmentList {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.emptyText {
  color: var(--muted);
}
```

Change from current: added `.segmentList` for spacing between text bubbles and tool cards within a single assistant message.

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: All chat page files compile. The only remaining errors should be in settings files (Task 10).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/
git commit -m "feat(chat): split MessageList into MVVM pattern with view-model hook"
```

---

### Task 10: Agent Settings

**Files:**

- Modify: `apps/frontend/src/routes.ts`
- Modify: `apps/frontend/src/router.tsx`
- Modify: `apps/frontend/src/lazy-pages.tsx`
- Modify: `apps/frontend/src/pages/settings/SettingsPage.tsx`
- Create: `apps/frontend/src/pages/settings/sections/agent/AgentSection.tsx`
- Create: `apps/frontend/src/pages/settings/sections/agent/AgentSectionFields.tsx`
- Create: `apps/frontend/src/pages/settings/sections/agent/index.ts`

- [ ] **Step 1: Add agent route**

In `apps/frontend/src/routes.ts`, add `agent: {}` under `settings`:

```typescript
import {defineRoutes} from '@/router/define-routes/index.js';

/** Centralized route paths. Access via function call, e.g. `ROUTES.chat()`. */
export const ROUTES = defineRoutes({
  dashboard: {},
  chat: {},
  tasks: {},
  settings: {llm: {}, agent: {}},
});
```

- [ ] **Step 2: Add lazy AgentSection export**

In `apps/frontend/src/lazy-pages.tsx`, add the `AgentSection` lazy export. The file should become:

```typescript
import {lazy} from 'react';

export const ChatPage = lazy(async () => {
  const {ChatPage} = await import('@/pages/chat/index.js');
  return {default: ChatPage};
});

export const SettingsPage = lazy(async () => {
  const {SettingsPage} = await import('@/pages/settings/index.js');
  return {default: SettingsPage};
});

export const LlmSection = lazy(async () => {
  const {LlmSection} = await import('@/pages/settings/sections/llm/index.js');
  return {default: LlmSection};
});

export const AgentSection = lazy(async () => {
  const {AgentSection} =
    await import('@/pages/settings/sections/agent/index.js');
  return {default: AgentSection};
});
```

- [ ] **Step 3: Add agent route to router**

In `apps/frontend/src/router.tsx`, import `AgentSection` from lazy-pages and add the route. The file should become:

```typescript
import {createBrowserRouter, Navigate} from 'react-router';

import {Layout} from '@/pages/_layout/index.js';
import {ROUTES} from '@/routes.js';

import {AgentSection, ChatPage, LlmSection, SettingsPage} from './lazy-pages.js';

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      {index: true, element: <Navigate to={ROUTES.dashboard()} replace />},
      {path: ROUTES.dashboard(), element: null},
      {path: ROUTES.chat(), element: <ChatPage />},
      {path: ROUTES.tasks(), element: null},
      {
        path: ROUTES.settings(),
        element: <SettingsPage />,
        children: [
          {
            index: true,
            element: <Navigate to={ROUTES.settings.llm()} replace />,
          },
          {path: ROUTES.settings.llm(), element: <LlmSection />},
          {path: ROUTES.settings.agent(), element: <AgentSection />},
        ],
      },
    ],
  },
]);
```

- [ ] **Step 4: Add Agent tab to SettingsPage**

Replace the entire content of `apps/frontend/src/pages/settings/SettingsPage.tsx`:

```typescript
import {Suspense} from 'react';
import {Outlet, useLocation, useNavigate} from 'react-router';

import {Loading} from '@/components/Loading/index.js';
import {ROUTES} from '@/routes.js';

import {SettingsPageView, type SettingsTab} from './SettingsPageView.js';

const TABS: SettingsTab[] = [
  {id: 'llm', label: 'LLM'},
  {id: 'agent', label: 'Agent'},
];

const TAB_TO_PATH: Record<string, string> = {
  llm: ROUTES.settings.llm(),
  agent: ROUTES.settings.agent(),
};

const PATH_TO_TAB: Record<string, string> = Object.fromEntries(
  Object.entries(TAB_TO_PATH).map(([tab, path]) => [path, tab]),
);

export function SettingsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const currentTab = PATH_TO_TAB[location.pathname] ?? 'llm';

  return (
    <SettingsPageView
      tabs={TABS}
      selectedTab={currentTab}
      onTabChange={(id) => {
        const path = TAB_TO_PATH[id];
        if (path) {
          void navigate(path);
        }
      }}
    >
      <Suspense fallback={<Loading />}>
        <Outlet />
      </Suspense>
    </SettingsPageView>
  );
}
```

- [ ] **Step 5: Create AgentSection**

`apps/frontend/src/pages/settings/sections/agent/AgentSection.tsx`:

```typescript
import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../components/SettingSection/index.js';
import {AgentSectionFields} from './AgentSectionFields.js';

const agentShape = settingsSchema.shape.agent.unwrap().shape;

const FIELDS = [
  {path: 'agent/maxToolRounds', schema: agentShape.maxToolRounds},
];

export function AgentSection() {
  return (
    <SettingSection title='Agent' fields={FIELDS}>
      {(props) => <AgentSectionFields {...props} />}
    </SettingSection>
  );
}
```

- [ ] **Step 6: Create AgentSectionFields**

`apps/frontend/src/pages/settings/sections/agent/AgentSectionFields.tsx`:

```typescript
import {Description, FieldError, Input, Label, NumberField} from '@heroui/react';

import type {SettingSectionRenderProps} from '../../components/SettingSection/index.js';

export function AgentSectionFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
}: SettingSectionRenderProps) {
  return (
    <NumberField
      value={Number(values['agent/maxToolRounds'])}
      isInvalid={'agent/maxToolRounds' in validationErrors}
      isDisabled={isDisabled}
      minValue={1}
      onChange={(value) => {
        setValue('agent/maxToolRounds', value);
      }}
    >
      <Label>Max Tool Rounds</Label>
      <Input />
      <Description>
        Maximum number of tool execution rounds per user message
      </Description>
      {validationErrors['agent/maxToolRounds'] && (
        <FieldError>{validationErrors['agent/maxToolRounds']}</FieldError>
      )}
    </NumberField>
  );
}
```

- [ ] **Step 7: Create AgentSection export**

`apps/frontend/src/pages/settings/sections/agent/index.ts`:

```typescript
export {AgentSection} from './AgentSection.js';
```

- [ ] **Step 8: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: All files compile with no errors.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/routes.ts apps/frontend/src/router.tsx apps/frontend/src/lazy-pages.tsx apps/frontend/src/pages/settings/
git commit -m "feat(settings): add Agent tab with maxToolRounds setting"
```

---

### Task 11: Verification

**Files:**

- No new files — verification only.

- [ ] **Step 1: Run full typecheck**

Run from project root:

```bash
cd apps/frontend && bun run typecheck
```

Expected: No errors. If there are errors, fix them before proceeding.

- [ ] **Step 2: Run all frontend tests**

```bash
cd apps/frontend && bun run test
```

Expected: All tests pass. If any tests reference the old `ChatMessage.content: string` shape or old hook method names, update them.

- [ ] **Step 3: Run lint**

```bash
cd apps/frontend && bun run lint
```

Expected: No errors. Fix any lint issues (especially `console.error` removal from useStreamChat).

- [ ] **Step 4: Run format check**

```bash
cd apps/frontend && bun run format --check
```

Expected: All files formatted. If not, run `bun run format` and commit.

- [ ] **Step 5: Visual smoke test**

Start the dev server and verify:

```bash
cd apps/frontend && bun run dev
```

Verify the following in the browser:

1. **Chat page**: Send a message. Text appears as before in assistant bubble.
2. **Tool execution**: If the backend has tools, trigger a tool call. A collapsible `ToolExecutionCard` appears with tool name, status spinner, and "Running..." text. When complete, it shows "Done" and the expand/collapse reveals arguments and result.
3. **Max rounds warning**: If max rounds is reached, a warning banner appears at the top of the chat page with "Tool limit reached" message and a dismiss button.
4. **Error handling**: If a stream error occurs, a red error banner appears at the top.
5. **Settings > Agent**: Navigate to Settings. An "Agent" tab is visible. Click it. A "Max Tool Rounds" number field appears with the current value (default: 20). Change the value and save.

- [ ] **Step 6: Commit any fixes**

```bash
git add -A
git commit -m "fix: resolve verification issues for frontend agentic UI"
```
