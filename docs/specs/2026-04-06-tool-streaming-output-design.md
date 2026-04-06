# Tool Streaming Output (tool-execute-delta)

## Problem

Tool execution is a black box — the UI shows a spinner until the tool finishes, with no intermediate output. For long-running commands (e.g., shell commands), users have no feedback about what's happening.

## Design

### Tool Interface Change

`ToolDefinition.execute` signature is unchanged — it still returns `Promise<string> | string`.

Streaming output is delivered via a new optional callback on `ToolExecutionContext`:

```typescript
interface ToolExecutionContext {
  // ... existing fields unchanged
  onOutput?: (chunk: string) => void;
}
```

- Tools that support streaming call `context.onOutput?.(chunk)` during execution
- Tools that don't stream ignore it — zero changes needed for existing tools
- The callback is set by the Agent before calling `execute`

### Shell Tool

`ShellCommandRunner.run()` gains an optional `onStdoutData` callback parameter. In `run()`, an additional `child.stdout.on('data')` listener is registered alongside the existing one that writes to the temp file. Both listeners coexist on the same EventEmitter and fire independently.

The `run_command` tool passes `context.onOutput` as the `onStdoutData` callback:

```typescript
async execute(args, context) {
  const result = await runner.run({
    onStdoutData: (chunk) => context.onOutput?.(chunk),
  });
  return assembleResult(result);
}
```

No changes to the tool's return type or execution model.

### Agent Execution

`Agent.executeTool()` sets up the `onOutput` callback before calling `execute`:

1. Constructs `context.onOutput` to push `AgentToolExecuteDeltaEvent` to the existing `AsyncChannel`
2. Calls `tool.execute(args, context)` and awaits the result
3. Pushes `tool-execute-end` to the channel as before

The `AsyncChannel` type widens from `AgentToolExecuteEndEvent` to `AgentToolExecuteEndEvent | AgentToolExecuteDeltaEvent`.

### Frontend

**SSE layer** — `useStreamChat` emits `tool-execute-delta` events to the event bus (replacing current no-op).

**`ChatEventMap`** adds:

```typescript
'tool-execute-delta': { callId: string; content: string };
```

**`useMessages`** — Delta output is NOT stored in `ChatMessage[]`. It is temporary UI data managed by a separate `Map<callId, string>` that accumulates delta chunks. On each delta, the accumulated string is truncated to the most recent **8 KB**, discarding old content. When `tool-execute-end` arrives for a callId, the entry is removed from the map (memory freed).

**`ToolExecutionRenderItem`** gains `output?: string`.

**`ToolExecutionCardView`** — new Output section:

- Displayed when `status === 'running'` and `output` exists
- Hidden when `result` exists (tool finished)
- Rendered in a scrollable `<pre>` block, same style as the existing Result section

## Files Changed

### Backend

| File                                               | Change                                                          |
| -------------------------------------------------- | --------------------------------------------------------------- |
| `apps/backend/src/agent-core/tool/types.ts`        | Add `onOutput` to `ToolExecutionContext`                        |
| `apps/backend/src/helpers/shell-command-runner.ts` | Add optional `onStdoutData` callback to `run()`                 |
| `apps/backend/src/agent/tools/bash/run-command.ts` | Pass `context.onOutput` as `onStdoutData`                       |
| `apps/backend/src/agent-core/agent/agent.ts`       | Set up `onOutput` callback in `executeTool`, widen channel type |

### Frontend

| File                                                                                                         | Change                                                         |
| ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| `apps/frontend/src/pages/chat/types.ts`                                                                      | Add `tool-execute-delta` to `ChatEventMap`                     |
| `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`                                                        | Emit `tool-execute-delta` to event bus                         |
| `apps/frontend/src/pages/chat/hooks/useMessages.ts`                                                          | Manage delta output Map, truncate at 8 KB, cleanup on end      |
| `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`                                | Add `output` to `ToolExecutionRenderItem`, pass from delta Map |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`     | Accept and forward `output`                                    |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx` | Render Output section                                          |
