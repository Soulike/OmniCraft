# TodoPanel Redesign — Inline "Plan" Card

> Status: approved design, ready for implementation planning.
> Issue: [#284](https://github.com/Soulike/OmniCraft/issues/284) — Redesign TodoPanel UI.
> Design language: see `apps/frontend/docs/design-language.md` ("Aurora Glass").

## 1. Problem

The current `TodoPanel` is a floating overlay anchored above the chat composer
(`BottomBar`'s `todoPanelWrapper` is `position: absolute; bottom: 100%`). It has
three problems:

1. **It occludes chat content** — the expanded list floats over the message
   scroll area.
2. **It is temporary, awkward chrome** — a single global panel bolted to the
   composer, visually disconnected from the conversation it describes.
3. **It cannot represent subagent todos.** Each subagent renders its own nested
   `StreamingMessageDisplay` with its own event bus that emits `todo-update`,
   but the single composer-anchored panel only ever shows the main agent's
   todos.

## 2. Goal

Replace the floating panel with an **inline "Plan" card** that lives in the
message stream as a normal timeline item — the same component family as
`ThinkingBlock`, `ToolExecutionCard`, and `SubagentDisclosure`. It must:

- Never occlude chat content (it scrolls with the conversation).
- Work identically inside a subagent's expanded stream, with zero special-casing.
- Survive a session reload (reconstruct from replayed history).
- Match the Aurora Glass language and be first-class in both light and dark.

## 3. Key insight — todos are a property of an event bus, not the composer

`todo-update` is an SSE event carrying the **full todo snapshot** on every
change. It is already routed **per-bus** (`route-base-event-to-bus.ts`), and each
subagent has its own bus. So the data needed for inline-in-subagent todos
**already flows** — the only thing tying todos to the composer today is the
consumption side (`useTodoItems` reads it as side-channel `useState`, and
`BottomBar` positions a panel over the composer).

Moving todos into the message stream means: drop `useTodoItems` + the
`BottomBar` wrapper, and instead let the **same `useMessages` reducer** that
already builds the timeline handle `todo-update` — which makes subagents work
for free (their nested `StreamingMessageDisplay` runs its own `useMessages` on
its own bus).

### 3.1 Reload survival — verified

`todo-update` events **are persisted** and replayed in order. The chain:

- `agent-turn-runner.ts` pushes the `todo-update` to the tool SSE channel, then
  `yield`s it.
- `agent.ts` `pump()` consumes every yielded event and calls `appendSseEvent` →
  `sseLog.append` → `sse-events.jsonl` on disk.
- On session reopen, `AgentSseLog.createReader()` replays all persisted events
  (including `todo-update`) in order through the same frontend event bus.

(The in-memory `TodoStore` is irrelevant to replay — the **events**, not the
store, are the persisted source of truth, exactly like `tool-execute-*`.)

**Therefore the redesign requires no backend or SSE changes.** It is entirely a
frontend change.

## 4. Behavior — adjacency-coalesced stream item

The card is a stream item, inserted and updated by one rule in `useMessages`:

> On each `todo-update`: if the **last message in the array is a `todo` card**,
> replace its items in place. Otherwise, **append a new `todo` card**.

Why this rule:

- Consecutive `todo-update`s with nothing between them (e.g. one task → done and
  the next → in_progress in the same tool round) **collapse into one card** — no
  spam. Note `todo-update` fires on every micro status flip, so a 6-task plan
  emits ~10–15 events; without coalescing this would stack ~15 near-identical
  cards.
- Once the agent does real work between updates (emits assistant text, runs a
  tool, dispatches a subagent), the **next** `todo-update` pins a **fresh card**
  after that work. The result is a natural, replayable timeline:
  _plan → work → updated plan → work → …_.
- No "structural vs. status change" classification is needed — **adjacency is
  the signal.** This works identically live and on history replay, because both
  paths feed the same reducer in the same order.

This mirrors the existing `pushToolStart` / `pushToolEnd` pattern in
`useMessages.ts`.

### 4.1 Empty / cleared todos

`todo-update` with an empty `items` array (e.g. after `todoClear`) renders
nothing. The render-item builder skips emitting a card when its snapshot is
empty (mirrors how `transformMessages` skips an empty finished `thinking`
block). A subsequent non-empty `todo-update` will append a fresh card (the last
stream item is no longer a todo card), which is the desired behavior.

## 5. Frontend implementation surface

All changes are in
`apps/frontend/src/modules/chat-session/`. The component follows the repo's MVVM
structure and the existing inline-card conventions.

### 5.1 Data model (`StreamingMessageDisplay/types.ts`)

Add a `todo` content variant carrying the snapshot:

```ts
export interface TodoContent {
  type: 'todo';
  items: readonly SseTodoItem[];
}
```

Add `TodoContent` to the `MessageContent` union.

### 5.2 Reducer (`hooks/useMessages.ts`)

Add an `onTodoUpdate(items)` handler implementing the §4 rule:

- If `prev` is non-empty and the last message's `content.type === 'todo'`,
  replace that message's `content.items` in place.
- Otherwise append a new `{role: 'assistant', content: {type: 'todo', items}}`
  message (after `removeTrailingAssistantMessageIfEmpty`, consistent with
  `pushToolStart`).

Subscribe/unsubscribe `eventBus.on('todo-update', onTodoUpdate)` alongside the
other handlers. This single subscription covers the main agent **and** every
subagent, since each `StreamingMessageDisplay` instantiates its own
`useMessages` on its own bus.

### 5.3 Render-item transform (`hooks/useMessageList.ts`)

- Add a `TodoRenderItem` (`{type: 'todo'; items: readonly SseTodoItem[]}`) to the
  `MessageRenderItem` union.
- In `transformMessages`, add a `case 'todo'`: push a `TodoRenderItem` unless
  `items` is empty (§4.1).

### 5.4 Dispatch (`components/RenderItem/RenderItem.tsx`)

Add `case 'todo':` returning the new card wrapped in the standard
`styles.assistantMessage` container used by the other inline cards.

### 5.5 New generic component — `components/StatusTimeline/`

The expanded body's vertical-spine timeline is **not todo-specific** — it maps a
list of `{status, content}` to connected status nodes, and is reusable anywhere
a sequence of stepped/checklist states needs to be shown. Extract it as a
generic, business-agnostic component under `apps/frontend/src/components/`
(alongside `CollapsibleSidebar`, `MarkdownRenderer`), **not** inside
`chat-session`.

```
StatusTimeline/
  index.ts
  StatusTimeline.tsx        // stateless; renders nodes + connecting spine
  styles.module.css
  StatusTimeline.test.tsx
```

Proposed interface (kept domain-agnostic — no `SseTodoItem` dependency):

```ts
type StatusTimelineStatus = 'pending' | 'in-progress' | 'done';

interface StatusTimelineItem {
  status: StatusTimelineStatus;
  content: ReactNode; // caller supplies the row content (text, tooltip wrapper…)
}

interface StatusTimelineProps {
  items: readonly StatusTimelineItem[];
}
```

The component owns only the node rendering (done = filled `--success` + check,
`in-progress` = `--accent` ring + reused glow, `pending` = hollow `--border`
disc) and the connecting spine. It does **not** know about todos, strikethrough,
or tooltips — the caller passes those in via `content` so the timeline stays
reusable.

### 5.6 New component — `components/TodoCard/`

Replaces the deleted `TodoPanel`. Lives in `chat-session` (it is
todo/chat-specific). MVVM layout per frontend CLAUDE.md:

```
TodoCard/
  index.ts
  TodoCard.tsx          // optional thin container (props only; stateless data in)
  TodoCardView.tsx      // stateless view; disclosure open/closed is local UI state
  styles.module.css
  TodoCardView.test.tsx
```

The card takes `items: readonly SseTodoItem[]`. It is self-contained: collapsed
vs. expanded is local view state (a HeroUI `Disclosure`, matching
`SubagentDisclosure`). The expanded body **composes `StatusTimeline`**, mapping
each `SseTodoItem` to a `StatusTimelineItem` whose `content` is the subject
(with completed-row strikethrough/`--muted` styling and the description
`Tooltip` applied here, in the todo layer — not in the generic timeline).

### 5.7 Deletions

- Delete `components/TodoPanel/` entirely.
- Delete `hooks/useTodoItems.ts` and its export from `modules/chat-session/index.ts`.
- Remove the `TodoPanel` + `todoPanelWrapper` from `components/BottomBar/`. If
  `BottomBar` then only wraps `InfoBar`, simplify it accordingly (it no longer
  needs the `position: relative` overlay anchor).

## 6. Visual design (Aurora Glass)

The card is a glass card in the existing inline-card family — **static at rest**,
both themes first-class, accent used only for the active task. The approved
mockup is in `.superset/mockups/todo-card-mock.html` (built with the real
`aurora-glass.css` + HeroUI token values).

### 6.1 Collapsed (default)

A single compact, chromeless row — matching the `ToolExecutionCard` header
(no card border/shadow when collapsed; the glass shell appears only on expand):

```
[icon]  Plan · 3/6   ·  <current in_progress subject>          [›]
```

- **Checklist icon** (lucide `ListChecks`, `--muted`) — the at-a-glance marker
  that this is a plan.
- **`Plan · N/M`** — `Plan` in `--foreground`, the `· N/M` count in `--muted`.
  The bare `N/M` count is the progress signal; a separate progress bar was
  intentionally dropped as redundant (it duplicated the count and added visual
  weight the sibling tool-call rows don't carry).
- **Current task** — the `in_progress` item's subject, `--muted`, truncated with
  ellipsis. Omitted if no task is in progress.
- **Disclosure indicator** (HeroUI `Disclosure.Indicator`) — the caret, on the
  right; rotates on expand.

### 6.2 Expanded — topology-spine timeline

The body reveals the full checklist as a vertical timeline whose **spine
connects the status nodes** (a deliberate echo of the brand node-topology
motif):

- **Node per task:**
  - `completed` — filled `--success` disc with a check mark.
  - `in_progress` — `--accent` ring with a soft accent center; carries the
    accent glow in **dark only**, achieved by reusing the existing
    `--aurora-active-bar-glow` token (already `none` in light, accent glow in
    dark — exactly the P4 behavior, no new token needed).
  - `pending` — hollow disc with a faint border using the existing `--border`
    token.
- **Connecting spine** — a 1.5px vertical line between consecutive nodes, using
  the existing `--border` token.
- **Task text** — `--foreground`; `completed` rows are `--muted` + strikethrough
  (kept from the current design). Applied in the `TodoCard` layer, not the
  generic timeline.
- **Description** — shown on a HeroUI `Tooltip` per row (kept from the current
  design). Applied in the `TodoCard` layer.

These node/spine styles live in `StatusTimeline`'s own `styles.module.css`
(consuming the tokens above); the todo-specific text styling lives in
`TodoCard`.

### 6.3 Card chrome

Chromeless when collapsed (no background/border/shadow — just the tight
borderless row), then a glass shell **on expand only**, gated by
`:has(.trigger[aria-expanded='true'])` — exactly the `ToolExecutionCard`
pattern. The expanded shell uses `--aurora-glass-fill` + `1px solid
--aurora-glass-border` + `--aurora-glass-highlight` + `--aurora-glass-blur`;
radius ~10px. The collapsed row gets a hover fill and a focus-visible outline.

### 6.4 No new global tokens

The card and timeline need no additions to `src/aurora-glass.css`. Every value
is an **existing** theme-aware token, consumed directly in the component CSS:

- spine line + pending-node border → `--border`
- done node → `--success`; current-node ring → `--accent`
- current-node glow (the only light/dark-divergent value) →
  `--aurora-active-bar-glow` (already `none` in light, accent glow in dark)
- expanded card shell → `--aurora-glass-*` (same tokens as the sibling cards)

Because these are already per-theme, the component needs **no** `:global(.dark)`
overrides and **no** hard-coded raw values — it stays correct in both themes for
free.

## 7. Motion (P3 — event-driven only)

The resting card is fully static. The only motion:

- **Caret rotation** on expand/collapse (HeroUI `Disclosure.Indicator`),
  event-driven, settles.
- **Collapsed-row hover fill** (~150ms background transition), settles.
- **No ambient motion** on the in_progress node — it is a static accent ring at
  rest (no pulsing/breathing).
- All transitions honor `prefers-reduced-motion: reduce` by snapping to the
  final state.

## 8. Out of scope

- No backend or SSE changes (§3.1).
- No change to how/when the agent emits `todo-update` (frequency, snapshot
  semantics) — the frontend coalescing rule (§4) absorbs the existing event
  cadence.
- No "sticky to viewport" behavior for the active card. The card scrolls with
  the conversation like every other timeline item; pinning the running plan to
  the viewport is a possible future enhancement, explicitly not in this scope.

## 9. Testing

- **`useMessages` reducer** — unit-test the coalescing rule: (a) two adjacent
  `todo-update`s collapse into one card; (b) a `todo-update` after an
  intervening message appends a second card; (c) empty `items` produces no card;
  (d) replay order (history) yields the same card sequence as live.
- **`StatusTimeline`** — render the three node states from a plain
  `StatusTimelineItem[]`; verify the spine connects consecutive nodes and the
  component carries no todo-specific knowledge (content is passed in).
- **`TodoCardView`** — render states: collapsed shows correct `N/M` and current
  subject; expanded shows correct node states; completed rows struck through;
  no-in-progress hides the current-subject text.
- **Browser validation** (frontend CLAUDE.md) — verify in a real browser in both
  light and dark, including a card rendered inside a subagent's expanded stream.
  Include screenshots in the PR.

```

```
