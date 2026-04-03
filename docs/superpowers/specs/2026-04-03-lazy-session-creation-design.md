# Lazy Chat Session Creation

## Problem

Navigating to the Chat page immediately creates a backend session (`POST /api/chat/session`), even if the user never sends a message. This wastes backend resources (a `CoreAgent` instance is allocated and stored in `AgentStore`) and creates unnecessary network traffic.

## Goal

Defer session creation until the user sends the first message.

## Approach

Frontend-only change. The backend API stays the same.

### Changes

**`useSession.ts`** — Remove eager creation on mount.

- Remove the `useEffect` that calls `resetSession()` on mount.
- Remove the `initRef` guard (no longer needed).
- Keep `resetSession` as an imperative function that callers invoke when needed.
- `sessionId` starts as `null` and remains `null` until `resetSession()` is called.

**`useStreamChat.ts`** — Create session on first message.

- Accept `resetSession` from `useSession` as a new parameter.
- In `sendMessage`: if `sessionId` is `null`, call `await resetSession()` to get a session ID.
- If `resetSession()` returns `null` (creation failed), abort the send. The error is already set by `useSession`.
- Use the returned ID (not the stale `sessionId` state) for the `streamChatCompletion` call.

**`ChatPage.tsx`** — Wire up `resetSession` and fix input disabled logic.

- Pass `resetSession` to `useStreamChat`.
- Change `isInputDisabled` from `isStreaming || !sessionId` to just `isStreaming`. The input should be usable before a session exists.

### Behavior

| Scenario                 | Before                      | After                                        |
| ------------------------ | --------------------------- | -------------------------------------------- |
| Enter Chat page          | Session created immediately | No session created; input enabled            |
| Send first message       | Uses existing session       | Creates session, then sends message          |
| Send subsequent messages | Uses existing session       | Uses existing session                        |
| Navigate away and back   | New session created eagerly | No session created until first message       |
| Session creation fails   | Error shown, input disabled | Error shown, user can retry by sending again |

### Error Handling

- If `resetSession()` fails, `useSession` sets `sessionError` which is displayed by `ChatAlert`.
- The input remains enabled so the user can retry.
- On retry, `sendMessage` calls `resetSession()` again since `sessionId` is still `null`.

### No Backend Changes

The backend `POST /api/chat/session` and `POST /api/chat/session/:id/completions` endpoints remain unchanged. The only difference is when the frontend calls them.
