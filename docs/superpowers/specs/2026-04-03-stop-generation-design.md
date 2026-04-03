# Stop Chat Generation Mid-Stream

## Problem

There is no way to stop the assistant's response once streaming starts. Users must wait for the full response (including tool execution rounds) to complete.

## Goal

Add a Stop button that immediately halts generation, keeps partial content, and lets the user send a new message.

## Approach

Full-stack change: frontend AbortController + backend AbortSignal propagation to LLM SDKs.

### Frontend

**`streamChatCompletion` (api/chat/chat.ts)** — Accept optional `signal: AbortSignal` parameter, pass to `fetch()`.

**`useStreamChat` (hooks/useStreamChat.ts)** — Manage an `AbortController` via `useRef`. Create a new controller at the start of `sendMessage`, pass its signal to `streamChatCompletion`. Expose a `stopGeneration` callback that calls `controller.abort()`. In the catch block, detect `AbortError` (from fetch abort) and treat it as a non-error: keep partial content, clean up empty trailing assistant message, reset `isStreaming`. Do not set `streamError`.

**`ChatPage` (ChatPage.tsx)** — Pass `stopGeneration` and `isStreaming` down to `ChatInput`.

**`ChatInput` / `ChatInputView`** — Accept `onStop` and `isStreaming` props. When `isStreaming` is true, replace the Send button with a Stop button. The textarea is disabled during streaming (existing behavior).

### Backend

**`chatService.streamCompletion` (services/chat)** — Change return type from `AgentEventStream | undefined` to `{ eventStream: AgentEventStream; abort: () => void } | undefined`. Internally create an `AbortController`, pass its signal to `agent.handleUserMessage`, and return `abort: () => controller.abort()`.

**`Agent.handleUserMessage` (agent-core/agent)** — Accept optional `signal?: AbortSignal`. Pass it to `llmSession.sendUserMessage` and `llmSession.submitToolResults`. Check `signal.aborted` at the start of each tool execution round; if aborted, return early from the generator.

**`LlmSession` (agent-core/llm-session)** — Add `signal?: AbortSignal` parameter to `sendUserMessage`, `submitToolResults`, `sendMessages`, and `streamCompletion`. Pass it through to `llmApi.streamCompletion`.

**`LlmCompletionOptions` (agent-core/llm-api/types.ts)** — Add `readonly signal?: AbortSignal`.

**`streamClaude` (agent-core/llm-api/claude-adapter.ts)** — Pass `options.signal` to `client.messages.stream()`.

**`streamOpenAI` (agent-core/llm-api/openai-adapter.ts)** — Pass `options.signal` to `client.chat.completions.create()`.

**Router (dispatcher/chat/router.ts)** — Destructure `{ eventStream, abort }` from `chatService.streamCompletion`. Call `abort()` in the existing `onDisconnect` handler (before `eventStream.return()`).

### Abort Flow

```
User clicks Stop
  → frontend AbortController.abort()
  → fetch aborted, connection closed
  → backend ctx.req 'close' fires
  → router calls abort() from chatService
  → AbortController.abort() in service
  → signal.aborted = true
  → Agent checks signal, returns from generator
  → LLM SDK stream aborted via signal
  → All resources cleaned up
```

### Error Handling

- Frontend: `AbortError` from fetch is caught and treated as intentional stop, not an error.
- Backend: LLM SDKs throw on abort; the generator's finally blocks handle cleanup (LlmSession rolls back messages if not completed).
- Agent: if signal is aborted between tool rounds, generator returns without yielding a `done` event. The frontend already handles the stream ending without `done` (the `finally` block in `sendMessage` resets `isStreaming`).
