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

### 5.5 New component — `components/TodoCard/`

Replaces the deleted `TodoPanel`. MVVM layout per frontend CLAUDE.md:

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
`SubagentDisclosure`).

### 5.6 Deletions

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

A single compact row:

```
[›]  [▬▬▬▬░░░░]   Plan · 3/6   ·  <current in_progress subject>
```

- **Caret** (lucide chevron) — rotates on expand.
- **Progress track** — HeroUI `ProgressBar` (continuous rounded track + accent
  fill), `value = completed / total`. Use HeroUI's `ProgressBar` component with
  `color="accent"`, sized small; no visible label/output (the count text lives
  in the header). This was chosen over a hand-rolled segmented bar — reuse
  HeroUI per design-language P6.
- **`Plan · N/M`** — `Plan` in `--foreground`, the `· N/M` count in `--muted`.
- **Current task** — the `in_progress` item's subject, `--muted`, truncated with
  ellipsis. Omitted if no task is in progress.

### 6.2 Expanded — topology-spine timeline

The body reveals the full checklist as a vertical timeline whose **spine
connects the status nodes** (a deliberate echo of the brand node-topology
motif):

- **Node per task:**
  - `completed` — filled `--success` disc with a check mark.
  - `in_progress` — `--accent` ring with a soft accent center; carries the
    accent glow in **dark only** (`--node-ring-glow`; `none` in light, per P4 —
    glow reads dirty on white).
  - `pending` — hollow disc with a faint `--muted`/track-colored border.
- **Connecting spine** — a 1.5px vertical line between consecutive nodes, colored
  by a per-theme `--spine` value.
- **Task text** — `--foreground`; `completed` rows are `--muted` + strikethrough
  (kept from the current design).
- **Description** — shown on a HeroUI `Tooltip` per row (kept from the current
  design).

### 6.3 Card chrome

Glass material consistent with the other expanded inline cards:
`--aurora-glass-fill` + `1px solid --aurora-glass-border` +
`--aurora-glass-highlight` + `--aurora-glass-shadow`; radius ~14px. A hairline
`--aurora-glass-border` divider separates the collapsed header from the expanded
body.

### 6.4 New Aurora Glass tokens

Add to `src/aurora-glass.css` (both themes, with purpose comments, per §3.2 of
the design language — never inline raw values in the component):

- `--aurora-todo-spine` — the timeline connector line color.
- `--aurora-todo-node-glow` — the in_progress node glow (`none` in light, accent
  glow in dark).

(The track-empty color, `--success`, and `--accent` already exist as
HeroUI/Aurora tokens and are reused directly.) Exact token names finalized
during implementation; the principle is that any value not already tokenized is
added to `aurora-glass.css` for both themes rather than hard-coded.

## 7. Motion (P3 — event-driven only)

The resting card is fully static. The only motion:

- **Caret rotation** on expand/collapse (~150ms), event-driven, settles.
- **Progress fill** advances when `value` changes — a one-shot width transition
  (~200ms) to the new ratio, then still. HeroUI's `ProgressBar` fill transition
  covers this; do not add any looping/indeterminate animation.
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
- **`TodoCardView`** — render states: collapsed shows correct `N/M` and current
  subject; expanded shows correct node states; completed rows struck through;
  no-in-progress hides the current-subject text.
- **Browser validation** (frontend CLAUDE.md) — verify in a real browser in both
  light and dark, including a card rendered inside a subagent's expanded stream.
  Include screenshots in the PR.

```

```
