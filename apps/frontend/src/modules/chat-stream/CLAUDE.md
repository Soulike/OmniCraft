# chat-stream Module

This module renders the chat message stream. The leaf card components under
`components/MessageList/components/` (AskUserCard, ToolExecutionCard,
ThinkingBlock, TodoCard, SubagentDisclosure, ContextCompactionBlock,
WorkingIndicator, UserMessage, AssistantMessage) are internal to this module —
only `StreamingMessageDisplay`, `UsageInfo`, `ShowcasePage`, and types are
exported from `index.ts`.

## Showcase (debug surface)

`showcase/` is a static visual-review page mounted at `/showcase`. It renders
every chat card in every state with mock fixtures (`showcase/mock-data.ts`),
importing the internal cards by relative path. Use it to eyeball each card in
both light and dark themes without driving a live session.

### Maintenance contract

Whenever you add or remove a chat card component under
`components/MessageList/components/`, update the showcase in the SAME change:

- **Added a component:** add a `ShowcaseSection` (and `Specimen`s for every
  state) to `showcase/ShowcasePageView.tsx`, plus its fixtures to
  `showcase/mock-data.ts`.
- **Removed a component:** delete its section and fixtures.

Keeping the catalog complete is what makes the showcase a reliable review
surface — a stale showcase is worse than none.
