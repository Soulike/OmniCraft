# chat-ui-components Module

Pure, **stateless presentation** components for the chat message timeline.
Every component here is "props in, UI out": it renders entirely from its props
plus local UI state (expand/collapse, streaming-text animation) and has **no
knowledge of how the chat is driven**.

## Decoupling contract

These components must NOT depend on the agent runtime:

- No `ChatEventBus`, no `eventBus.on(...)`, no `useChatEventBus`.
- No chat-stream contexts (`ToolOutputContext`, `AskUserSubmitContext`, …).
- No imports from `@/modules/chat-stream` or `@/modules/chat-events`.

Allowed dependencies: shared `@/` utilities (`MarkdownRenderer`, `useTheme`,
`useStreamingText`, `usage-info`'s pure `formatTokenCount`) and **type-only**
imports from the neutral SSE contract (`@omnicraft/sse-events`, e.g.
`SseTodoItem`).

The live wiring (subscribing to the event bus, streaming tool output, the
ask_user submit handler) lives in `chat-stream` — its `RenderItem` is the
connector that reads those concerns and passes them here as plain props.

## Consumers

- `chat-stream`'s `RenderItem` — maps render items to these components.
- `chat-stream/showcase` — renders every component from mock props.

When you add or change a component here, update the showcase (see
`chat-stream/CLAUDE.md` for the maintenance contract).
