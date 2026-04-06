# SSE Protocol V2: Message Metadata & Tool Streaming

## Problem

The SSE protocol between backend and frontend lacks two capabilities:

1. **Message identity** — `LlmMessage` on the backend now carries `id` and `createdAt`, but these are not exposed to the frontend. The frontend needs them for displaying timestamps and future message editing.
2. **Tool streaming** — Tool execution is a black box (`tool-execute-start` → silence → `tool-execute-end`). Tools like the bash shell produce incremental output that should be streamed to the UI in real time.

## Design

### New SSE Events

Two new event types are added to the `@omnicraft/sse-events` schema. All existing events remain unchanged.

#### `message-start`

Emitted before a message's content events, carrying the message's metadata.

```typescript
SseMessageStartEvent {
  type: 'message-start';
  role: 'user' | 'assistant';
  messageId: string;    // matches LlmMessage.id on the backend
  createdAt: number;    // Unix ms timestamp
}
```

**Emission points:**

- **User message** — emitted by the Agent before streaming the LLM response. The `messageId` and `createdAt` come from the `LlmUserMessage` created by `LlmSession`.
- **Assistant message** — emitted by the Agent when `LlmSession` yields a `message-start` event from the LLM stream. This happens once per assistant reply (including each reply in a tool-call loop).

#### `tool-execute-delta`

Streams intermediate text output from a running tool, identified by `callId`.

```typescript
SseToolExecuteDeltaEvent {
  type: 'tool-execute-delta';
  callId: string;
  content: string;
}
```

**Scope:** This event is for plain-text streaming output from tools (e.g., shell stdout, progress updates). It is NOT used for subagent event streaming — subagents will have their own dedicated event types and UI in the future.

**Runtime:** No tool currently produces this event. It will be connected when the bash tool gains streaming support (tracked in a separate issue).

### Complete SSE Event Union

After this change, the full `SseEvent` union becomes:

```
message-start          { role, messageId, createdAt }       NEW
text-delta             { content }
tool-execute-start     { callId, toolName, displayName, arguments }
tool-execute-delta     { callId, content }                  NEW
tool-execute-end       { callId, result, isError }
done                   { reason, usage }
error                  { message }
```

### Event Sequence Example

A typical single-round conversation:

```
message-start        { role: 'user', messageId: 'u1', createdAt: 1712400000000 }
message-start        { role: 'assistant', messageId: 'a1', createdAt: 1712400001000 }
text-delta           { content: 'Let me ' }
text-delta           { content: 'check that.' }
tool-execute-start   { callId: 'tc1', toolName: 'bash', ... }
tool-execute-end     { callId: 'tc1', result: '...', isError: false }
message-start        { role: 'assistant', messageId: 'a2', createdAt: 1712400003000 }
text-delta           { content: 'Here is the result.' }
done                 { reason: 'complete', usage: {...} }
```

## Backend Changes

### `@omnicraft/sse-events` (shared package)

- Add `sseMessageStartEventSchema` and `SseMessageStartEvent` type.
- Add `sseToolExecuteDeltaEventSchema` and `SseToolExecuteDeltaEvent` type.
- Add both to the `sseEventSchema` discriminated union.

### `llm-session/types.ts`

- Add `LlmSessionMessageStartEvent` to `LlmSessionEvent` union:

```typescript
LlmSessionMessageStartEvent {
  type: 'message-start';
  messageId: string;
  createdAt: number;
}
```

### `llm-session.ts`

- **`sendUserMessage()`** — Change return type to an object `{ stream: LlmSessionEventStream, messageId: string, createdAt: number }` so the Agent can access the user message metadata without reaching into session internals.
- **`streamCompletion()`** — Yield a `LlmSessionMessageStartEvent` at the `message-start` case (where `assistantCreatedAt` is already captured), carrying the assistant message's `id` and `createdAt`.

### `agent/types.ts`

- Add `AgentMessageStartEvent` and `AgentToolExecuteDeltaEvent` to the `AgentEvent` union.

### `agent.ts`

- **`handleUserMessage()`** — After calling `sendUserMessage()`, yield `AgentMessageStartEvent { role: 'user' }` using the returned metadata, before consuming the stream.
- **`consumeStream()`** — When receiving `message-start` from the LLM session stream, yield `AgentMessageStartEvent { role: 'assistant' }` to the caller.

### GitHub Issue

- Create an issue to track bash tool streaming support and `tool-execute-delta` integration.

## Future Work (Out of Scope)

- **Frontend UI** — `ChatMessage` type gains `id` and `createdAt`, timestamp display in `MessageBubbleView`, `ToolExecutionCard` streaming content. Separate task.
- **Subagent streaming** — Dedicated event types and UI for rendering nested agent execution. Not modeled by `tool-execute-delta`.
- **Message editing** — Frontend uses `messageId` to identify messages for edit operations. Requires backend API additions.
