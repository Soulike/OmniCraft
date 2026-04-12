# StreamingMessageDisplay Component Extraction

## Summary

Extract a self-contained `StreamingMessageDisplay` component from the Chat page that subscribes to a `ChatEventBus` and renders streaming messages in real time. This enables reuse for subagent progress display and any future streaming chat UI.

## Motivation

The Chat page currently wires `useMessages`, `ToolOutputProvider`, and `MessageList` together inline. Subagent support requires showing the same streaming message UI for each dispatched agent. Extracting a single component that takes an EventBus prop allows dropping in a streaming message view anywhere by just providing an event source.

## API

```tsx
interface StreamingMessageDisplayProps {
  eventBus: ChatEventBus;
  onMessagesChange?: (messages: readonly ChatMessage[]) => void;
}
```

- **`eventBus`** — The event source. The component subscribes internally and manages its own `ChatMessage[]` state.
- **`onMessagesChange`** — Called whenever the internal messages array changes. Lets the parent react to message count (e.g. show/hide empty state) or inspect content without reaching into component internals.

### Clearing / Resetting

No imperative handle. Instead, `ChatEventMap` gains a new `'reset'` event:

```typescript
// In ChatEventMap
'reset': undefined;
```

- `useMessages` listens for `reset` and clears the messages array.
- `ToolOutputProvider` listens for `reset` and clears the tool output map.
- Parent triggers reset via `eventBus.emit('reset')`.

## Type Ownership

`StreamingMessageDisplay` owns and exports the streaming message protocol types. These move out of `pages/chat/types.ts` into the component:

- `ChatEventMap` — event protocol definition (including new `'reset'` event)
- `ChatEventBus` — typed `EventBus<ChatEventMap>`
- `ChatMessage` — a single message for UI rendering
- `MessageContent`, `TextContent`, `ThinkingContent` — message content variants

The chat page and any future consumers import these from `StreamingMessageDisplay/index.ts`.

`ChatEventBusContext`, `ChatEventBusProvider`, `ToolOutputProvider`, `useMessages`, and `useChatEventBus` also move into the component as internal implementation details (not exported).

## Internal Structure

```
StreamingMessageDisplay/
  index.ts                          // export { StreamingMessageDisplay } + types
  StreamingMessageDisplay.tsx       // Container: composes providers + hook + view
  StreamingMessageDisplayView.tsx   // Stateless view: renders MessageList
  types.ts                          // ChatEventMap, ChatEventBus, ChatMessage, etc.
  contexts/
    ChatEventBusContext/            // Moved from pages/chat/contexts/
    ToolOutputContext/              // Moved from pages/chat/contexts/
  hooks/
    useChatEventBus.ts              // Moved from pages/chat/hooks/
    useMessages.ts                  // Moved from pages/chat/hooks/
  components/
    MessageList/                    // Moved from pages/chat/components/MessageList/
```

### StreamingMessageDisplay (container)

1. Wraps children in `ChatEventBusProvider` with the provided `eventBus`.
2. Wraps in `ToolOutputProvider` (subscribes to tool-execute-delta/end via context).
3. Calls `useMessages()` to build `ChatMessage[]` from EventBus events.
4. Fires `onMessagesChange` callback on each messages state change.
5. Passes messages to `StreamingMessageDisplayView`.

### StreamingMessageDisplayView (view)

Renders `MessageList` with the messages prop. Purely stateless.

## Changes to Existing Code

### 1. Move modules into StreamingMessageDisplay

The following move from `pages/chat/` into `StreamingMessageDisplay/`:

| From                                                    | To                                                      |
| ------------------------------------------------------- | ------------------------------------------------------- |
| `pages/chat/types.ts` (ChatEventMap, ChatMessage, etc.) | `StreamingMessageDisplay/types.ts`                      |
| `pages/chat/contexts/ChatEventBusContext/`              | `StreamingMessageDisplay/contexts/ChatEventBusContext/` |
| `pages/chat/contexts/ToolOutputContext/`                | `StreamingMessageDisplay/contexts/ToolOutputContext/`   |
| `pages/chat/hooks/useMessages.ts`                       | `StreamingMessageDisplay/hooks/useMessages.ts`          |
| `pages/chat/hooks/useChatEventBus.ts`                   | `StreamingMessageDisplay/hooks/useChatEventBus.ts`      |
| `pages/chat/components/MessageList/`                    | `StreamingMessageDisplay/components/MessageList/`       |

After the move, `pages/chat/types.ts` is deleted. `pages/chat/contexts/` directory is deleted. The chat page imports these types from `StreamingMessageDisplay/index.ts`.

### 2. `ChatEventMap` (now in StreamingMessageDisplay/types.ts)

Add:

```typescript
'reset': undefined;
```

### 3. `ChatEventBusProvider`

Change to require `eventBus` prop (remove internal bus creation):

```typescript
interface ChatEventBusProviderProps {
  children: ReactNode;
  eventBus: ChatEventBus;
}

export function ChatEventBusProvider({children, eventBus}: ChatEventBusProviderProps) {
  return <ChatEventBusContext value={eventBus}>{children}</ChatEventBusContext>;
}
```

The caller (ChatPage, subagent display, etc.) is responsible for creating and owning the `EventBus` instance.

### 4. `useMessages` hook

Add `reset` event handler that clears messages:

```typescript
const onReset = () => {
  setMessages([]);
};
eventBus.on('reset', onReset);
// ... cleanup in return
```

### 5. `ToolOutputProvider`

Add `reset` event handler that clears the tool output map:

```typescript
const onReset = () => {
  mapRef.current.clear();
  setSnapshot(new Map());
};
eventBus.on('reset', onReset);
// ... cleanup in return
```

### 6. `ChatPage`

Replace direct `useMessages` + `MessageList` usage with `StreamingMessageDisplay`:

- Use `onMessagesChange` to track message count for conditional rendering (SessionSetup vs messages) and `newSessionDisabled` logic.
- Replace `clearMessages()` calls with `eventBus.emit('reset')`.
- Remove `ToolOutputProvider` from `ChatPage` (now internal to `StreamingMessageDisplay`).
- Remove direct `useMessages` call from `ChatPage`.
- Update all imports to use `StreamingMessageDisplay/index.ts` for types.

## Data Flow

```
EventBus ─emit──► StreamingMessageDisplay
                   ├─ ChatEventBusProvider (provides eventBus via context)
                   ├─ ToolOutputProvider (subscribes to tool-execute-delta/end/reset)
                   ├─ useMessages (subscribes to all message events + reset)
                   │   └─► onMessagesChange callback → parent
                   └─ MessageList (renders ChatMessage[] → RenderItem[])
```

## Future: Subagent Integration

When implementing subagent display:

1. `useStreamChat` handles `subagent-dispatch` → creates a new `EventBus<ChatEventMap>` per agentId.
2. `subagent-output` events → unwrap inner `SseBaseEvent`, emit to the agent's EventBus.
3. `subagent-complete` → emit `stream-end` to the agent's EventBus.
4. Render `<StreamingMessageDisplay eventBus={agentBus} />` for each active subagent.

The `SseBaseEvent` type is identical to the events `ChatEventMap` handles, so no adapter needed.

## Future: Session Restore via SSE Replay

Stored SSE events can be replayed into an EventBus to restore message state. The EventBus + `useMessages` pattern is event-sourcing compatible: replay the event sequence and the component rebuilds identical UI state.
