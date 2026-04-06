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

## Task 1: Add `onOutput` parameter to `ToolDefinition.execute`

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`

- [ ] **Step 1: Add `onOutput` as third parameter to `execute`**

Update the `execute` signature in `ToolDefinition` (lines 55-58):

```typescript
  execute(
    args: z.infer<T>,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<string> | string;
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: PASS (existing tools don't declare the parameter, which is valid TypeScript)

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/tool/types.ts
git commit -m "feat(tool): add onOutput parameter to ToolDefinition.execute"
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

- [ ] **Step 1: Accept `onOutput` and pass to `ShellCommandRunner.run()`**

Update the `execute` method signature (lines 66-69) to accept the third parameter. Change:

```typescript
  async execute(
    args: RunCommandArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
```

To:

```typescript
  async execute(
    args: RunCommandArgs,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<string> {
```

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
).run({onStdoutData: onOutput});
```

- [ ] **Step 2: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun run test`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent/tools/bash/run-command.ts
git commit -m "feat(bash-tool): stream stdout via onOutput parameter"
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

- [ ] **Step 3: Update `executeTool` to create and pass `onOutput`**

Update `executeTool` signature to accept `onOutput`. Change:

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

Update the `tool.execute` call inside `executeTool` to pass `onOutput` as the third argument. Change:

```typescript
const content = await tool.execute(parsedArgs, context);
```

To:

```typescript
const content = await tool.execute(parsedArgs, context, onOutput);
```

- [ ] **Step 4: Update call site of `executeTool` in `handleUserMessage`**

In the tool execution map (around line 177), change:

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

## Task 5: Frontend — emit `tool-execute-delta` SSE event

**Files:**

- Modify: `apps/frontend/src/pages/chat/types.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`

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

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/types.ts \
       apps/frontend/src/pages/chat/hooks/useStreamChat.ts
git commit -m "feat(frontend): emit tool-execute-delta SSE events to event bus"
```

---

## Task 6: Create `useToolOutput` hook

**Files:**

- Create: `apps/frontend/src/pages/chat/hooks/useToolOutput.ts`

- [ ] **Step 1: Create the hook**

```typescript
import {useCallback, useEffect, useRef, useState} from 'react';

import {useChatEventBus} from './useChatEventBus.js';

const MAX_OUTPUT_BYTES = 8192; // 8 KB

/**
 * Manages streaming tool output, accumulating delta chunks per callId.
 * Truncates to the most recent 8 KB per tool. Re-renders are throttled
 * to once per animation frame.
 */
export function useToolOutput() {
  const mapRef = useRef(new Map<string, string>());
  const rafIdRef = useRef<number | null>(null);
  const [, forceRender] = useState(0);
  const eventBus = useChatEventBus();

  const scheduleRender = useCallback(() => {
    if (rafIdRef.current === null) {
      rafIdRef.current = requestAnimationFrame(() => {
        rafIdRef.current = null;
        forceRender((v) => v + 1);
      });
    }
  }, []);

  useEffect(() => {
    const onDelta = (data: {callId: string; content: string}) => {
      const current = mapRef.current.get(data.callId) ?? '';
      const updated = current + data.content;
      mapRef.current.set(
        data.callId,
        updated.length > MAX_OUTPUT_BYTES
          ? updated.slice(updated.length - MAX_OUTPUT_BYTES)
          : updated,
      );
      scheduleRender();
    };

    const onEnd = (data: {callId: string}) => {
      mapRef.current.delete(data.callId);
      scheduleRender();
    };

    eventBus.on('tool-execute-delta', onDelta);
    eventBus.on('tool-execute-end', onEnd);

    return () => {
      eventBus.off('tool-execute-delta', onDelta);
      eventBus.off('tool-execute-end', onEnd);
      if (rafIdRef.current !== null) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, [eventBus, scheduleRender]);

  const clear = useCallback(() => {
    mapRef.current.clear();
  }, []);

  return {toolOutput: mapRef.current, clearToolOutput: clear};
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useToolOutput.ts
git commit -m "feat(frontend): add useToolOutput hook with RAF-throttled rendering"
```

---

## Task 7: Display streaming output in ToolExecutionCard via prop drilling

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/MessageList.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/MessageListView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`

- [ ] **Step 1: Wire `useToolOutput` in `ChatPage` and pass to `ChatPageView`**

In `apps/frontend/src/pages/chat/ChatPage.tsx`, import and call the hook:

```typescript
import {useToolOutput} from './hooks/useToolOutput.js';
```

In `ChatPageContent`, add:

```typescript
const {toolOutput, clearToolOutput} = useToolOutput();
```

Pass `clearToolOutput` to `useSessionLifecycle` alongside existing clear functions:

```typescript
const {startNewSession} = useSessionLifecycle({
  stopGeneration,
  clearSessionId,
  clearMessages,
  clearToolOutput,
  clearTitle,
  clearStreamError,
  clearMaxRoundsReached,
});
```

Update `useSessionLifecycle` to accept and call `clearToolOutput` in its `startNewSession` callback. (Read the current file to see the exact structure, then add `clearToolOutput` to the options interface and call it alongside `clearMessages`.)

Pass `toolOutput` to `ChatPageView`:

```tsx
toolOutput = {toolOutput};
```

In `apps/frontend/src/pages/chat/ChatPageView.tsx`, add to `ChatPageViewProps`:

```typescript
toolOutput: ReadonlyMap<string, string>;
```

Accept it in the destructuring and pass to `MessageList`:

```tsx
<MessageList messages={messages} toolOutput={toolOutput} />
```

- [ ] **Step 2: Thread through `MessageList` and `MessageListView`**

In `MessageList.tsx`, add prop and forward:

```typescript
interface MessageListProps {
  messages: ChatMessage[];
  toolOutput: ReadonlyMap<string, string>;
}

export function MessageList({messages, toolOutput}: MessageListProps) {
  const items = useMessageList(messages);
  return <MessageListView items={items} toolOutput={toolOutput} />;
}
```

In `MessageListView.tsx`, add prop and forward to `RenderItem`:

```typescript
interface MessageListViewProps {
  items: MessageRenderItem[];
  toolOutput: ReadonlyMap<string, string>;
}
```

Update the render:

```tsx
{
  items.map((item, index) => (
    <RenderItem
      key={itemKey(item, index)}
      item={item}
      toolOutput={toolOutput}
    />
  ));
}
```

- [ ] **Step 3: Update `RenderItem` to pass `callId` and `toolOutput` to `ToolExecutionCard`**

Add `toolOutput` to props:

```typescript
interface RenderItemProps {
  item: MessageRenderItem;
  toolOutput: ReadonlyMap<string, string>;
}
```

In the `tool-execution` case:

```tsx
    case 'tool-execution':
      return (
        <div className={styles.assistantMessage}>
          <ToolExecutionCard
            callId={item.callId}
            toolName={item.toolName}
            displayName={item.displayName}
            arguments={item.arguments}
            status={item.status}
            result={item.result}
            toolOutput={toolOutput}
          />
        </div>
      );
```

- [ ] **Step 4: Update `ToolExecutionCard` to read output from Map**

```typescript
import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
  toolOutput: ReadonlyMap<string, string>;
}

export function ToolExecutionCard({
  callId,
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
  toolOutput,
}: ToolExecutionCardProps) {
  const output = toolOutput.get(callId);

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

- [ ] **Step 5: Update `ToolExecutionCardView` to render Output section**

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

- [ ] **Step 6: Run typecheck and tests**

Run: `cd apps/frontend && bun run typecheck && bun run test`
Expected: PASS (no changes to transformMessages, existing tests unaffected)

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPage.tsx \
       apps/frontend/src/pages/chat/ChatPageView.tsx \
       apps/frontend/src/pages/chat/components/MessageList/ \
       apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ \
       apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): display streaming tool output in ToolExecutionCard"
```
