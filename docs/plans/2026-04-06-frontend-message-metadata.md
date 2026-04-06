# Frontend Message Metadata Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Display timestamps on chat messages and carry message IDs for future editing support.

**Architecture:** Add `id` and `createdAt` to `ChatMessage`, handle `message-start` SSE events through the event bus, pass `createdAt` through the render item pipeline to `MessageBubbleView` which displays formatted timestamps.

**Tech Stack:** React 19, TypeScript, CSS Modules, `Intl.DateTimeFormat`

**Spec:** `docs/specs/2026-04-06-frontend-message-metadata-design.md`

---

## File Structure

### New Files

| Path                                                                                                      | Purpose                                 |
| --------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/helpers/formatTimestamp.ts` | Pure function: Unix ms → display string |

### Modified Files

| Path                                                                                                 | Change                                                                       |
| ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/frontend/src/pages/chat/types.ts`                                                              | Add `id`/`createdAt` to `ChatMessage`, add `message-start` to `ChatEventMap` |
| `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`                                                | Handle `message-start` SSE event                                             |
| `apps/frontend/src/pages/chat/hooks/useMessages.ts`                                                  | Handle `message-start` bus event, add metadata to message creation helpers   |
| `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`                        | Pass `createdAt` to text render items                                        |
| `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`           | Pass `createdAt` to `MessageBubble`                                          |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`     | Accept and forward `createdAt`                                               |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx` | Render `<time>` element                                                      |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/styles.module.css`     | `.timestamp` style                                                           |

---

## Task 1: Update types

**Files:**

- Modify: `apps/frontend/src/pages/chat/types.ts`

- [ ] **Step 1: Add `id` and `createdAt` to `ChatMessage`**

```typescript
/** A chat message for UI rendering. Each message has exactly one content. */
export interface ChatMessage {
  id: string | null;
  createdAt: number | null;
  role: 'user' | 'assistant';
  content: MessageContent;
}
```

- [ ] **Step 2: Add `message-start` to `ChatEventMap`**

Add after the `'text-delta'` entry:

```typescript
  /** A message has started (metadata from backend). */
  'message-start': {
    role: 'user' | 'assistant';
    messageId: string;
    createdAt: number;
  };
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — all `ChatMessage` creation sites now lack `id` and `createdAt`. This is expected and will be fixed in subsequent tasks.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/types.ts
git commit -m "feat(frontend): add id and createdAt to ChatMessage type"
```

---

## Task 2: Update `useMessages` to handle metadata

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useMessages.ts`

- [ ] **Step 1: Update `addUserMessage` to include metadata**

```typescript
function addUserMessage(prev: ChatMessage[], content: string): ChatMessage[] {
  return [
    ...prev,
    {
      id: null,
      createdAt: Date.now(),
      role: 'user' as const,
      content: {type: 'text' as const, content},
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

- [ ] **Step 2: Update `appendAssistantText` to include metadata in fallback**

The fallback branch (when the last message is not an assistant text) creates a new message. Add metadata:

```typescript
function appendAssistantText(
  prev: ChatMessage[],
  token: string,
): ChatMessage[] {
  const last = prev[prev.length - 1];

  if (last.role === 'assistant' && last.content.type === 'text') {
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        content: {...last.content, content: last.content.content + token},
      },
    ];
  }

  return [
    ...prev,
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: token},
    },
  ];
}
```

- [ ] **Step 3: Update `pushToolStart` to include metadata**

```typescript
function pushToolStart(
  prev: ChatMessage[],
  content: ToolExecutionStartContent,
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {id: null, createdAt: null, role: 'assistant' as const, content},
  ];
}
```

- [ ] **Step 4: Update `pushToolEnd` to include metadata in new placeholder**

```typescript
function pushToolEnd(
  prev: ChatMessage[],
  content: ToolExecutionEndContent,
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {id: null, createdAt: null, role: 'assistant', content},
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}
```

- [ ] **Step 5: Add `message-start` event handler**

Add two new helper functions before `useMessages`:

```typescript
function applyUserMessageStart(
  prev: ChatMessage[],
  messageId: string,
): ChatMessage[] {
  // Find the last user message and set its id
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user') {
      const updated = [...prev];
      updated[i] = {...updated[i], id: messageId};
      return updated;
    }
  }
  return prev;
}

function applyAssistantMessageStart(
  prev: ChatMessage[],
  messageId: string,
  createdAt: number,
): ChatMessage[] {
  // Find the last assistant message and set its id and createdAt
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'assistant') {
      const updated = [...prev];
      updated[i] = {...updated[i], id: messageId, createdAt};
      return updated;
    }
  }
  return prev;
}
```

- [ ] **Step 6: Subscribe to `message-start` in the `useEffect`**

Add inside the `useEffect`, after the existing event handlers:

```typescript
const onMessageStart = (data: {
  role: 'user' | 'assistant';
  messageId: string;
  createdAt: number;
}) => {
  if (data.role === 'user') {
    setMessages((prev) => applyUserMessageStart(prev, data.messageId));
  } else {
    setMessages((prev) =>
      applyAssistantMessageStart(prev, data.messageId, data.createdAt),
    );
  }
};

eventBus.on('message-start', onMessageStart);
```

Add to the cleanup return:

```typescript
eventBus.off('message-start', onMessageStart);
```

- [ ] **Step 7: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — render item types and components still need updating. But `useMessages.ts` itself should have no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useMessages.ts
git commit -m "feat(frontend): handle message metadata in useMessages"
```

---

## Task 3: Handle `message-start` SSE event in `useStreamChat`

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`

- [ ] **Step 1: Add `message-start` case to the SSE event switch**

Add after the `case 'tool-execute-end'` block (after line 75):

```typescript
            case 'message-start':
              eventBus.emit('message-start', {
                role: event.role,
                messageId: event.messageId,
                createdAt: event.createdAt,
              });
              break;
            case 'tool-execute-delta':
              // Not handled yet — will be used when tools support streaming output
              break;
```

Note: `tool-execute-delta` case is added to avoid a TypeScript exhaustiveness warning, since it's now part of `SseEvent`.

- [ ] **Step 2: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — render item types still need updating.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useStreamChat.ts
git commit -m "feat(frontend): handle message-start SSE event in useStreamChat"
```

---

## Task 4: Pass `id` and `createdAt` through render items

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`

- [ ] **Step 1: Add `id` and `createdAt` to text render item types**

```typescript
export interface UserTextRenderItem {
  type: 'user-text';
  id: string | null;
  content: string;
  createdAt: number | null;
}

export interface AssistantTextRenderItem {
  type: 'assistant-text';
  id: string | null;
  content: string;
  createdAt: number | null;
}
```

`ToolExecutionRenderItem` is unchanged.

- [ ] **Step 2: Update `transformMessages` to pass `createdAt`**

Update the `case 'text'` branch:

```typescript
        case 'text': {
          if (message.role === 'user') {
            items.push({
              type: 'user-text',
              id: message.id,
              content: content.content,
              createdAt: message.createdAt,
            });
          } else {
            items.push({
              type: 'assistant-text',
              id: message.id,
              content: content.content,
              createdAt: message.createdAt,
            });
          }
          break;
        }
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: FAIL — `RenderItem.tsx` and `MessageBubble` still need updating.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts
git commit -m "feat(frontend): pass createdAt through render items"
```

---

## Task 5: Create `formatTimestamp` helper

**Files:**

- Create: `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/helpers/formatTimestamp.ts`

- [ ] **Step 1: Create the helper function**

```typescript
const timeFormat = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
});

const dateTimeFormat = new Intl.DateTimeFormat(undefined, {
  month: 'long',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Formats a Unix ms timestamp for display. Same day: "HH:mm". Other day: "M月D日 HH:mm". */
export function formatTimestamp(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  if (isSameDay(date, now)) {
    return timeFormat.format(date);
  }

  return dateTimeFormat.format(date);
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/helpers/formatTimestamp.ts
git commit -m "feat(frontend): add formatTimestamp helper"
```

---

## Task 6: Update `MessageBubble` components and `RenderItem`

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/styles.module.css`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Update `MessageBubble.tsx` to accept and forward `createdAt`**

```typescript
import {useDeferredValue} from 'react';

import type {ChatMessage} from '../../../../types.js';
import {useStreamingText} from './hooks/useStreamingText.js';
import {MessageBubbleView} from './MessageBubbleView.js';

interface MessageBubbleProps {
  role: ChatMessage['role'];
  id: string | null;
  content: string;
  createdAt: number | null;
}

export function MessageBubble({role, id, content, createdAt}: MessageBubbleProps) {
  const {displayedContent} = useStreamingText(content);
  const displayContent = role === 'assistant' ? displayedContent : content;
  const deferredContent = useDeferredValue(displayContent);

  return (
    <MessageBubbleView
      role={role}
      content={deferredContent}
      createdAt={createdAt}
    />
  );
}
```

- [ ] **Step 2: Update `MessageBubbleView.tsx` to render timestamp**

```typescript
import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import type {ChatMessage} from '../../../../types.js';
import {formatTimestamp} from './helpers/formatTimestamp.js';
import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
  createdAt: number | null;
}

export function MessageBubbleView({
  role,
  content,
  createdAt,
}: MessageBubbleViewProps) {
  return (
    <div
      className={clsx(styles.bubble, {
        [styles.user]: role === 'user',
        [styles.assistant]: role === 'assistant',
      })}
    >
      <div className={styles.content}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <Skeleton className={styles.skeleton} />
        )}
      </div>
      {createdAt !== null && (
        <time className={styles.timestamp}>{formatTimestamp(createdAt)}</time>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Add `.timestamp` style to `styles.module.css`**

Append to the file:

```css
.timestamp {
  font-size: 0.75rem;
  opacity: 0.5;
  margin-top: 4px;
}
```

- [ ] **Step 4: Update `RenderItem.tsx` to pass `createdAt`**

```typescript
import type {MessageRenderItem} from '../../hooks/useMessageList.js';
import {MessageBubble} from '../MessageBubble/index.js';
import {ToolExecutionCard} from '../ToolExecutionCard/index.js';
import styles from './styles.module.css';

interface RenderItemProps {
  item: MessageRenderItem;
}

export function RenderItem({item}: RenderItemProps) {
  switch (item.type) {
    case 'user-text':
      return (
        <div className={styles.userMessage}>
          <MessageBubble
            role='user'
            id={item.id}
            content={item.content}
            createdAt={item.createdAt}
          />
        </div>
      );
    case 'assistant-text':
      return (
        <div className={styles.assistantMessage}>
          <MessageBubble
            role='assistant'
            id={item.id}
            content={item.content}
            createdAt={item.createdAt}
          />
        </div>
      );
    case 'tool-execution':
      return (
        <div className={styles.assistantMessage}>
          <ToolExecutionCard
            toolName={item.toolName}
            displayName={item.displayName}
            arguments={item.arguments}
            status={item.status}
            result={item.result}
          />
        </div>
      );
  }
}
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 6: Run lint**

Run: `cd apps/frontend && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx \
       apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx \
       apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/styles.module.css \
       apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): display timestamps on message bubbles"
```

---

## Task 7: Use message `id` as React list key

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/MessageListView.tsx`

- [ ] **Step 1: Update `itemKey` to prefer `id` over index**

Replace the `itemKey` function:

```typescript
/** Produces a stable key for a render item. */
function itemKey(item: MessageRenderItem, index: number): string {
  switch (item.type) {
    case 'tool-execution':
      return `tool-${item.callId}`;
    case 'user-text':
    case 'assistant-text':
      return item.id ?? `${item.type}-${index.toString()}`;
  }
}
```

When `id` is available (from `message-start`), it's used as the key. Before `message-start` arrives, falls back to index.

- [ ] **Step 2: Run typecheck and lint**

Run: `cd apps/frontend && bun run typecheck && bun run lint`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/MessageListView.tsx
git commit -m "feat(frontend): use message id as React list key"
```
