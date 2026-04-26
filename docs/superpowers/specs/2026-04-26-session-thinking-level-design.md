# Session-Scoped Thinking Level

## Problem

Thinking level is currently message-scoped. The frontend keeps a transient
selector state in `ChatInput` and sends `thinkingLevel` with every completion
request. The backend receives that value on `POST /:agentType/session/:id/completions`
and threads it through only that turn.

This creates the wrong mental model. Thinking level should be selected when a
session is created, then remain fixed for that session. Follow-up messages
should not look like they can change the model's reasoning effort.

## Goals

- Make thinking level fixed at session creation for Chat and Coding sessions.
- Remove thinking level from per-message completion requests.
- Persist the session thinking level so restored sessions continue with the same
  level after backend restart or cache eviction.
- Keep the Coding task dispatch flow mostly unchanged; its existing thinking
  selector becomes a session creation setting.
- Keep Chat quick to start: the first-message composer still includes the
  thinking selector before the session exists.
- Expose the session thinking level to the frontend through replayed stream
  metadata, without adding dedicated `GET` or `PATCH` session settings APIs.

## Non-Goals

- Allow changing thinking level after session creation.
- Add `GET /session/:id` or `PATCH /session/:id` for session config.
- Redesign message rendering, tool cards, usage tracking, or session history.
- Persist unsent draft messages or draft thinking-level choices across reloads.
- Change subagent dispatch parameters. Subagents keep their own explicit
  `thinkingLevel` tool argument.

## Current State

- `packages/api-schema/src/chat/schema.ts` defines `thinkingLevelSchema` and
  requires `thinkingLevel` in `chatCompletionsRequestSchema`.
- `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/hooks/useThinkingLevel.ts`
  stores the selector value locally and defaults it to `none`.
- `ChatInput` passes `(content, thinkingLevel)` to `onSend` for every message.
- `useStreamChat.sendMessage` accepts a thinking level and passes it to
  `apiSendMessage`.
- `apps/frontend/src/api/agent-session/agent-session.ts` serializes
  `{message, thinkingLevel}` for completion requests.
- The backend dispatcher parses that body, and `agentSessionService` calls
  `agent.handleUserMessage(userMessage, thinkingLevel)`.
- `Agent.runAgentLoop` passes the per-turn level into `LlmSession` for the user
  message and all tool-result continuation rounds in the same turn.
- `AgentSnapshot.options` currently persists `workingDirectory` and optional
  `claudeCodeSessionId`, but not thinking level.
- `SseUsage` is emitted in every `done` event and currently contains model and
  token counters only.

## Approaches Considered

### A. Fixed at Creation, Replayed Through Done Usage

Create sessions with an initial thinking level, persist it in the backend
snapshot, remove it from completion requests, and include it in `done.usage` so
the frontend can recover the display value during SSE replay.

This is the selected approach. It keeps the backend source of truth explicit and
does not add session config endpoints that are unnecessary when the value is
immutable.

### B. Mutable Session Setting API

Add `GET /session/:id` and `PATCH /session/:id` for reading and changing the
session thinking level. This supports future mutability, but it adds API surface
for behavior we do not want right now.

### C. Frontend-Only Session Memory

Keep the value in React state and stop sending it after the first request. This
is not sufficient because restored sessions and backend restarts need the same
thinking level when future turns run.

## Selected Design

### Backend Source of Truth

`Agent` owns a readonly session thinking level. The value is set when the agent
is constructed and is serialized in `AgentSnapshot.options.thinkingLevel`.

For new sessions:

- Chat session creation requires `thinkingLevel`.
- Coding session creation requires `workspace` and `thinkingLevel`.
- `agentSessionService.createSession` passes the level into `MainAgent` or
  `CodingAgent` constructors.

For restored sessions:

- Snapshot parsing accepts missing `thinkingLevel` for backward compatibility.
- Missing values default to `none`.
- Restored agents use the persisted value for all future turns.

The SSE event log is not the backend source of truth. `done.usage.thinkingLevel`
exists for frontend replay/display; the persisted snapshot is what guarantees
continuation behavior.

### API Contract

Update shared schemas in `@omnicraft/api-schema`:

- Add a shared `createSessionRequestSchema` for Chat with `{thinkingLevel}`.
- Extend `createCodingSessionRequestSchema` to `{workspace, thinkingLevel}`.
- Change `chatCompletionsRequestSchema` to `{message}`.

The HTTP routes stay the same:

- `POST /:agentType/session` creates a session with initial config.
- `POST /:agentType/session/:id/completions` starts a turn using the session's
  stored thinking level.
- No new `GET` or `PATCH` session config endpoint is added.

The frontend API wrapper mirrors this shape:

- `createSession(options)` includes `thinkingLevel` for both Chat and Coding.
- `sendMessage(sessionId, message)` sends no thinking level.

### Agent Turn Flow

`Agent.handleUserMessage` changes from:

```typescript
handleUserMessage(userMessage: string, thinkingLevel: ThinkingLevel): void
```

to:

```typescript
handleUserMessage(userMessage: string): void
```

At turn start, `Agent.runTurn` captures `this.thinkingLevel` into a local
constant and passes that captured value through `runAgentLoop`. This keeps a
turn internally consistent even if the implementation later gains mutable
session settings.

`LlmSession` and provider adapters can keep accepting `thinkingLevel` as a call
option. Their responsibility remains per-call execution; the scope change is in
the agent/session layer and public API.

### Done Usage Metadata

Extend `SseUsage` with:

```typescript
thinkingLevel: ThinkingLevel;
```

Every `done` event carries the session level used by that turn. The frontend can
learn the session level by replaying events and reading the latest `done.usage`.

Limitations are intentional:

- On a direct reload of a session that is still running and has not emitted a
  `done` event yet, the frontend may not know the level for display until the
  first `done` arrives.
- This does not affect backend execution because the agent has the persisted
  value.

### Chat Frontend Flow

Chat uses two composer modes.

When `sessionId === null` on `/chat`:

- The bottom composer renders the message textarea, thinking-level select, and
  send button.
- The selected level is draft session creation config.
- Sending the first message calls `createSession({thinkingLevel})`, navigates to
  `/chat/:sessionId`, emits the user message locally, then calls
  `sendMessage(sessionId, message)`.

When `sessionId !== null` on `/chat/:sessionId`:

- The composer renders only the message textarea and send/stop button.
- Follow-up sends call `sendMessage(sessionId, message)`.
- The thinking selector is not shown because the session level is no longer
  editable.

The first-message interaction remains quick, but the selector disappearing after
creation makes the session scope visible.

### Coding Frontend Flow

The existing Coding task dispatch card already collects thinking level before
session creation. That value becomes session creation config:

1. User chooses workspace, thinking level, and task.
2. Submit calls `createSession({workspace, thinkingLevel})`.
3. The task is sent with `sendMessage(sessionId, task)`.
4. Follow-up `ChatInput` renders without a thinking selector.

No separate Coding setup interaction is needed.

### Session Config Context

`SessionConfigProvider` currently stores workspace-related session UI state. It
will also store the frontend's known session thinking level for display:

- `draftThinkingLevel` for session creation forms.
- `sessionThinkingLevel` for the active session once known.

For newly created sessions, the frontend can set `sessionThinkingLevel`
immediately from the creation value. For restored sessions, replayed
`done.usage.thinkingLevel` updates it.

When the route changes to a different session, transient known session config is
reset. It is repopulated by local creation state or SSE replay.

### Display

Existing sessions should expose the fixed level passively, not as an editable
control. The `InfoBar`/`BottomBar` area is the best fit because it already shows
session metadata such as workspace and usage.

Display behavior:

- Show `Thinking: <level>` when `sessionThinkingLevel` is known.
- Hide the indicator while unknown, rather than showing a misleading default.
- Do not place a disabled select in the follow-up composer.

### Subagents

No behavior change is needed for subagents. The `dispatch_agent` tool still has
an explicit optional `thinkingLevel` parameter and emits that value in
`subagent-dispatch`. Subagent thinking level remains task-scoped because each
subagent is created for a single delegated task.

## Data Flow

```text
/chat, no session
  ChatInput submit(message, draftThinkingLevel)
    -> createSession({thinkingLevel: draftThinkingLevel})
    -> route becomes /chat/:sessionId
    -> sendMessage(sessionId, message)
    -> backend agent runs with persisted session thinkingLevel
    -> done.usage.thinkingLevel emitted
    -> frontend display confirms session level

/chat/:sessionId
  ChatInput submit(message)
    -> sendMessage(sessionId, message)
    -> backend agent runs with persisted session thinkingLevel

/coding, no session
  TaskDispatchCard submit(workspace, task, thinkingLevel)
    -> createSession({workspace, thinkingLevel})
    -> route becomes /coding/:sessionId
    -> sendMessage(sessionId, task)

/coding/:sessionId
  ChatInput submit(message)
    -> sendMessage(sessionId, message)
```

## Testing

Backend tests:

- Shared API schema accepts session creation with thinking level and rejects
  completion requests with missing or empty `message` values.
- Shared API schema no longer requires `thinkingLevel` on completion requests.
- Agent snapshot persistence includes `thinkingLevel` for new snapshots.
- Agent snapshot restore defaults missing `thinkingLevel` to `none` for
  compatibility with existing sessions.
- `agentSessionService.sendCompletion` calls `handleUserMessage(message)` and
  the agent uses its stored level.
- `done.usage.thinkingLevel` is emitted for normal completion,
  `max_rounds_reached`, and abort completion.

Frontend tests:

- Chat new-session composer sends creation config with `thinkingLevel` and sends
  the first completion without `thinkingLevel`.
- Chat existing-session composer does not render the thinking selector.
- Coding task dispatch creates the session with `workspace` and `thinkingLevel`,
  then sends the task without `thinkingLevel`.
- Replayed `done.usage.thinkingLevel` updates the known session display value.

Manual verification:

- Start a Chat session with each thinking level and confirm backend request
  bodies: session creation includes the level, completion does not.
- Send follow-up Chat messages and confirm no per-message selector appears.
- Start a Coding task and confirm the task card level is used for the session.
- Refresh a completed session route and confirm replay restores the displayed
  thinking level.
- Restore an older snapshot without `thinkingLevel` and confirm it continues as
  `none`.
