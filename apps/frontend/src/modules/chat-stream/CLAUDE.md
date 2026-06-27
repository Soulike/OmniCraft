# chat-stream Module

This module renders the chat message stream and owns everything that is
coupled to the live agent run: the event-bus subscription (`useMessages`), the
`ChatEventBus`/`ToolOutput`/`AskUserSubmit` contexts, and the `RenderItem`
connector that injects those live concerns as props.

The pure, stateless presentation cards (UserMessage, AssistantMessage,
ThinkingBlock, TodoCard, WorkingIndicator, ContextCompactionBlock, AskUserCard)
live in `@/modules/chat-ui-components`, and the tool-execution UI lives in
`@/modules/tool-ui` — none of them know about the agent runtime. What remains
internal here under `components/MessageList/components/` are the thin
**connectors** that bridge the live run to those views: `AskUserCard` (parses
args, owns the submit flow), `ToolExecutionCard` (pulls live `useToolOutput`,
feeds `tool-ui`), and `SubagentDisclosure` (still fully internal — mounts a
nested live stream). Only `StreamingMessageDisplay` and types are exported from
`index.ts`. The showcase page (`showcase/`) is mounted by the router via a deep
import (`@/modules/chat-stream/showcase/index.js`), deliberately kept out of the
public `index.ts` so the debug surface and its mock fixtures stay out of the
shared production chunk.

## Showcase (debug surface)

`showcase/` is a static visual-review page mounted at `/showcase`. It renders
every chat card in every state with mock fixtures (`showcase/mock-data.ts`),
importing the pure cards from `@/modules/chat-ui-components` and the
agent-coupled cards by relative path. Use it to eyeball each card in both light
and dark themes without driving a live session.

### Maintenance contract

Whenever you add or remove a chat card component — whether under
`components/MessageList/components/` here or in `@/modules/chat-ui-components` —
update the showcase in the SAME change:

- **Added a component:** add a `ShowcaseSection` (and `Specimen`s for every
  state) to `showcase/ShowcasePageView.tsx`, plus its fixtures to
  `showcase/mock-data.ts`.
- **Removed a component:** delete its section and fixtures.

Keeping the catalog complete is what makes the showcase a reliable review
surface — a stale showcase is worse than none.
