# Resume Agent Tool

## Problem

The backend now keeps a bounded, live-only `SubagentRegistry` for subagents that
can still be resumed in the current process. `list_resumable_agents` can expose
those live handles, but there is still no tool that sends follow-up work to an
existing subagent.

The first `resume_agent` version should keep the same live-only boundary: it
resumes only subagents still present in the parent agent's in-memory registry.
It should not restore subagents from disk.

The frontend already has a good display path for subagent dispatches: a parent
SSE event creates a nested `SubagentDisclosure`, then `subagent-output` events
feed the nested `StreamingMessageDisplay`. Resume should reuse that path with a
small visual distinction rather than introducing a separate transcript model.

## Goals

- Add a `resume_agent` tool that sends a new task to an existing live subagent.
- Reject missing, evicted, malformed, or currently running subagents with normal
  tool failures instead of backend errors.
- Stream the resumed subagent turn through the parent SSE stream in real time.
- Reuse the existing nested subagent frontend rendering path.
- Visually distinguish initial dispatches from resumed turns.
- Keep repeated resumes of the same subagent understandable in the parent
  timeline.

## Non-Goals

- Do not restore subagents from persisted snapshots or events.
- Do not add a user-clickable Resume button in this version.
- Do not append resumed output into an old completed disclosure.
- Do not keep old subagent event buses alive after completion.
- Do not support concurrent turns on the same subagent.

## Selected Design

`resume_agent` is an LLM-facing backend tool registered with the existing
subagent tool registry. It accepts a live subagent id and a task string:

```typescript
const parameters = z.object({
  agentId: agentIdSchema.describe('The id of the live subagent to resume.'),
  task: z.string().min(1).describe('The follow-up task for the subagent.'),
});
```

The tool looks up the handle with `context.subagentRegistry.get(agentId)`.
`SubagentRegistry.get()` already returns `undefined` for malformed ids and for
ids that are not currently registered, so the tool can handle both as the same
normal failure case.

If the handle exists but `handle.agent.isRunning` is true, the tool returns a
busy failure. Otherwise it starts a new turn on the same live subagent instance,
streams its events through the parent, and returns the last assistant text as a
summary, matching `dispatch_agent` behavior.

Because tool calls in the same LLM round can execute concurrently, the tool
should also use a small synchronous in-memory claim keyed by subagent id. The
claim is acquired before starting the resumed turn and released in `finally`.
If another `resume_agent` call already holds the claim, return the same busy
failure as a running subagent. This avoids queuing two resumed turns before the
subagent's `isRunning` flag has flipped.

## Shared Subagent Turn Runner

`dispatch_agent` and `resume_agent` should share the logic that runs a subagent
turn and forwards events. A small helper can own this behavior:

```typescript
interface RunSubagentTurnInput {
  context: ToolExecutionContext;
  subagent: Agent;
  agentType: SubAgentType;
  task: string;
  startEvent: SseSubagentDispatchEvent | SseSubagentResumeEvent;
  onTurnStarted?: () => void;
}
```

The helper should:

- attach the parent abort signal to the subagent;
- emit the provided start event;
- subscribe to the subagent before calling `handleUserMessage(task)`;
- call `handleUserMessage(task)`;
- call `onTurnStarted`, when provided, immediately after
  `handleUserMessage(task)`;
- forward each subagent base event as `subagent-output`;
- collect the latest assistant text delta sequence;
- emit `subagent-complete` with `success` or `failure`;
- return a success or failure tool result.

`dispatch_agent` remains responsible for creating a new subagent. It should
pass an `onTurnStarted` callback that registers the subagent after
`handleUserMessage(task)`, preserving the existing registration ordering.
`resume_agent` does not register anything; it remains responsible for lookup,
claiming, and busy/missing validation before calling the helper.

## SSE Events

Add a `subagent-resume` SSE event. It should use the same payload shape as
`subagent-dispatch`; only `type` differs:

```typescript
{
  type: 'subagent-resume',
  agentId: string,
  task: string,
  agentType: SubAgentType,
  thinkingLevel: ThinkingLevel,
  workingDirectory: string,
}
```

Using `task` for both dispatch and resume keeps the backend schema and frontend
display model aligned. For resume, `task` means the follow-up input sent to the
existing subagent.

The existing `subagent-output` and `subagent-complete` events should be reused
unchanged. A resumed turn therefore looks like:

1. `subagent-resume`
2. zero or more `subagent-output` events
3. `subagent-complete`

The `subagent-output.event` payload remains a non-recursive base SSE event, so
the nested transcript can display the resumed user message, assistant text,
thinking, tool calls, usage updates, and done event through the existing route.

## Frontend Rendering

The frontend should treat `subagent-dispatch` and `subagent-resume` as the same
kind of timeline item with a small mode distinction.

When `useStreamChat` receives either start event, it should:

- create a new `SubagentEventBus`;
- store it in `subagentBusMap` by `agentId` for the active turn;
- emit the existing internal subagent-start event with an added mode:

```typescript
mode: 'dispatch' | 'resume';
```

The existing `SubagentDisclosure`, `SubagentContent`, and `SubagentRenderItem`
should carry this mode. The nested transcript should still be a normal
`StreamingMessageDisplay` fed by the child event bus.

Each resume creates a new disclosure in the parent timeline. It does not mutate
or reopen an older completed disclosure. Reusing the same `agentId` is safe
because only one turn on a subagent is allowed at a time, and the old disclosure
holds its child bus by object reference after it is created. The active routing
map may point to a newer bus for the same id without changing old blocks.

## UI Copy

The disclosure header should show a compact mode indicator:

- `Dispatch` for initial subagent dispatches.
- `Resume` for resumed subagent turns.

The disclosure body should include the subagent id with mode-specific wording:

- Dispatch: `Subagent ID: <agentId>`
- Resume: `Resumed subagent ID: <agentId>`

The body should continue to show the task and working directory. The footer can
continue to show type and thinking level.

This gives users enough context to distinguish a new subagent from a continued
one without changing the nested transcript layout.

## Error Handling

`resume_agent` should return normal tool failures for expected resume problems:

- Missing or malformed id: the subagent is not available to resume; dispatch a
  new subagent if needed.
- Running subagent: the subagent is already working; wait for it to finish
  before resuming it.
- Aborted parent turn: return an aborted failure and emit `subagent-complete`
  with failure if the start event was already emitted.
- Subagent error event: return a failure containing the subagent error message.

Unexpected exceptions should follow the same conversion path as existing tools:
they become tool execution errors handled by `AgentToolExecutor`.

## Testing

Backend tests should cover:

- `resume_agent` returns failure for unknown or malformed ids.
- `resume_agent` returns failure for a running subagent.
- `resume_agent` returns failure when a same-id resume claim is already held.
- `resume_agent` calls `handleUserMessage(task)` on the registered live
  subagent.
- resumed subagent output is forwarded as `subagent-output`.
- resumed turns emit `subagent-resume` before output and `subagent-complete`
  after output.
- `dispatch_agent` behavior stays unchanged after sharing the subagent turn
  helper.
- SSE schemas accept `subagent-resume` and reject recursive subagent events in
  nested output as before.

Frontend tests should cover:

- `useStreamChat` creates a new child bus for `subagent-resume`.
- resumed output is preserved during replay until the disclosure mounts.
- `SubagentDisclosure` renders Dispatch/Resume mode labels.
- the disclosure body renders `Subagent ID` for dispatch and `Resumed subagent
ID` for resume.

## Open Decisions

None for this first version. User-triggered resume controls and disk-backed
subagent restore remain future work.
