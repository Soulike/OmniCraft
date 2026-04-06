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

In `useMessages`, add a `useState` for the tool output map:

```typescript
const [toolOutput, setToolOutput] = useState(new Map<string, string>());
```

Add event handlers inside the `useEffect`:

```typescript
const onToolExecuteDelta = (data: {callId: string; content: string}) => {
  setToolOutput((prev) => {
    const next = new Map(prev);
    const current = next.get(data.callId) ?? '';
    const updated = current + data.content;
    next.set(
      data.callId,
      updated.length > MAX_OUTPUT_BYTES
        ? updated.slice(updated.length - MAX_OUTPUT_BYTES)
        : updated,
    );
    return next;
  });
};
const onToolExecuteEndWithCleanup = (data: ToolExecutionEndContent) => {
  setToolOutput((prev) => {
    const next = new Map(prev);
    next.delete(data.callId);
    return next;
  });
  setMessages((prev) => pushToolEnd(prev, data));
};
```

Replace the existing `onToolExecuteEnd` handler and subscription with `onToolExecuteEndWithCleanup`. Add `onToolExecuteDelta` subscription. Update the cleanup return accordingly.

Export `toolOutput` from the hook:

```typescript
return {messages, toolOutput, clearMessages};
```

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/types.ts \
       apps/frontend/src/pages/chat/hooks/useStreamChat.ts \
       apps/frontend/src/pages/chat/hooks/useMessages.ts
git commit -m "feat(frontend): handle tool-execute-delta events with 8KB output buffer"
```

---

## Task 6: Display streaming output in ToolExecutionCard via context

**Files:**

- Create: `apps/frontend/src/pages/chat/contexts/ToolOutputContext/ToolOutputContext.ts`
- Create: `apps/frontend/src/pages/chat/contexts/ToolOutputContext/ToolOutputProvider.tsx`
- Create: `apps/frontend/src/pages/chat/contexts/ToolOutputContext/index.ts`
- Create: `apps/frontend/src/pages/chat/contexts/ToolOutputContext/useToolOutput.ts`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx`
- Modify: `apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Create ToolOutputContext**

`apps/frontend/src/pages/chat/contexts/ToolOutputContext/ToolOutputContext.ts`:

```typescript
import {createContext} from 'react';

export const ToolOutputContext = createContext<ReadonlyMap<string, string>>(
  new Map(),
);
```

- [ ] **Step 2: Create ToolOutputProvider**

`apps/frontend/src/pages/chat/contexts/ToolOutputContext/ToolOutputProvider.tsx`:

```typescript
import type {ReactNode} from 'react';

import {ToolOutputContext} from './ToolOutputContext.js';

interface ToolOutputProviderProps {
  toolOutput: ReadonlyMap<string, string>;
  children: ReactNode;
}

export function ToolOutputProvider({
  toolOutput,
  children,
}: ToolOutputProviderProps) {
  return (
    <ToolOutputContext value={toolOutput}>{children}</ToolOutputContext>
  );
}
```

- [ ] **Step 3: Create useToolOutput hook**

`apps/frontend/src/pages/chat/contexts/ToolOutputContext/useToolOutput.ts`:

```typescript
import {useContext} from 'react';

import {ToolOutputContext} from './ToolOutputContext.js';

/** Returns the streaming output for a specific tool call, or undefined if none. */
export function useToolOutput(callId: string): string | undefined {
  const map = useContext(ToolOutputContext);
  return map.get(callId);
}
```

- [ ] **Step 4: Create index.ts**

`apps/frontend/src/pages/chat/contexts/ToolOutputContext/index.ts`:

```typescript
export {ToolOutputProvider} from './ToolOutputProvider.js';
export {useToolOutput} from './useToolOutput.js';
```

- [ ] **Step 5: Wire provider in ChatPage**

In `apps/frontend/src/pages/chat/ChatPage.tsx`, import the provider:

```typescript
import {ToolOutputProvider} from './contexts/ToolOutputContext/index.js';
```

Update the `useMessages` destructuring:

```typescript
const {messages, toolOutput, clearMessages} = useMessages();
```

Wrap `ChatPageView` with `ToolOutputProvider` in the return of `ChatPageContent`:

```tsx
    <ToolOutputProvider toolOutput={toolOutput}>
      <ChatPageView ... />
    </ToolOutputProvider>
```

- [ ] **Step 6: Update ToolExecutionCard to read from context**

In `ToolExecutionCard.tsx`, add `callId` as a required prop and use the hook to get output:

```typescript
import {useToolOutput} from '../../../../contexts/ToolOutputContext/index.js';
import {ToolExecutionCardView} from './ToolExecutionCardView.js';

interface ToolExecutionCardProps {
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export function ToolExecutionCard({
  callId,
  toolName,
  displayName,
  arguments: toolArguments,
  status,
  result,
}: ToolExecutionCardProps) {
  const output = useToolOutput(callId);

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

- [ ] **Step 7: Update RenderItem to pass callId**

In `RenderItem.tsx`, add `callId={item.callId}` to `ToolExecutionCard`:

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
          />
        </div>
      );
```

- [ ] **Step 8: Update ToolExecutionCardView to render Output section**

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

- [ ] **Step 9: Run typecheck and tests**

Run: `cd apps/frontend && bun run typecheck && bun run test`
Expected: PASS (no changes to transformMessages, existing tests unaffected)

- [ ] **Step 10: Commit**

```bash
git add apps/frontend/src/pages/chat/contexts/ToolOutputContext/ \
       apps/frontend/src/pages/chat/ChatPage.tsx \
       apps/frontend/src/pages/chat/components/MessageList/components/ToolExecutionCard/ \
       apps/frontend/src/pages/chat/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): display streaming tool output in ToolExecutionCard via context"
```
