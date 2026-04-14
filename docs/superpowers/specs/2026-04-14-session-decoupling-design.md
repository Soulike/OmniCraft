# Session Decoupling: Push-Based Agent + SSE Events API

**Date:** 2026-04-14
**Issue:** [#129](https://github.com/Soulike/OmniCraft/issues/129) (Phase 2+3 merged)

## Context

The current execution model tightly couples Agent execution to the frontend SSE connection. The SSE response stream is the only consumer of the Agent's async generator — when the frontend disconnects, the Agent stops. There is no event history, no reconnection, and no way to resume a session.

This design decouples execution from consumption. The Agent writes events to an in-memory log (`AgentSseLog`). The frontend reads from the log via a separate SSE endpoint. Disconnecting the reader does not affect execution. Users can reconnect and replay the full conversation.

## Design

### 1. AgentSseLog Changes

Remove `seal()` and `get sealed`. The log lives as long as the Agent — it is never "finished". `append()` is always valid. Readers end only via `AbortSignal`.

**Files:** `apps/backend/src/agent-core/agent/agent-sse-log.ts`, `agent-sse-log.test.ts`

### 2. SSE Event Schema Change

Add `'aborted'` to the `done` event's `reason` enum:

```typescript
reason: z.enum(['complete', 'max_rounds_reached', 'aborted']);
```

Add required `content` field to `message-start` event. For user messages, this is the full message text (enables session replay). For assistant messages, this is an empty string (content arrives via `text-delta`).

```typescript
export const sseMessageStartEventSchema = z.object({
  type: z.literal('message-start'),
  role: z.enum(['user', 'assistant']),
  messageId: z.string(),
  createdAt: z.number(),
  content: z.string(),
});
```

**File:** `packages/sse-events/src/schema.ts`

### 3. Agent Class Refactor

**File:** `apps/backend/src/agent-core/agent/agent.ts`

#### New properties

- `readonly sseLog: AgentSseLog` — created in constructor, lives for the Agent's lifetime. All turns append to the same log.
- `private abortController: AbortController | null` — created per-turn, cleared when turn ends.
- `private readonly mutex: Mutex` — serializes turns. Only one turn runs at a time; subsequent calls queue behind it.

#### Method changes

**`handleUserMessage(message, thinkingLevel)`**

- Signature: remove `signal` parameter. Return `void` instead of `AgentEventStream`.
- Behavior: fire-and-forget — calls `void this.runTurn(message, thinkingLevel)`.
- The current generator logic moves to a private method `runAgentLoop(message, thinkingLevel, signal)`.

**`subscribe(options?): AsyncIterable<SseEvent>`** (new)

- Delegates to `this.sseLog.createReader(options)`.

**`abort()`** (new)

- Calls `this.abortController?.abort()`.
- Does NOT close readers or write events directly. The pump handles event completion (see below).

#### Turn serialization

```typescript
private async runTurn(message: string, thinkingLevel: ThinkingLevel): Promise<void> {
  await this.mutex.acquire();
  try {
    this.abortController = new AbortController();
    const stream = this.runAgentLoop(message, thinkingLevel, this.abortController.signal);
    await this.pump(stream);
  } finally {
    this.abortController = null;
    this.mutex.release();
  }
}
```

Multiple `handleUserMessage()` calls are safe — each fires `void this.runTurn()` which queues behind the Mutex. No 409 rejection needed; turns execute sequentially.

#### Background pump

```typescript
private async pump(stream: AgentEventStream): Promise<void> {
  try {
    for await (const event of stream) {
      this.sseLog.append(event);
    }
  } catch (e) {
    this.sseLog.append({ type: 'error', message: 'An internal error occurred' });
  }
}
```

#### Abort event completion

When the Agent is aborted, `signal.aborted` becomes true. The `runAgentLoop` generator checks this at each iteration and returns early. Before returning, it must:

1. Emit `tool-execute-end` events (status: `'error'`, result: `'Aborted'`) for any in-flight tool calls that have emitted `tool-execute-start` but not yet `tool-execute-end`. This requires tracking emitted start callIds and removing them as end events are yielded.
2. Emit `done` with `reason: 'aborted'`.

This ensures the sseLog always contains a complete, consistent event sequence — no dangling tool starts, and always a `done` event to signal turn completion.

### 4. API Changes

**File:** `apps/backend/src/dispatcher/chat/router.ts`, `path.ts`

#### `POST /session/:id/completions` (modified)

- No longer returns SSE. Calls `chatService.streamCompletion()` which calls `agent.handleUserMessage()`.
- Returns `202 Accepted` with empty body.
- No concurrent rejection — the Agent's internal Mutex serializes turns. Multiple calls queue safely.

#### `GET /session/:id/events` (new)

- SSE endpoint. Sets `text/event-stream` headers.
- Calls `agent.subscribe({ startIndex: from, signal })` where `from` is from query string (default 0).
- Pumps reader output to response as SSE.
- `signal` is tied to `ctx.req.on('close')` — when the HTTP connection closes, the reader ends.

#### `POST /session/:id/abort` (new)

- Calls `agent.abort()`.
- Returns `204 No Content`.
- Returns `404` if session not found.

### 5. Chat Service Layer

**File:** `apps/backend/src/services/chat/chat-service.ts`

- `streamCompletion()`: no longer returns `{eventStream, abort}`. Calls `agent.handleUserMessage(message, thinkingLevel)`. Returns void.
- Add `subscribe(agentId, options)`: retrieves Agent, returns `agent.subscribe(options)`.
- Add `abortCompletion(agentId)`: retrieves Agent, calls `agent.abort()`.

### 6. Frontend API Layer

**File:** `apps/frontend/src/api/chat/chat.ts`

- `streamChatCompletion()` is replaced by two functions:
  - `sendMessage(sessionId, message, thinkingLevel)` — POST to `/completions`, returns void.
  - `subscribeEvents(sessionId, from, signal)` — GET `/events?from=N`, returns `AsyncGenerator<SseEvent>` (parses SSE stream same as before).
- Add `abortCompletion(sessionId)` — POST to `/abort`.

### 7. Frontend Routing

**Files:** `apps/frontend/src/routes.ts`, `apps/frontend/src/router/router.tsx`, `apps/frontend/src/router/lazy-pages.tsx`

- Add route: `/chat/:sessionId` → `ChatPage` (same component, reads param).
- Keep `/chat` for new conversations (no sessionId).
- After first message creates a session, navigate to `/chat/:sessionId`.

### 8. Frontend Chat Page

**Files under:** `apps/frontend/src/pages/chat/`

#### SSE connection lifecycle = page lifecycle

- When `ChatPage` mounts with a `sessionId` (from route param or after creation), connect `GET /events?from=0`.
- Connection stays open for the entire page lifetime. Page unmount → abort signal → reader ends.
- No manual connection management. Frontend just reads events and updates UI.

#### Sending messages

- `useStreamChat` changes: instead of calling `streamChatCompletion()` (which was POST + SSE combined), call `sendMessage()` (POST only). Events arrive via the already-open `/events` connection.

#### Stop button

- Currently: aborts the fetch request (closes SSE connection), then `completeUnfinishedTools()` creates synthetic events.
- New: calls `POST /abort`. Does NOT close the `/events` connection. Backend writes the completion events (tool-execute-end for unfinished tools, done with reason 'aborted') to sseLog. Frontend receives them through the live `/events` reader — no synthetic events needed.
- Remove `completeUnfinishedTools()` and related abort-patching code from `useMessages.ts`.

#### State inference from events

- Frontend determines UI state purely from the event stream:
  - Last event is `done` → show send button (idle)
  - Receiving non-done events → show stop button (running)
  - No events yet → show send button (new conversation)
- The `stream-end` event is removed. `done` is the authoritative signal for turn completion.

#### Restoring a session

- User navigates to `/chat/:sessionId` → connect `/events?from=0` → replay all historical events → UI rebuilds the full conversation → if last event is `done`, show send button; if Agent is still running, events keep flowing, show stop button.

### 9. Subagent Dispatch Tool Adaptation

**File:** `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`

The dispatch tool currently iterates the subagent's generator directly. After the refactor, it adapts to the push-based pattern:

1. Call `subagent.handleUserMessage(task, thinkingLevel)` — starts background pump.
2. Link parent abort signal to subagent: `context.signal.addEventListener('abort', () => subagent.abort())`.
3. Subscribe to subagent events: iterate `subagent.subscribe({ signal })`.
4. Forward events via `context.onSubAgentEvent()` as before.
5. Break out of the reader when a `done` event is received — since the sseLog is never sealed, the reader would otherwise wait forever.

On abort: the parent's signal fires → `subagent.abort()` is called → subagent's `runAgentLoop` emits abort completion events (`tool-execute-end` + `done(aborted)`) → dispatch tool sees `done` and breaks → dispatch tool emits `subagent-complete` with appropriate status.

## Verification

1. **Backend tests:** `bun test` in `apps/backend` — AgentSseLog tests (updated for no-seal), Agent tests if applicable.
2. **Lint + typecheck:** `bun run lint && bun run typecheck` in both apps.
3. **Manual E2E:**
   - Start a conversation, verify events flow through `/events`.
   - Click stop mid-execution, verify tool-execute-end and done(aborted) events arrive.
   - Refresh the page with sessionId in URL, verify conversation replays correctly.
   - Open two tabs with same sessionId, verify both receive events.
   - Send a message in one tab, verify the other tab also receives events.
