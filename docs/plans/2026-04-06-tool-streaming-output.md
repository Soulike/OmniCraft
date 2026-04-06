# Tool Streaming Output Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stream intermediate tool output (stdout) to the frontend in real time via `tool-execute-delta` SSE events, starting with the shell tool.

**Architecture:** Add `onOutput` callback to `ToolExecutionContext`. Shell tool passes it to `ShellCommandRunner` as `onStdoutData`. Agent sets up the callback to push delta events through the existing `AsyncChannel`. Frontend accumulates delta chunks in a `Map`, truncates at 8 KB, and displays an Output section in `ToolExecutionCard` while running.

**Tech Stack:** TypeScript, Node.js child_process, React, CSS Modules

**Spec:** `docs/specs/2026-04-06-tool-streaming-output-design.md`

---

## File Structure

### Modified Files

| Path                                                                                                         | Change                                                 |
| ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------ |
| `apps/backend/src/agent-core/tool/types.ts`                                                                  | Add `onOutput` to `ToolExecutionContext`               |
| `apps/backend/src/helpers/shell-command-runner.ts`                                                           | Add `onStdoutData` callback to `run()`                 |
| `apps/backend/src/agent/tools/bash/run-command.ts`                                                           | Pass `context.onOutput` as `onStdoutData`              |
| `apps/backend/src/agent-core/agent/agent.ts`                                                                 | Set up `onOutput` in `executeTool`, widen channel type |
| `apps/frontend/src/pages/chat/types.ts`                                                                      | Add `tool-execute-delta` to `ChatEventMap`             |
| `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`                                                        | Emit `tool-execute-delta` to event bus                 |
| `apps/frontend/src/pages/chat/hooks/useMessages.ts`                                                          | Manage tool output Map with 8 KB truncation            |
| `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`                                | Add `output` to `ToolExecutionRenderItem`              |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`     | Accept and forward `output`                            |
| `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx` | Render Output section                                  |

---

## Task 1: Add `onOutput` to `ToolExecutionContext`

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`

- [ ] **Step 1: Add `onOutput` callback**

Add after the `signal` field (line 38):

```typescript
  /** Optional callback for streaming intermediate output from the tool. */
  readonly onOutput?: (chunk: string) => void;
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS (additive change)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/tool/types.ts
git commit -m "feat(tool): add onOutput callback to ToolExecutionContext"
```

---

## Task 2: Add `onStdoutData` callback to `ShellCommandRunner.run()`

**Files:**

- Modify: `apps/backend/src/helpers/shell-command-runner.ts`

- [ ] **Step 1: Add options parameter to `run()`**

Add a new interface before the class:

```typescript
/** Options for {@link ShellCommandRunner.run}. */
export interface ShellCommandRunOptions {
  /** Called with each chunk of stdout data during execution. */
  onStdoutData?: (chunk: string) => void;
}
```

Update `run()` signature (line 73):

```typescript
  async run(options?: ShellCommandRunOptions): Promise<ShellCommandResult> {
```

- [ ] **Step 2: Register additional stdout listener**

Inside `run()`, after the `this.pipeStreams(child, stdoutFile.stream, stderrFile.stream)` call (line 96), add:

```typescript
if (options?.onStdoutData) {
  const onData = options.onStdoutData;
  child.stdout!.on('data', (chunk: Buffer) => {
    onData(chunk.toString());
  });
}
```

Note: `child.stdout` is guaranteed non-null because `pipeStreams` already asserts it.

- [ ] **Step 3: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun run test`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/helpers/shell-command-runner.ts
git commit -m "feat(shell): add onStdoutData callback to ShellCommandRunner.run()"
```

---

## Task 3: Wire shell tool to `onOutput`

**Files:**

- Modify: `apps/backend/src/agent/tools/bash/run-command.ts`

- [ ] **Step 1: Pass `context.onOutput` to `ShellCommandRunner.run()`**

Update the `run()` call (lines 73-78). Change:

```typescript
const result = await new ShellCommandRunner(
  args.command,
  shellState.cwd,
  timeout,
  signal,
).run();
```

To:

```typescript
const result = await new ShellCommandRunner(
  args.command,
  shellState.cwd,
  timeout,
  signal,
).run({onStdoutData: context.onOutput});
```

- [ ] **Step 2: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/bash/run-command.ts
git commit -m "feat(bash-tool): stream stdout via context.onOutput"
```

---

## Task 4: Agent yields `tool-execute-delta` events

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Import `AgentToolExecuteDeltaEvent`**

Add to the existing imports from `./types.js`:

```typescript
import type {
  AgentDoneEvent,
  AgentEventStream,
  AgentMessageStartEvent,
  AgentOptions,
  AgentSnapshot,
  AgentToolExecuteDeltaEvent,
  AgentToolExecuteEndEvent,
  AgentToolExecuteStartEvent,
} from './types.js';
```

- [ ] **Step 2: Widen channel type in `handleUserMessage`**

Change the channel declaration (line 174):

```typescript
const channel = new AsyncChannel<
  AgentToolExecuteEndEvent | AgentToolExecuteDeltaEvent
>();
```

- [ ] **Step 3: Set up `onOutput` callback in `executeTool`**

In the `executeTool` method, add `onOutput` to the context construction. Replace the `context` assignment (lines 377-385):

```typescript
const context: ToolExecutionContext = {
  availableSkills: this.getAvailableSkills(),
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  fileStatTracker: this.fileStatTracker,
  extraAllowedPaths: this.extraAllowedPaths,
  shellState: this.shellState,
  signal,
  onOutput: (chunk: string) => {
    channel.push({
      type: 'tool-execute-delta',
      callId: toolCall.callId,
      content: chunk,
    } satisfies AgentToolExecuteDeltaEvent);
  },
};
```

This requires `channel` to be accessible from `executeTool`. Currently `executeTool` doesn't have access to the channel. We need to pass it as a parameter.

Update `executeTool` signature. Change:

```typescript
  private async executeTool(
    toolCall: LlmToolCall,
    availableTools: ReadonlyMap<string, ToolDefinition>,
    signal?: AbortSignal,
  ): Promise<{content: string; isError: boolean}> {
```

To:

```typescript
  private async executeTool(
    toolCall: LlmToolCall,
    availableTools: ReadonlyMap<string, ToolDefinition>,
    onOutput: (chunk: string) => void,
    signal?: AbortSignal,
  ): Promise<{content: string; isError: boolean}> {
```

And update the context construction to use the parameter:

```typescript
const context: ToolExecutionContext = {
  availableSkills: this.getAvailableSkills(),
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  fileStatTracker: this.fileStatTracker,
  extraAllowedPaths: this.extraAllowedPaths,
  shellState: this.shellState,
  signal,
  onOutput,
};
```

- [ ] **Step 4: Update call sites of `executeTool`**

In `handleUserMessage`, update the tool execution map (lines 177-178). Change:

```typescript
const result = await this.executeTool(toolCall, availableTools, signal);
```

To:

```typescript
const onOutput = (chunk: string) => {
  channel.push({
    type: 'tool-execute-delta',
    callId: toolCall.callId,
    content: chunk,
  } satisfies AgentToolExecuteDeltaEvent);
};
const result = await this.executeTool(
  toolCall,
  availableTools,
  onOutput,
  signal,
);
```

And simplify the context in `executeTool` — just pass `onOutput` directly:

```typescript
const context: ToolExecutionContext = {
  availableSkills: this.getAvailableSkills(),
  workingDirectory: this.workingDirectory,
  fileCache: this.fileCache,
  fileStatTracker: this.fileStatTracker,
  extraAllowedPaths: this.extraAllowedPaths,
  shellState: this.shellState,
  signal,
  onOutput,
};
```

- [ ] **Step 5: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun run test`
Expected: PASS

- [ ] **Step 6: Run lint**

Run: `cd apps/backend && bun run lint`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts
git commit -m "feat(agent): yield tool-execute-delta events via onOutput callback"
```

---

## Task 5: Frontend — emit `tool-execute-delta` and manage output state

**Files:**

- Modify: `apps/frontend/src/pages/chat/types.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useMessages.ts`

- [ ] **Step 1: Add `tool-execute-delta` to `ChatEventMap`**

In `types.ts`, add after the `tool-execute-end` entry (line 61):

```typescript
  /** Intermediate streaming output from a running tool. */
  'tool-execute-delta': {callId: string; content: string};
```

- [ ] **Step 2: Emit delta in `useStreamChat`**

In `useStreamChat.ts`, replace the `tool-execute-delta` no-op case (around line 84-86):

```typescript
            case 'tool-execute-delta':
              eventBus.emit('tool-execute-delta', {
                callId: event.callId,
                content: event.content,
              });
              break;
```

- [ ] **Step 3: Manage output state in `useMessages`**

Add a constant at the top of the file:

```typescript
const MAX_OUTPUT_BYTES = 8192; // 8 KB
```

In `useMessages`, add a `useRef` for the output map alongside the existing state:

```typescript
const toolOutputRef = useRef(new Map<string, string>());
```

Add `useRef` to the import from `react`:

```typescript
import {useCallback, useEffect, useRef, useState} from 'react';
```

Add event handlers inside the `useEffect`:

```typescript
const onToolExecuteDelta = (data: {callId: string; content: string}) => {
  const current = toolOutputRef.current.get(data.callId) ?? '';
  const updated = current + data.content;
  toolOutputRef.current.set(
    data.callId,
    updated.length > MAX_OUTPUT_BYTES
      ? updated.slice(updated.length - MAX_OUTPUT_BYTES)
      : updated,
  );
  // Trigger re-render so useMessageList picks up the new output
  setMessages((prev) => [...prev]);
};
const onToolExecuteEndWithCleanup = (data: ToolExecutionEndContent) => {
  toolOutputRef.current.delete(data.callId);
  setMessages((prev) => pushToolEnd(prev, data));
};
```

Replace the existing `onToolExecuteEnd` subscription. Change:

```typescript
eventBus.on('tool-execute-end', onToolExecuteEnd);
```

To:

```typescript
eventBus.on('tool-execute-delta', onToolExecuteDelta);
eventBus.on('tool-execute-end', onToolExecuteEndWithCleanup);
```

Remove the old `onToolExecuteEnd` handler and subscription. Update the cleanup:

```typescript
eventBus.off('tool-execute-delta', onToolExecuteDelta);
eventBus.off('tool-execute-end', onToolExecuteEndWithCleanup);
```

Also remove the old `eventBus.off('tool-execute-end', onToolExecuteEnd)` line.

Export `toolOutputRef` from the hook — change the return:

```typescript
return {messages, toolOutputRef, clearMessages};
```

- [ ] **Step 4: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: May fail due to `useMessageList` and components not yet updated, but the hooks should compile.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/types.ts \
       apps/frontend/src/pages/chat/hooks/useStreamChat.ts \
       apps/frontend/src/pages/chat/hooks/useMessages.ts
git commit -m "feat(frontend): handle tool-execute-delta events with 8KB output buffer"
```

---

## Task 6: Pass output through render items and display in UI

**Files:**

- Modify: `apps/frontend/src/pages/chat/components/MessageList/hooks/useMessageList.ts`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/MessageList.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Add `output` to `ToolExecutionRenderItem`**

In `useMessageList.ts`, update the interface (lines 19-27):

```typescript
export interface ToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  output?: string;
}
```

- [ ] **Step 2: Update `transformMessages` to accept and use `toolOutputMap`**

Change the function signature:

```typescript
export function transformMessages(
  messages: ChatMessage[],
  toolOutputMap: ReadonlyMap<string, string>,
): MessageRenderItem[] {
```

In the `tool-execution-start` running case (lines 85-93), add `output`:

```typescript
items.push({
  type: 'tool-execution',
  callId: content.callId,
  toolName: content.toolName,
  displayName: content.displayName,
  arguments: content.arguments,
  status: 'running',
  output: toolOutputMap.get(content.callId),
});
```

- [ ] **Step 3: Update `useMessageList` hook to accept `toolOutputMap`**

```typescript
export function useMessageList(
  messages: ChatMessage[],
  toolOutputMap: ReadonlyMap<string, string>,
): MessageRenderItem[] {
  return useMemo(
    () => transformMessages(messages, toolOutputMap),
    [messages, toolOutputMap],
  );
}
```

- [ ] **Step 4: Update `MessageList.tsx` to pass `toolOutputRef`**

Read the current file first to understand its structure, then update it to accept and pass `toolOutputRef.current` to `useMessageList`. The `MessageList` component needs to receive the `toolOutputRef` from its parent.

Add a new prop:

```typescript
interface MessageListProps {
  messages: ChatMessage[];
  toolOutputMap: ReadonlyMap<string, string>;
}

export function MessageList({messages, toolOutputMap}: MessageListProps) {
  const items = useMessageList(messages, toolOutputMap);
  return <MessageListView items={items} />;
}
```

- [ ] **Step 5: Thread `toolOutputRef` from `ChatPageContent` through `ChatPageView` to `MessageList`**

In `apps/frontend/src/pages/chat/ChatPage.tsx`, update the `useMessages` destructuring (line 36):

```typescript
const {messages, toolOutputRef, clearMessages} = useMessages();
```

Pass `toolOutputRef` to `ChatPageView` (line 88-107) — add the prop:

```typescript
      toolOutputMap={toolOutputRef.current}
```

In `apps/frontend/src/pages/chat/ChatPageView.tsx`, add to `ChatPageViewProps`:

```typescript
toolOutputMap: ReadonlyMap<string, string>;
```

Accept it in the destructuring and pass to `MessageList`:

```tsx
<MessageList messages={messages} toolOutputMap={toolOutputMap} />
```

- [ ] **Step 6: Update `ToolExecutionCard.tsx` to accept `output`**

```typescript
interface ToolExecutionCardProps {
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  output?: string;
}

export function ToolExecutionCard({
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  output,
}: ToolExecutionCardProps) {
  return (
    <ToolExecutionCardView
      toolName={toolName}
      displayName={displayName}
      arguments={toolArguments}
      status={status}
      result={result}
      output={output}
    />
  );
}
```

- [ ] **Step 7: Update `ToolExecutionCardView.tsx` to render Output section**

Add `output` to the props interface:

```typescript
interface ToolExecutionCardViewProps {
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  output?: string;
}
```

Accept `output` in the destructuring.

Add the Output section in the JSX, after the Arguments section and before the Result section:

```tsx
{
  output !== undefined && result === undefined && (
    <div className={styles.section}>
      <span className={styles.label}>Output</span>
      <ScrollShadow className={styles.pre}>{output}</ScrollShadow>
    </div>
  );
}
```

- [ ] **Step 8: Update `RenderItem.tsx` to pass `output`**

In the `tool-execution` case, add `output={item.output}`:

```tsx
      case 'tool-execution':
        return (
          <div className={styles.assistantMessage}>
            <ToolExecutionCard
              toolName={item.toolName}
              displayName={item.displayName}
              arguments={item.arguments}
              status={item.status}
              result={item.result}
              output={item.output}
            />
          </div>
        );
```

- [ ] **Step 9: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`
Expected: PASS

- [ ] **Step 10: Run tests**

Run: `cd apps/frontend && bun run test`
Expected: May need to update `useMessageList.test.ts` — calls to `transformMessages` need a second argument `new Map()`. Update all test calls:

```typescript
// Change every call from:
transformMessages(messages);
// To:
transformMessages(messages, new Map());
```

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/pages/chat/components/MessageList/ \
       apps/frontend/src/pages/chat/hooks/useMessages.ts
git commit -m "feat(frontend): display streaming tool output in ToolExecutionCard"
```
