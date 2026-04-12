# Subagent Chat UI

## Summary

Display subagent execution in the chat message flow as collapsible Disclosure panels. Default collapsed shows task description + status; expanded reuses `StreamingMessageDisplay` to render the subagent's full message stream (thinking, text, tool calls). Each subagent gets an independent `ChatEventBus`, managed in `useStreamChat`.

## Motivation

The backend already streams subagent events (`subagent-dispatch`, `subagent-output`, `subagent-complete`) to the frontend, but they are silently ignored. Users need visibility into what subagents are doing, with the option to drill into details.

## Design Decisions

| Decision            | Choice                                      | Rationale                                                                              |
| ------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------- |
| Visual presentation | Disclosure/Accordion                        | Most compact, minimal disruption to message flow                                       |
| Icon                | `Bot` from lucide-react                     | Consistent with project icon library; visually distinguishes from tool execution cards |
| Expanded content    | Full message flow reuse                     | Maximum code reuse via `StreamingMessageDisplay`                                       |
| Event routing       | Independent `ChatEventBus` per subagent     | Clean isolation, direct reuse of existing components                                   |
| Bus management      | `useRef(new Map())` in `useStreamChat`      | Bus lifecycle tied to stream; no global state needed                                   |
| Completion status   | Backend sends status in `subagent-complete` | Backend already knows success/failure; more reliable than frontend inference           |

## Event Refactoring

### Problem

`stream-done` currently bundles SSE `done` data (`reason`, `usage`) with session context (`sessionId`, `userMessage`, `assistantMessage`). This prevents unified event routing between agent and subagent, because subagent events lack session context.

### Solution

Split into two events and rename to match SSE:

| ChatEventMap event                  | Shape                                        | Emitter                                                   | Consumers                                     |
| ----------------------------------- | -------------------------------------------- | --------------------------------------------------------- | --------------------------------------------- |
| `done` (renamed from `stream-done`) | `{reason, usage}`                            | `routeBaseEventToBus` (universal)                         | `useUsage`, any future subagent usage display |
| `turn-done` (new)                   | `{sessionId, userMessage, assistantMessage}` | `useStreamChat` (main agent only, every turn)             | `useSessionTitle`                             |
| `stream-end` (unchanged)            | `undefined`                                  | `useStreamChat` finally block / subagent-complete handler | `useMessages` cleanup                         |

### Unified Event Routing

Extract a `routeBaseEventToBus` function that maps SSE base events to ChatEventBus events. All base events are now pass-through (same type key and shape), including `done`:

```typescript
function routeBaseEventToBus(event: SseBaseEvent, bus: ChatEventBus): void {
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

Each case narrows `event` so TypeScript can verify the correlation between `event.type` and the event payload. If `SseBaseEvent` gains a new type, the exhaustiveness gap surfaces as a type error at call sites or via an explicit exhaustive check.

## Backend Changes

### 1. `packages/sse-events/src/schema.ts`

Add `status` field to `sseSubagentCompleteEventSchema`:

```typescript
export const sseSubagentCompleteEventSchema = z.object({
  type: z.literal('subagent-complete'),
  agentId: z.string(),
  status: z.enum(['success', 'failure']),
});
```

### 2. `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`

Update both emit sites to include status:

```typescript
// Success path (~line 188)
context.onSubAgentEvent({
  type: 'subagent-complete',
  agentId: subagent.id,
  status: 'success',
});

// Error path (~line 202)
context.onSubAgentEvent({
  type: 'subagent-complete',
  agentId: subagent.id,
  status: 'failure',
});
```

## Frontend Changes

### 1. Event Map Refactoring — `StreamingMessageDisplay/types.ts`

```typescript
export interface ChatEventMap {
  // --- Existing events (unchanged) ---
  'user-message-sent': {content: string};
  'text-delta': SseTextDeltaEvent;
  'message-start': SseMessageStartEvent;
  'tool-execute-start': SseToolExecuteStartEvent;
  'tool-execute-end': SseToolExecuteEndEvent;
  'tool-execute-delta': SseToolExecuteDeltaEvent;
  'thinking-start': SseThinkingStartEvent;
  'thinking-delta': SseThinkingDeltaEvent;
  'thinking-end': SseThinkingEndEvent;
  'stream-error': {message: string};
  'stream-end': undefined;
  reset: undefined;

  // --- Renamed (was stream-done) ---
  /** SSE done event pass-through. Universal for agent and subagent. */
  done: SseDoneEvent;

  // --- New events ---
  /** Main agent turn completed. Fired each turn with session context. */
  'turn-done': {
    sessionId: string;
    userMessage: string;
    assistantMessage: string;
  };
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
```

Add subagent content type:

```typescript
export interface SubagentContent {
  type: 'subagent';
  agentId: string;
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export type MessageContent =
  | TextContent
  | ThinkingContent
  | SseToolExecuteStartEvent
  | SseToolExecuteEndEvent
  | SubagentContent;
```

### 2. Event Bus Routing — `useStreamChat.ts`

Refactor the main loop to use `routeBaseEventToBus` and handle subagent events:

```typescript
const subagentBusMapRef = useRef(new Map<string, ChatEventBus>());
let assistantText = '';

for await (const event of stream) {
  switch (event.type) {
    // --- Main agent specific ---
    case 'error':
      eventBus.emit('stream-error', {message: event.message});
      setStreamError(event.message);
      break;

    // --- Subagent routing ---
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

    // --- Universal base events (agent and subagent identical) ---
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
  }
}

// After stream ends, emit turn-done for title generation
if (assistantText) {
  eventBus.emit('turn-done', {
    sessionId: activeSessionId,
    userMessage: trimmed,
    assistantMessage: assistantText,
  });
}
```

### 3. Session Title — `useSessionTitle.ts`

Change subscription from `stream-done` to `turn-done`:

```typescript
eventBus.on('turn-done', onFirstTurnDone);
```

### 4. Usage Tracking — `useUsage.ts`

Change subscription from `stream-done` to `done`:

```typescript
const handler = (data: SseDoneEvent) => {
  setUsage(data.usage);
};
eventBus.on('done', handler);
```

### 5. Message Building — `useMessages.ts`

Add handlers for subagent events:

- `pushSubagentStart`: removes trailing empty assistant message, appends a `SubagentContent` message with `status: 'running'`, then appends a new empty assistant text placeholder.
- `updateSubagentStatus`: finds the `SubagentContent` message with matching `agentId`, updates its `status` to `'complete'` or `'error'` (mapped from `'success'`/`'failure'`).

### 6. Render Item — `useMessageList.ts`

Add new render item type:

```typescript
export interface SubagentRenderItem {
  type: 'subagent';
  agentId: string;
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}

export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem
  | ThinkingRenderItem
  | SubagentRenderItem;
```

In `transformMessages`, add a case for `content.type === 'subagent'` that passes through to `SubagentRenderItem`.

### 7. Render Dispatch — `RenderItem.tsx`

Add case for `item.type === 'subagent'` that renders `SubagentDisclosure`.

### 8. New Component — `SubagentDisclosure`

```
StreamingMessageDisplay/
  components/
    MessageList/
      components/
        SubagentDisclosure/
          index.ts
          SubagentDisclosure.tsx        // Container: manages expanded state
          SubagentDisclosureView.tsx    // Stateless view
          styles.module.css
```

**SubagentDisclosure props:**

```typescript
interface SubagentDisclosureProps {
  task: string;
  status: 'running' | 'complete' | 'error';
  eventBus: ChatEventBus;
}
```

**SubagentDisclosureView:**

- **Header** (always visible, clickable to toggle):
  - Chevron indicator (`▸` collapsed / `▾` expanded), animated rotation via CSS
  - `Bot` icon (from lucide-react)
  - Task description text (truncated with ellipsis if long)
  - Status indicator:
    - `running`: spinner + "Running" text (blue)
    - `complete`: green dot + "Complete" text (green)
    - `error`: red dot + "Error" text (red)
- **Body** (conditionally rendered when expanded):
  - `<StreamingMessageDisplay eventBus={eventBus} sessionId={null} />`
  - Slightly inset with background color differentiation

**Collapse behavior:**

- Default: collapsed
- User can toggle via click on header
- `StreamingMessageDisplay` inside the body subscribes to the subagent's independent `ChatEventBus` and renders identically to the main message flow

## Data Flow

```
SSE Stream (backend)
  │
  ├─ base events ──► routeBaseEventToBus ──► main ChatEventBus ──► useMessages ──► MessageList
  │                                                                                   │
  ├─ subagent-dispatch ──┐                                                            │
  │                      ├──► useStreamChat creates new EventBus                      │
  │                      └──► main bus emits "subagent-dispatched" ───────────────────┤
  │                                                                                   │
  ├─ subagent-output ──► routeBaseEventToBus ──► subagent bus                         │
  │                      (same function, same logic)                                  │
  │                                                                                   │
  └─ subagent-complete ──┬──► subagent bus emits "stream-end"                         │
                         └──► main bus emits "subagent-completed" ────────────────────┤
                                                                                      │
                                                                     SubagentDisclosure
                                                                       ├─ Header (task + status)
                                                                       └─ Body (expanded)
                                                                           └─ StreamingMessageDisplay
                                                                                └─ eventBus = subagent bus
```

## File Change Summary

| File                                             | Change                                                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `packages/sse-events/src/schema.ts`              | Add `status` to `subagent-complete`                                                                                |
| `apps/backend/.../dispatch-agent-tool.ts`        | Emit `status` in both complete paths                                                                               |
| `apps/frontend/.../types.ts`                     | Rename `stream-done` → `done`; add `turn-done`, `subagent-dispatched`, `subagent-completed`; add `SubagentContent` |
| `apps/frontend/.../useStreamChat.ts`             | Extract `routeBaseEventToBus`; route subagent events; manage bus map; emit `turn-done`                             |
| `apps/frontend/.../useSessionTitle.ts`           | Subscribe to `turn-done` instead of `stream-done`                                                                  |
| `apps/frontend/.../useUsage.ts` (both locations) | Subscribe to `done` instead of `stream-done`                                                                       |
| `apps/frontend/.../useMessages.ts`               | Handle `subagent-dispatched` / `subagent-completed`                                                                |
| `apps/frontend/.../useMessageList.ts`            | Add `SubagentRenderItem`, transform case                                                                           |
| `apps/frontend/.../RenderItem.tsx`               | Dispatch `subagent` type to `SubagentDisclosure`                                                                   |
| `apps/frontend/.../SubagentDisclosure/` (new)    | Disclosure component with `StreamingMessageDisplay`                                                                |
