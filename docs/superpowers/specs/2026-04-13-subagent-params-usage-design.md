# Subagent Parameters & Usage Display

## Problem

The subagent disclosure UI currently shows only the task description and execution output. Dispatch parameters (agent type, thinking level, working directory) and per-subagent usage statistics (model, token counts) are available but not displayed.

## Design

### Layout

The subagent disclosure card gains two new display areas:

1. **Working directory** — shown inside the expanded Task section, below the task text. Always displayed (monospace font, muted color).

2. **Params footer** — a bar inside the disclosure card (below the content area, above the card's bottom border). Shows `Type` and `Thinking` as inline tag chips. Only visible when expanded.

3. **Usage row** — sits **outside** the disclosure card, directly below it. Visible whether collapsed or expanded. Appears once the first `done` event arrives. Shows: model name, input tokens / max tokens (%), output tokens, cached tokens (%).

Usage accumulates across multiple `done` events into a cumulative total (summing `inputTokens`, `outputTokens`, `cacheReadInputTokens`; `maxInputTokens` and `model` taken from the latest event).

### Data Flow

#### Backend: Extend `subagent-dispatch` SSE event

Add `agentType`, `thinkingLevel`, and `workingDirectory` to `sseSubagentDispatchEventSchema` in `packages/sse-events/src/schema.ts`:

```typescript
sseSubagentDispatchEventSchema = z.object({
  type: z.literal('subagent-dispatch'),
  agentId: z.string(),
  task: z.string(),
  agentType: z.string(), // 'general' | 'coding'
  thinkingLevel: z.string(), // 'none' | 'low' | 'medium' | 'high'
  workingDirectory: z.string(), // absolute path
});
```

Update the emit site in `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` (around line 168) to include the new fields from the resolved `args`.

#### Frontend: Propagate new fields through the event chain

1. **`useStreamChat.ts`** — the `subagent-dispatch` case already destructures the event. Pass the new fields into the `subagent-dispatched` bus event.

2. **`ChatEventMap` (`types.ts`)** — add `agentType`, `thinkingLevel`, `workingDirectory` to the `subagent-dispatched` event payload.

3. **`SubagentContent` (`types.ts`)** — add the same three fields so they are stored in `ChatMessage`.

4. **`useMessages.ts`** — `pushSubagentStart` already receives the dispatched data. Pass the new fields into the `SubagentContent`.

5. **`SubagentRenderItem` (`useMessageList.ts`)** — add `agentType`, `thinkingLevel`, `workingDirectory`. `transformMessages` passes them through from `SubagentContent`.

6. **`RenderItem.tsx`** — pass the new fields to `SubagentDisclosure`.

#### Frontend: Usage accumulation

Create a `useSubagentUsage` hook that subscribes to the subagent's `ChatEventBus` `done` events and accumulates a cumulative `SseUsage`:

- `inputTokens` += each event's `inputTokens`
- `outputTokens` += each event's `outputTokens`
- `cacheReadInputTokens` += each event's `cacheReadInputTokens`
- `maxInputTokens` = latest event's `maxInputTokens`
- `model` = latest event's `model`

Returns `SseUsage | null` (null until first `done` event).

#### Frontend: UI Components

**`SubagentDisclosure`** — receives new props: `agentType`, `thinkingLevel`, `workingDirectory`, and the subagent's `eventBus` for usage tracking. Composes `useSubagentUsage(eventBus)`.

**`SubagentDisclosureView`** — render changes:

- Task section: add `workingDirectory` below task text (monospace, muted).
- New params footer bar inside the card: two tag chips for Type and Thinking.
- Usage row rendered **outside** the `<Disclosure>` card, below it. Uses the existing `UsageInfo` component. Conditionally rendered (only when usage is non-null).

Wrap the card + usage row in a container `<div>` so they sit together as a unit.

### Files Changed

| Layer              | File                                                              | Change                                                                                   |
| ------------------ | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Schema             | `packages/sse-events/src/schema.ts`                               | Add `agentType`, `thinkingLevel`, `workingDirectory` to `sseSubagentDispatchEventSchema` |
| Backend            | `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`   | Include new fields in the emitted `subagent-dispatch` event                              |
| Frontend types     | `apps/frontend/.../StreamingMessageDisplay/types.ts`              | Add fields to `SubagentContent` and `ChatEventMap['subagent-dispatched']`                |
| Frontend hook      | `apps/frontend/.../useStreamChat.ts`                              | Pass new fields from SSE event to bus emit                                               |
| Frontend hook      | `apps/frontend/.../useMessages.ts`                                | Pass new fields into `SubagentContent` in `pushSubagentStart`                            |
| Frontend hook      | `apps/frontend/.../useMessageList.ts`                             | Add fields to `SubagentRenderItem`, pass through in `transformMessages`                  |
| Frontend hook      | `apps/frontend/.../SubagentDisclosure/hooks/useSubagentUsage.ts`  | **New file.** Accumulates cumulative usage from `done` events                            |
| Frontend component | `apps/frontend/.../RenderItem/RenderItem.tsx`                     | Pass new props to `SubagentDisclosure`                                                   |
| Frontend component | `apps/frontend/.../SubagentDisclosure/SubagentDisclosure.tsx`     | Accept new props, compose `useSubagentUsage`                                             |
| Frontend component | `apps/frontend/.../SubagentDisclosure/SubagentDisclosureView.tsx` | Render working dir, params footer, usage row                                             |
| Frontend styles    | `apps/frontend/.../SubagentDisclosure/styles.module.css`          | Add styles for params footer, usage row, working dir                                     |
