# Frontend Message Metadata & Timestamp Display

## Problem

The backend now emits `message-start` SSE events carrying message `id` and `createdAt`, but the frontend ignores them. The frontend needs to:

1. Consume `message-start` events and attach metadata to messages
2. Display timestamps on every message bubble
3. Carry `id` on messages for future message editing

## Design

### Type Changes

**`ChatMessage`** gains `id` and `createdAt`:

```typescript
export interface ChatMessage {
  id: string | null;
  createdAt: number | null;
  role: 'user' | 'assistant';
  content: MessageContent;
}
```

- `null` means "not yet received from backend"
- User messages: `createdAt` set to `Date.now()` on creation, `id` set to `null` until `message-start(user)` arrives
- Assistant messages: both set from `message-start(assistant)` when creating the placeholder

**`ChatEventMap`** adds `message-start`:

```typescript
'message-start': {
  role: 'user' | 'assistant';
  messageId: string;
  createdAt: number;
};
```

**`MessageRenderItem`** — `UserTextRenderItem` and `AssistantTextRenderItem` gain `createdAt: number | null`. `ToolExecutionRenderItem` is unchanged (no timestamp on tool cards).

### Data Flow

**`useStreamChat`** — handles the new `message-start` SSE event and emits it to the event bus.

**`useMessages`** — event handling changes:

| Event                      | Behavior                                                                                                                |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `user-message-sent`        | Create user message `{ id: null, createdAt: Date.now() }` + empty assistant placeholder `{ id: null, createdAt: null }` |
| `message-start(user)`      | Find last `role: 'user'` message, set `id`                                                                              |
| `message-start(assistant)` | Find last empty assistant placeholder, set `id` and `createdAt`                                                         |
| `text-delta`               | Unchanged — append text                                                                                                 |
| `tool-execute-end`         | New assistant placeholder gets `{ id: null, createdAt: null }`                                                          |

**`transformMessages`** — passes `createdAt` from `ChatMessage` to `UserTextRenderItem` / `AssistantTextRenderItem`.

### UI Components

**`MessageBubbleView`** — displays timestamp below message content:

```tsx
<div className={styles.bubble}>
  <div className={styles.content}>...</div>
  {createdAt !== null && (
    <time className={styles.timestamp}>{formatTimestamp(createdAt)}</time>
  )}
</div>
```

**`formatTimestamp`** — pure function in `MessageBubble/helpers/`:

- Same day: `HH:mm` (e.g., `14:23`)
- Different day: `M月D日 HH:mm` (e.g., `4月5日 14:23`)
- Uses `Intl.DateTimeFormat` with browser timezone, no external dependencies

**`RenderItem`** — passes `createdAt` to `MessageBubble`.

**`ToolExecutionCard`** — unchanged, no timestamp.

## Files Changed

| File                                                                                                          | Change                                                                       |
| ------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `apps/frontend/src/pages/chat/types.ts`                                                                       | Add `id`/`createdAt` to `ChatMessage`, add `message-start` to `ChatEventMap` |
| `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`                                                         | Handle `message-start` SSE event                                             |
| `apps/frontend/src/pages/chat/hooks/useMessages.ts`                                                           | Handle `message-start` bus event, add metadata to message creation           |
| `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`                                 | Pass `createdAt` to text render items                                        |
| `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`                    | Pass `createdAt` to `MessageBubble`                                          |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`              | Accept and forward `createdAt`                                               |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/MessageBubbleView.tsx`          | Render timestamp                                                             |
| `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/styles.module.css`              | Timestamp styling                                                            |
| NEW `apps/frontend/src/pages/chat/components/MessageList/components/MessageBubble/helpers/formatTimestamp.ts` | Timestamp formatting function                                                |
