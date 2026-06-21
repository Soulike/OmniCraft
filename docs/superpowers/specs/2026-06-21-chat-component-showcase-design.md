# Chat Component Showcase Page — Design

## Problem

The recent Chat UI refactor (`modules/chat-stream`) moved every chat card into
its own MVVM component. Some of these were never visually verified after the
move — most notably `AskUserCard`. Reproducing each state through a live chat
session (running tool, error tool, completed answer, subagent stream, context
compaction) is slow and unreliable.

We want a single static page that renders the full catalog of chat-stream
components in every state, so the user can scan it and flag what is broken.

## Goals

- Render every component that appears in the chat message stream.
- Cover every state/variant of each (running / done / failure / error, etc.).
- Be reviewable in both light and dark themes.
- Catch leaf-rendering bugs (the page renders components directly, not via the
  SSE pipeline).

## Non-Goals

- No live interactivity. `AskUserCard` is shown in static states; it is not
  submittable against a mock backend. (Decision: static states only.)
- No SSE-pipeline / dispatcher coverage. The page does NOT route mock SSE events
  through `StreamingMessageDisplay` / `useMessageList` / `RenderItem`. Wiring
  bugs in the dispatcher are out of scope for this page.
- No Storybook. This is a plain route page mounted from the `chat-stream`
  module (repo has no Storybook today).
- Not linked from the sidebar; reached by typing the URL.

## Architecture

The showcase lives **inside the `chat-stream` module**, not under `pages/`.

The leaf cards it needs to render (`AskUserCard`, `ToolExecutionCard`,
`ThinkingBlock`, `TodoCard`, `SubagentDisclosure`, `ContextCompactionBlock`,
`WorkingIndicator`, `UserMessage`, `AssistantMessage`) are **internal** to the
module — `chat-stream/index.ts` only exports `StreamingMessageDisplay`,
`UsageInfo`, and types. Putting the showcase under `pages/` would force us to
either reach across the module boundary into internals or widen the module's
public API just for a dev page. Co-locating the showcase inside the module lets
it import those components by relative path while keeping the public surface
clean. The router mounts it via the module's own export.

```
apps/frontend/src/modules/chat-stream/showcase/
├── ShowcasePage.tsx        # container — assembles sections, owns mock event bus setup
├── ShowcasePageView.tsx    # view — sticky in-page nav + scrollable column of sections
├── index.ts                # exports { ShowcasePage }
├── mock-data.ts            # all mock props / fixtures, typed against real schemas
├── components/
│   ├── ShowcaseSection/    # titled group (one per component family)
│   │   ├── ShowcaseSection.tsx
│   │   ├── ShowcaseSectionView.tsx        (if split needed; may be single file)
│   │   ├── index.ts
│   │   └── styles.module.css
│   └── Specimen/           # caption strip (state label) + the rendered component
│       ├── Specimen.tsx
│       ├── index.ts
│       └── styles.module.css
└── styles.module.css
```

The leaf cards are imported by relative path
(`../components/MessageList/components/AskUserCard/index.js`, etc.) — these stay
internal to the module and are NOT promoted into `chat-stream/index.ts`.

### Route registration

- `chat-stream/index.ts`: add `export {ShowcasePage} from './showcase/index.js';`
  — the single public entry the router mounts. (This is the only addition to the
  module's public surface; the individual leaf cards stay internal.)
- `routes.ts`: add `showcase: {}` to the `defineRoutes` map.
- `router/lazy-pages.tsx`: add a lazy loader for `ShowcasePage`, importing
  `{ShowcasePage}` from `@/modules/chat-stream/index.js`.
- `router/router.tsx`: add `{ path: ROUTES.showcase(), element: <ShowcasePage /> }`
  as a child of the existing `<Layout>` route (so it inherits the theme toggle
  and app chrome, making both themes reviewable).

## How components are rendered

Each component is rendered through its own folder `index.ts` (the Container),
imported by relative path from within the module, with hand-written mock props
typed against the real schema packages (`@omnicraft/sse-events`,
`@omnicraft/tool-schemas`, `@omnicraft/api-schema`). These cards are internal to
`chat-stream` and are not promoted to the module's public API. No mock SSE
events are pushed through the real pipeline.

### Per-component wiring

- **AskUserCard** — `onSubmit` is a logging no-op: `async () => {}`. The
  discriminated-union props require `data` for `done` (`ToolResultData<'ask_user'>`)
  and `failure`/`error` (`ToolFailureData`); fixtures supply these.
- **ToolExecutionCard** — renders standalone. `useToolOutput(callId)` reads
  `ToolOutputContext`, which has a safe default (`{ toolOutput: new Map() }`), so
  no provider is required. One specimen per result sub-renderer, each with its
  matching `data` payload.
- **SubagentDisclosure** — the only component that needs a live `ChatEventBus`
  (its View renders a nested `StreamingMessageDisplay`). `mock-data.ts`
  constructs a real `EventBus` instance from `@/helpers/event-bus.js`. The
  specimen may pre-`emit()` a couple of mock events (e.g. a `text-delta`) so the
  nested stream shows content. Rendered for `running` / `complete` / `error`.
- **ThinkingBlock, TodoCard, ContextCompactionBlock, WorkingIndicator,
  UserMessage, AssistantMessage** — plain props, no special wiring.

## Page layout

A single scrollable column constrained to the chat content width (so cards get
realistic horizontal space). Components are grouped into `ShowcaseSection`s in
roughly the order they appear in `RenderItem`.

A sticky in-page nav at the top provides anchor links to each section for quick
jumping. The nav and all page chrome are static — no ambient/looping motion
(per the project's event-driven-motion rule). Components animate on their own
only as they already do in production.

`Specimen` adds the only showcase-specific chrome: a small caption strip above
each rendered component showing its state label (e.g. `running`,
`done · with options`, `error`). This makes each variant identifiable at a
glance.

## Specimen catalog

| Component              | States / variants                                                                                                                                           |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| UserMessage            | short text; long text with markdown                                                                                                                         |
| AssistantMessage       | empty/streaming (→ WorkingIndicator); with markdown                                                                                                         |
| AskUserCard            | running (free-text); running (with options); done; failure; error                                                                                           |
| ToolExecutionCard      | running; failure; error; + 9 result sub-renderers (done): ReadFile, WriteFile, EditFile, RunCommand, FindFiles, SearchFiles, WebFetch, WebSearch, LoadSkill |
| ThinkingBlock          | thinking (not done); done                                                                                                                                   |
| TodoCard               | in-progress (mixed item states); all complete                                                                                                               |
| SubagentDisclosure     | running; complete; error                                                                                                                                    |
| ContextCompactionBlock | in-progress; done; failed                                                                                                                                   |
| WorkingIndicator       | default                                                                                                                                                     |

## Mock data

All fixtures live in `mock-data.ts`, typed against the real schemas so a schema
change surfaces as a type error in the showcase (a cheap early-warning signal).
Tool-result `data` payloads use the `@omnicraft/tool-schemas` result types for
each tool. The subagent fixture owns the constructed `EventBus` and the events
it pre-emits.

## Styling

CSS Modules only (`styles.module.css`), no Tailwind utility classes in custom
components, consistent with the rest of the frontend. Reuse HeroUI components
where they fit the page chrome (headings, links). Parent controls child layout.

## Testing

This is a visual-review surface; the deliverable is the page itself. No unit
tests are added for the showcase. Correctness of the underlying components
remains covered by their existing `*.test.tsx` files. Type-checking the mock
fixtures against the real schemas is the automated safety net.

## Risks / Open questions

- `SubagentDisclosure` renders a nested `StreamingMessageDisplay`, which itself
  consumes the event bus and its own contexts. If it expects providers not
  present on the showcase route, the specimen may need a minimal provider
  wrapper. To be confirmed during implementation; fallback is to wrap just that
  specimen in the required provider(s).
