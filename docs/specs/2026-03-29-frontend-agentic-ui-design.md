# Frontend Agentic UI Integration Design

## Overview

Integrate the backend agentic framework's SSE events into the frontend chat UI. Display tool execution status as collapsible cards in the conversation, handle `max_rounds_reached` with a warning, and add Agent settings (maxToolRounds) to the settings page.

## Message Model

Replace the current `content: string` with a structured `content: MessageContent[]` array. Each entry represents one event in chronological order. Data layer is append-only — no in-place mutation.

```typescript
type MessageContent =
  | TextContent
  | ToolExecutionStartContent
  | ToolExecutionEndContent;

interface TextContent {
  type: 'text';
  content: string;
}

interface ToolExecutionStartContent {
  type: 'tool-execution-start';
  callId: string;
  toolName: string;
  arguments: string;
}

interface ToolExecutionEndContent {
  type: 'tool-execution-end';
  callId: string;
  result: string;
  isError: boolean;
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: MessageContent[];
}
```

User messages: `[{ type: 'text', content: 'Hello' }]`.

Assistant messages: any sequence of text and tool-execution events, e.g.:

```
[text, tool-execution-start, tool-execution-end, text, tool-execution-start, tool-execution-end, text]
```

## Hook Layer Changes

### useMessages

Replace the current string-based operations with `MessageContent[]` operations:

- `addUserMessage(content: string)`: creates `{ role: 'user', content: [{ type: 'text', content }] }` and an empty assistant placeholder `{ role: 'assistant', content: [] }`.
- `appendTextToLastAssistant(token: string)`: if the last entry in the assistant's `content` array is a `TextContent`, append to it. Otherwise push a new `TextContent`.
- `pushContentToLastAssistant(item: ToolExecutionStartContent | ToolExecutionEndContent)`: push a new entry to the assistant's `content` array.
- `removeLastAssistantMessageIfEmpty()`: remove if the assistant's `content` array is empty.

### useStreamChat

Update the event handler switch:

- `text-delta`: call `appendTextToLastAssistant(event.content)`
- `tool-execute-start`: call `pushContentToLastAssistant({ type: 'tool-execution-start', callId: event.callId, toolName: event.toolName, arguments: event.arguments })`
- `tool-execute-end`: call `pushContentToLastAssistant({ type: 'tool-execution-end', callId: event.callId, result: event.result, isError: event.isError })`
- `done` with `reason: 'max_rounds_reached'`: set a warning state (`maxRoundsReached: true`)
- `done` with `reason: 'complete'`: existing cleanup
- `error`: existing error handling

Expose `maxRoundsReached` and `clearMaxRoundsReached` from the hook.

## View Model Hook: useMessageList

New hook inside `MessageList/hooks/useMessageList.ts`. Takes `ChatMessage[]` and produces a renderable view model for each message.

```typescript
type MessageRenderItem = UserMessageRenderItem | AssistantMessageRenderItem;

interface UserMessageRenderItem {
  type: 'user';
  text: string;
}

interface AssistantMessageRenderItem {
  type: 'assistant';
  segments: AssistantSegment[];
}

type AssistantSegment = TextRenderSegment | ToolExecutionRenderSegment;

interface TextRenderSegment {
  type: 'text';
  content: string;
  isStreaming: boolean; // true only for the last text segment of a streaming message
}

interface ToolExecutionRenderSegment {
  type: 'tool-execution';
  callId: string;
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}
```

Logic: iterate through each `ChatMessage`, convert its `content: MessageContent[]` into the render model. For assistant messages, pair `tool-execution-start` with matching `tool-execution-end` by `callId`. If a start has no matching end yet, `status: 'running'`.

## Component Changes

### MessageList (MVVM split)

Currently `MessageList` is a single component without a hook layer. Split it into the standard MVVM pattern:

```
MessageList/
├── MessageList.tsx          ← Container: calls useMessageList, passes result to view
├── MessageListView.tsx      ← View: receives MessageRenderItem[], renders segments
├── hooks/
│   └── useMessageList.ts    ← View model: ChatMessage[] → MessageRenderItem[]
├── styles.module.css        ← Existing styles
├── index.ts
├── components/
│   ├── MessageBubble/       ← Existing, renders text
│   └── ToolExecutionCard/   ← New, renders tool card
```

`MessageList.tsx` still accepts `ChatMessage[]` from the parent — its public interface doesn't change. Internally it calls `useMessageList(messages)` to get `MessageRenderItem[]`, then passes that to `MessageListView`.

`MessageListView` iterates `MessageRenderItem[]`:

- `UserMessageRenderItem` → single `MessageBubble`
- `AssistantMessageRenderItem` → iterate `segments`, render `MessageBubble` for text and `ToolExecutionCard` for tool executions. All left-aligned.

### ToolExecutionCard (new component)

Location: `pages/chat/components/MessageList/components/ToolExecutionCard/`

Built using HeroUI's **Disclosure** component for collapse/expand behavior and **Spinner** for the running state.

```
Disclosure
├── Disclosure.Heading
│   └── Disclosure.Trigger
│       ├── Tool icon + tool name
│       ├── Status indicator:
│       │   ├── Running: <Spinner size="sm" /> + "Running..."
│       │   ├── Done: ✓ + "Done"
│       │   └── Error: ✗ + "Error" (red)
│       └── Disclosure.Indicator (chevron)
└── Disclosure.Content
    └── Disclosure.Body
        ├── Arguments: label + <pre> with JSON
        └── Result: label + <pre> with result text (red for errors)
```

Left-aligned with assistant messages. Uses CSS Modules for custom styling on top of HeroUI's Disclosure structure. Default state is collapsed.

### ChatAlert (new component)

Location: `pages/chat/components/ChatAlert/`

A reusable, dismissible alert bar for the chat page. Replaces the inline `Alert` currently in `ChatPageView.tsx`. Supports two variants:

- **error**: red, used for session/stream errors (existing behavior)
- **warning**: amber, used for max rounds reached

Props:

```typescript
interface ChatAlertProps {
  status: 'danger' | 'warning';
  title: string;
  message: string;
  onDismiss: () => void;
}
```

Built with HeroUI `Alert` + `CloseButton`, same as the current inline implementation but extracted into a reusable component.

`ChatPageView` renders `ChatAlert` for both error and max-rounds-reached states. The inline Alert code in `ChatPageView` is removed.

### MessageBubble changes

The streaming animation (`useStreamingText`) currently operates on `message.content` as a string. With the new model, each `TextContent` entry in the message is rendered as a separate text bubble. The streaming animation should apply only to the **last** `TextContent` in the assistant message (the one currently being streamed into). All prior `TextContent` entries are already complete and rendered without animation.

The `useStreamingText` hook's interface doesn't change — it still receives a `string`. The caller passes the individual `TextContent.content` string. The hook is used only for the last text entry of a streaming assistant message.

## Settings Page

### New tab: Agent

Add an "Agent" tab to the settings page alongside the existing "LLM" tab.

In `SettingsPage.tsx`:

- Add `{id: 'agent', label: 'Agent'}` to `TABS`
- Add route mapping for `settings.agent`

### AgentSection (new)

Location: `pages/settings/sections/agent/`

Follows the same pattern as `LlmSection`:

- Uses `SettingSection` with field definitions from `settingsSchema.shape.agent`
- Single field: `agent/maxToolRounds` as a number input

### Route

Add `agent: {}` under `settings` in `routes.ts` to create the `/settings/agent` route.

## Files Affected

### New Files

| Path                                                                                       | Purpose                                         |
| ------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `pages/chat/components/MessageList/MessageListView.tsx`                                    | New view component split from MessageList       |
| `pages/chat/components/MessageList/hooks/useMessageList.ts`                                | View model: ChatMessage[] → MessageRenderItem[] |
| `pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCard.tsx`     | Container                                       |
| `pages/chat/components/MessageList/components/ToolExecutionCard/ToolExecutionCardView.tsx` | View                                            |
| `pages/chat/components/MessageList/components/ToolExecutionCard/styles.module.css`         | Styles                                          |
| `pages/chat/components/MessageList/components/ToolExecutionCard/index.ts`                  | Export                                          |
| `pages/chat/components/ChatAlert/ChatAlert.tsx`                                            | Reusable alert (error + warning)                |
| `pages/chat/components/ChatAlert/styles.module.css`                                        | Styles                                          |
| `pages/chat/components/ChatAlert/index.ts`                                                 | Export                                          |
| `pages/settings/sections/agent/AgentSection.tsx`                                           | Agent settings section                          |
| `pages/settings/sections/agent/AgentSectionFields.tsx`                                     | Agent settings fields                           |
| `pages/settings/sections/agent/index.ts`                                                   | Export                                          |

### Modified Files

| Path                                                                                   | Change                                                                 |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `pages/chat/types.ts`                                                                  | Replace `content: string` with `content: MessageContent[]` + new types |
| `pages/chat/hooks/useMessages.ts`                                                      | New operations for `MessageContent[]`                                  |
| `pages/chat/hooks/useStreamChat.ts`                                                    | Handle all SSE event types, expose maxRoundsReached                    |
| `pages/chat/ChatPage.tsx`                                                              | Pass maxRoundsReached warning state                                    |
| `pages/chat/ChatPageView.tsx`                                                          | Replace inline Alert with ChatAlert, add max rounds warning            |
| `pages/chat/components/MessageList/MessageList.tsx`                                    | Becomes container: calls useMessageList, delegates to MessageListView  |
| `pages/chat/components/MessageList/components/MessageBubble/MessageBubble.tsx`         | Adapt to receive individual TextRenderSegment                          |
| `pages/chat/components/MessageList/components/MessageBubble/hooks/useStreamingText.ts` | Accept string (no interface change, but callers change)                |
| `pages/settings/SettingsPage.tsx`                                                      | Add Agent tab                                                          |
| `src/routes.ts`                                                                        | Add agent route                                                        |
