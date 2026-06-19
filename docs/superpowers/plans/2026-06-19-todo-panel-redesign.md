# Inline TodoCard Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Post-implementation note:** the collapsed header shipped **without** the
> HeroUI `ProgressBar` shown in Task 6 below. During review the progress track
> was dropped as redundant with the `N/M` count, and the card was made
> chromeless-when-collapsed / glass-on-expand to match `ToolExecutionCard`. The
> `ProgressBar` code in Task 6 reflects an earlier iteration; the spec
> (`docs/superpowers/specs/2026-06-19-todo-panel-redesign-design.md` §6.1/§6.3)
> is the source of truth for the final header.

**Goal:** Replace the floating composer-anchored `TodoPanel` with an inline "Plan" card that lives in the message stream, coalesced by adjacency, working identically in subagents and surviving reload.

**Architecture:** `todo-update` SSE events (already persisted + per-bus) feed the existing `useMessages` reducer, which appends/replaces a `todo` stream item by adjacency. A new render-item type dispatches to a new `TodoCard` (chat-specific), which composes HeroUI `Disclosure` + `ProgressBar` and a new generic `StatusTimeline` (business-agnostic, in `components/`). No backend or SSE changes.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, HeroUI v3 (`@heroui/react`), CSS Modules, lucide-react.

**Reference:** Spec at `docs/superpowers/specs/2026-06-19-todo-panel-redesign-design.md`. Approved mockup at `.superset/mockups/todo-card-mock.html`.

**Conventions (from CLAUDE.md):**

- Run tests with `bun run test` from repo root, or `cd apps/frontend && bunx vitest run <path>` for a single file. NEVER `bun test`.
- Use Node APIs only; no `any`; early-return style; CSS Modules (no Tailwind in our components); one React component per file; MVVM; named exports only; import the folder `index.js`.
- All `--aurora-*` and HeroUI tokens consumed via `var(--…)`; never hard-code raw values.

---

## File Structure

**Create:**

- `apps/frontend/src/components/StatusTimeline/index.ts` — export entry
- `apps/frontend/src/components/StatusTimeline/StatusTimeline.tsx` — generic vertical-spine timeline (stateless)
- `apps/frontend/src/components/StatusTimeline/styles.module.css` — node + spine styles
- `apps/frontend/src/components/StatusTimeline/StatusTimeline.test.tsx` — node-state tests
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/TodoCard/index.ts`
- `.../TodoCard/TodoCard.tsx` — thin container (maps items → view props)
- `.../TodoCard/TodoCardView.tsx` — stateless view (Disclosure + ProgressBar + StatusTimeline)
- `.../TodoCard/styles.module.css`
- `.../TodoCard/TodoCardView.test.tsx`

**Modify:**

- `.../StreamingMessageDisplay/types.ts` — add `TodoContent` to `MessageContent`
- `.../StreamingMessageDisplay/hooks/useMessages.ts` — add `applyTodoUpdate` + subscription
- `.../StreamingMessageDisplay/hooks/useMessages.test.ts` — reducer tests
- `.../MessageList/hooks/useMessageList.ts` — add `TodoRenderItem` + transform case
- `.../MessageList/hooks/useMessageList.test.ts` — transform tests
- `.../MessageList/components/RenderItem/RenderItem.tsx` — add `case 'todo'`
- `apps/frontend/src/modules/chat-session/components/BottomBar/BottomBar.tsx` — drop TodoPanel
- `apps/frontend/src/modules/chat-session/components/BottomBar/styles.module.css` — drop overlay wrapper
- `apps/frontend/src/modules/chat-session/index.ts` — drop `useTodoItems` export

**Delete:**

- `.../components/TodoPanel/` (whole folder: TodoPanel.tsx, TodoPanelView.tsx, styles.module.css, index.ts)
- `apps/frontend/src/modules/chat-session/hooks/useTodoItems.ts`

---

## Task 1: Add `todo` content variant to the message model

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`

- [ ] **Step 1: Add the `TodoContent` interface and add it to the `MessageContent` union**

In `types.ts`, find the import of `@omnicraft/sse-events` types near the top and ensure `SseTodoItem` is imported. The file already imports from that package (e.g. `SseTextDeltaEvent`); add `SseTodoItem` to that import list.

Then add this interface next to `ThinkingContent` / `SubagentContent` (around line 33):

```ts
/** Todo list snapshot rendered as an inline "Plan" card. */
export interface TodoContent {
  type: 'todo';
  items: readonly SseTodoItem[];
}
```

Add `TodoContent` to the `MessageContent` union (around line 53):

```ts
export type MessageContent =
  | TextContent
  | ThinkingContent
  | SseToolExecuteStartEvent
  | SseToolExecuteEndEvent
  | SubagentContent
  | TodoContent
  | SseContextCompactionStartEvent
  | SseContextCompactionEndEvent
  | SseContextCompactionErrorEvent;
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS (no errors). If `SseTodoItem` is reported unused, that's fine for now — it's consumed in Task 2.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts
git commit -m "feat(frontend): add todo content variant to message model"
```

---

## Task 2: Add the `applyTodoUpdate` reducer (adjacency coalescing)

**Files:**

- Modify: `.../StreamingMessageDisplay/hooks/useMessages.ts`
- Test: `.../StreamingMessageDisplay/hooks/useMessages.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `useMessages.test.ts`:

```ts
import {applyTodoUpdate} from './useMessages.js';
import type {SseTodoItem} from '@omnicraft/sse-events';

const todoItems = (statuses: SseTodoItem['status'][]): SseTodoItem[] =>
  statuses.map((status, index) => ({
    index,
    subject: `Task ${index}`,
    description: `Desc ${index}`,
    status,
  }));

describe('applyTodoUpdate', () => {
  it('appends a new todo card when the list is empty', () => {
    const items = todoItems(['in_progress', 'pending']);
    const result = applyTodoUpdate([], items);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items});
  });

  it('replaces in place when the last message is a todo card', () => {
    const first = todoItems(['in_progress', 'pending']);
    const afterFirst = applyTodoUpdate([], first);
    const second = todoItems(['completed', 'in_progress']);
    const result = applyTodoUpdate(afterFirst, second);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items: second});
  });

  it('appends a new todo card when a non-todo message is last', () => {
    const prev = applyTodoUpdate([], todoItems(['completed']));
    const withWork: typeof prev = [
      ...prev,
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'Did some work'},
      },
    ];
    const next = todoItems(['completed', 'in_progress']);
    const result = applyTodoUpdate(withWork, next);
    expect(result).toHaveLength(3);
    expect(result[2].content).toEqual({type: 'todo', items: next});
  });

  it('strips a trailing empty assistant placeholder before appending', () => {
    const withPlaceholder = [
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ];
    const items = todoItems(['pending']);
    const result = applyTodoUpdate(withPlaceholder, items);
    expect(result).toHaveLength(1);
    expect(result[0].content).toEqual({type: 'todo', items});
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts`
Expected: FAIL with "applyTodoUpdate is not a function" / import error.

- [ ] **Step 3: Implement the reducer**

In `useMessages.ts`, add the `SseTodoItem` type to the existing `@omnicraft/sse-events` import. Then add this exported function next to `pushCompactionEvent` (above the `useMessages` hook):

```ts
export function applyTodoUpdate(
  prev: ChatMessage[],
  items: readonly SseTodoItem[],
): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last && last.content.type === 'todo') {
    return [...prev.slice(0, -1), {...last, content: {type: 'todo', items}}];
  }
  return [
    ...removeTrailingAssistantMessageIfEmpty(prev),
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'todo', items},
    },
  ];
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts`
Expected: PASS (all `applyTodoUpdate` tests green).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts
git commit -m "feat(frontend): add adjacency-coalescing todo reducer"
```

---

## Task 3: Subscribe the reducer to `todo-update` in `useMessages`

**Files:**

- Modify: `.../StreamingMessageDisplay/hooks/useMessages.ts`

- [ ] **Step 1: Add the handler and subscription**

In the `useMessages` hook's `useEffect`, add a handler alongside the others (e.g. after `onCompactionError`):

```ts
const onTodoUpdate = (data: SseTodoUpdateEvent) => {
  setMessages((prev) => applyTodoUpdate(prev, data.items));
};
```

Add `SseTodoUpdateEvent` to the `@omnicraft/sse-events` import.

Register it with the bus (next to the other `eventBus.on(...)` calls):

```ts
eventBus.on('todo-update', onTodoUpdate);
```

And unregister it in the cleanup return (next to the other `eventBus.off(...)` calls):

```ts
eventBus.off('todo-update', onTodoUpdate);
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS. (`'todo-update'` is already in `ChatEventMap` at `types.ts:110`, so the bus accepts it.)

- [ ] **Step 3: Run the existing reducer tests to confirm no regression**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts
git commit -m "feat(frontend): subscribe useMessages to todo-update"
```

---

## Task 4: Add `TodoRenderItem` to the render-item transform

**Files:**

- Modify: `.../MessageList/hooks/useMessageList.ts`
- Test: `.../MessageList/hooks/useMessageList.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `useMessageList.test.ts`:

```ts
import type {SseTodoItem} from '@omnicraft/sse-events';

describe('transformMessages — todo', () => {
  const items: SseTodoItem[] = [
    {index: 0, subject: 'A', description: 'da', status: 'completed'},
    {index: 1, subject: 'B', description: 'db', status: 'in_progress'},
  ];

  it('converts a todo message to a TodoRenderItem', () => {
    const result = transformMessages([
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'todo', items},
      },
    ]);
    expect(result).toEqual([{type: 'todo', items}]);
  });

  it('skips a todo message with an empty item list', () => {
    const result = transformMessages([
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'todo', items: []},
      },
    ]);
    expect(result).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`
Expected: FAIL (todo case not handled; result is `[]` for the first test or a type error).

- [ ] **Step 3: Add the render-item type and transform case**

In `useMessageList.ts`:

Add `SseTodoItem` to the `@omnicraft/sse-events` import.

Add the interface next to `ThinkingRenderItem` (around line 73):

```ts
export interface TodoRenderItem {
  type: 'todo';
  items: readonly SseTodoItem[];
}
```

Add `TodoRenderItem` to the `MessageRenderItem` union (around line 118):

```ts
export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem
  | ThinkingRenderItem
  | SubagentRenderItem
  | TodoRenderItem
  | ContextCompactionRenderItem;
```

Add the case in the `switch (content.type)` block (next to `case 'subagent'`):

```ts
case 'todo': {
  if (content.items.length === 0) break;
  items.push({type: 'todo', items: content.items});
  break;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.test.ts
git commit -m "feat(frontend): add TodoRenderItem to message transform"
```

---

## Task 5: Build the generic `StatusTimeline` component

**Files:**

- Create: `apps/frontend/src/components/StatusTimeline/StatusTimeline.tsx`
- Create: `apps/frontend/src/components/StatusTimeline/styles.module.css`
- Create: `apps/frontend/src/components/StatusTimeline/index.ts`
- Test: `apps/frontend/src/components/StatusTimeline/StatusTimeline.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `StatusTimeline.test.tsx`:

```tsx
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {StatusTimeline} from './StatusTimeline.js';

afterEach(cleanup);

describe('StatusTimeline', () => {
  it('renders one node per item with its status as data-status', () => {
    render(
      <StatusTimeline
        items={[
          {status: 'done', content: 'First'},
          {status: 'in-progress', content: 'Second'},
          {status: 'pending', content: 'Third'},
        ]}
      />,
    );
    const nodes = screen.getAllByTestId('status-node');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toHaveAttribute('data-status', 'done');
    expect(nodes[1]).toHaveAttribute('data-status', 'in-progress');
    expect(nodes[2]).toHaveAttribute('data-status', 'pending');
  });

  it('renders caller-supplied row content', () => {
    render(
      <StatusTimeline
        items={[{status: 'pending', content: <span>Hello row</span>}]}
      />,
    );
    expect(screen.getByText('Hello row')).toBeInTheDocument();
  });

  it('renders nothing when there are no items', () => {
    const {container} = render(<StatusTimeline items={[]} />);
    expect(
      container.querySelectorAll('[data-testid="status-node"]'),
    ).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bunx vitest run src/components/StatusTimeline/StatusTimeline.test.tsx`
Expected: FAIL with module-not-found for `./StatusTimeline.js`.

- [ ] **Step 3: Create the styles**

Create `styles.module.css`:

```css
.timeline {
  display: flex;
  flex-direction: column;
}

.row {
  position: relative;
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 5px 0;
}

.nodeCol {
  position: relative;
  flex-shrink: 0;
  width: 14px;
  display: flex;
  justify-content: center;
}

/* connecting spine between consecutive nodes */
.row:not(:last-child) .nodeCol::after {
  content: '';
  position: absolute;
  top: 16px;
  bottom: -10px;
  left: 50%;
  width: 1.5px;
  transform: translateX(-50%);
  background: var(--border);
}

.node {
  position: relative;
  z-index: 1;
  width: 12px;
  height: 12px;
  margin-top: 2px;
  border-radius: 50%;
  flex-shrink: 0;
}

.node[data-status='pending'] {
  border: 1.5px solid var(--border);
  background: transparent;
}

.node[data-status='in-progress'] {
  border: 2px solid var(--accent);
  background: color-mix(in oklab, var(--accent) 25%, transparent);
  box-shadow: var(--aurora-active-bar-glow);
}

.node[data-status='done'] {
  border: 1.5px solid var(--success);
  background: var(--success);
  display: flex;
  align-items: center;
  justify-content: center;
}

.check {
  color: var(--success-foreground);
}

.rowContent {
  font-size: 12.5px;
  line-height: 1.55;
  color: var(--foreground);
  padding-top: 1px;
  min-width: 0;
}
```

- [ ] **Step 4: Create the component**

Create `StatusTimeline.tsx`:

```tsx
import {Check} from 'lucide-react';
import type {ReactNode} from 'react';

import styles from './styles.module.css';

export type StatusTimelineStatus = 'pending' | 'in-progress' | 'done';

export interface StatusTimelineItem {
  status: StatusTimelineStatus;
  content: ReactNode;
}

interface StatusTimelineProps {
  items: readonly StatusTimelineItem[];
}

const CHECK_SIZE = 8;

export function StatusTimeline({items}: StatusTimelineProps) {
  return (
    <div className={styles.timeline}>
      {items.map((item, index) => (
        <div className={styles.row} key={index}>
          <span className={styles.nodeCol}>
            <span
              className={styles.node}
              data-status={item.status}
              data-testid='status-node'
            >
              {item.status === 'done' && (
                <Check
                  className={styles.check}
                  size={CHECK_SIZE}
                  strokeWidth={3}
                />
              )}
            </span>
          </span>
          <span className={styles.rowContent}>{item.content}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Create the export entry**

Create `index.ts`:

```ts
export {StatusTimeline} from './StatusTimeline.js';
export type {
  StatusTimelineItem,
  StatusTimelineStatus,
} from './StatusTimeline.js';
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/frontend && bunx vitest run src/components/StatusTimeline/StatusTimeline.test.tsx`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/components/StatusTimeline
git commit -m "feat(frontend): add generic StatusTimeline component"
```

---

## Task 6: Build the `TodoCard` component

**Files:**

- Create: `.../MessageList/components/TodoCard/TodoCardView.tsx`
- Create: `.../MessageList/components/TodoCard/TodoCard.tsx`
- Create: `.../MessageList/components/TodoCard/styles.module.css`
- Create: `.../MessageList/components/TodoCard/index.ts`
- Test: `.../MessageList/components/TodoCard/TodoCardView.test.tsx`

The TodoCard base path is:
`apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/TodoCard/`

- [ ] **Step 1: Write the failing view test**

Create `TodoCardView.test.tsx`:

```tsx
import {cleanup, render, screen} from '@testing-library/react';
import type {SseTodoItem} from '@omnicraft/sse-events';
import {afterEach, describe, expect, it} from 'vitest';

import {TodoCardView} from './TodoCardView.js';

afterEach(cleanup);

const items: SseTodoItem[] = [
  {index: 0, subject: 'Read code', description: 'd0', status: 'completed'},
  {index: 1, subject: 'Trace events', description: 'd1', status: 'completed'},
  {index: 2, subject: 'Wire the bus', description: 'd2', status: 'in_progress'},
  {index: 3, subject: 'Restyle', description: 'd3', status: 'pending'},
];

describe('TodoCardView', () => {
  it('shows the completed/total count', () => {
    render(<TodoCardView items={items} />);
    expect(screen.getByText('2/4')).toBeInTheDocument();
  });

  it('shows the current in-progress subject in the header', () => {
    render(<TodoCardView items={items} />);
    expect(screen.getByText('Wire the bus')).toBeInTheDocument();
  });

  it('renders no current subject when nothing is in progress', () => {
    const noActive: SseTodoItem[] = items.map((i) =>
      i.status === 'in_progress' ? {...i, status: 'pending'} : i,
    );
    render(<TodoCardView items={noActive} />);
    expect(screen.queryByTestId('todo-current')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/TodoCard/TodoCardView.test.tsx`
Expected: FAIL with module-not-found for `./TodoCardView.js`.

- [ ] **Step 3: Create the styles**

Create `styles.module.css`:

```css
.card {
  border-radius: 14px;
  background: var(--aurora-glass-fill);
  border: 1px solid var(--aurora-glass-border);
  box-shadow: var(--aurora-glass-highlight), var(--aurora-glass-shadow);
}

.trigger {
  display: flex;
  align-items: center;
  gap: 11px;
  width: 100%;
  padding: 11px 14px;
  background: transparent;
  border: none;
  cursor: pointer;
  text-align: left;
  color: var(--foreground);
  font-family: var(--font-ui);
}

.progress {
  width: 84px;
  flex-shrink: 0;
}

.headLabel {
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}

.headCount {
  color: var(--muted);
  font-weight: 500;
}

.current {
  font-size: 12px;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}

.currentDivider {
  margin: 0 7px;
  opacity: 0.5;
}

.indicator {
  margin-left: auto;
  flex-shrink: 0;
  color: var(--muted);
}

.body {
  padding: 4px 14px 13px;
  border-top: 1px solid var(--aurora-glass-border);
}

.completed {
  color: var(--muted);
  text-decoration: line-through;
  text-decoration-color: color-mix(in oklab, var(--muted) 60%, transparent);
}
```

- [ ] **Step 4: Create the view**

Create `TodoCardView.tsx`:

```tsx
import {Disclosure, Label, ProgressBar, Tooltip} from '@heroui/react';
import type {SseTodoItem} from '@omnicraft/sse-events';

import {
  StatusTimeline,
  type StatusTimelineItem,
  type StatusTimelineStatus,
} from '@/components/StatusTimeline/index.js';

import styles from './styles.module.css';

interface TodoCardViewProps {
  items: readonly SseTodoItem[];
}

const STATUS_MAP = {
  pending: 'pending',
  in_progress: 'in-progress',
  completed: 'done',
} satisfies Record<SseTodoItem['status'], StatusTimelineStatus>;

export function TodoCardView({items}: TodoCardViewProps) {
  const total = items.length;
  const completed = items.filter((i) => i.status === 'completed').length;
  const current = items.find((i) => i.status === 'in_progress');
  const percent = total === 0 ? 0 : (completed / total) * 100;

  const timelineItems: StatusTimelineItem[] = items.map((item) => ({
    status: STATUS_MAP[item.status],
    content: (
      <Tooltip delay={300}>
        <Tooltip.Trigger>
          <span
            className={
              item.status === 'completed' ? styles.completed : undefined
            }
          >
            {item.subject}
          </span>
        </Tooltip.Trigger>
        <Tooltip.Content>{item.description}</Tooltip.Content>
      </Tooltip>
    ),
  }));

  return (
    <div className={styles.card}>
      <Disclosure>
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            <ProgressBar
              aria-label='Plan progress'
              className={styles.progress}
              color='accent'
              size='sm'
              value={percent}
            >
              <ProgressBar.Track>
                <ProgressBar.Fill />
              </ProgressBar.Track>
            </ProgressBar>
            <span className={styles.headLabel}>
              Plan{' '}
              <span className={styles.headCount}>
                · {completed}/{total}
              </span>
            </span>
            {current && (
              <span className={styles.current} data-testid='todo-current'>
                <span className={styles.currentDivider}>·</span>
                {current.subject}
              </span>
            )}
            <Disclosure.Indicator className={styles.indicator} />
          </Disclosure.Trigger>
        </Disclosure.Heading>
        <Disclosure.Content>
          <Disclosure.Body className={styles.body}>
            <StatusTimeline items={timelineItems} />
          </Disclosure.Body>
        </Disclosure.Content>
      </Disclosure>
    </div>
  );
}
```

- [ ] **Step 5: Create the container**

Create `TodoCard.tsx`:

```tsx
import type {SseTodoItem} from '@omnicraft/sse-events';

import {TodoCardView} from './TodoCardView.js';

interface TodoCardProps {
  items: readonly SseTodoItem[];
}

export function TodoCard({items}: TodoCardProps) {
  return <TodoCardView items={items} />;
}
```

- [ ] **Step 6: Create the export entry**

Create `index.ts`:

```ts
export {TodoCard} from './TodoCard.js';
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd apps/frontend && bunx vitest run src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/TodoCard/TodoCardView.test.tsx`
Expected: PASS. If HeroUI `ProgressBar` or `Tooltip` need a `ResizeObserver`, add the `ResizeObserverMock` pattern from `SubagentDisclosureView.test.tsx` to the test file's top.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/TodoCard
git commit -m "feat(frontend): add inline TodoCard view composing StatusTimeline"
```

---

## Task 7: Dispatch `todo` render items in `RenderItem`

**Files:**

- Modify: `.../MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Add the import and the case**

In `RenderItem.tsx`, add the import next to the other card imports:

```ts
import {TodoCard} from '../TodoCard/index.js';
```

Add this case in the `switch (item.type)` block (e.g. after the `subagent` case, before `default`/compaction):

```tsx
case 'todo':
  return (
    <div className={styles.assistantMessage}>
      <TodoCard items={item.items} />
    </div>
  );
```

- [ ] **Step 2: Typecheck**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS (the `MessageRenderItem` union now includes `todo`, so the switch is exhaustive).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "feat(frontend): dispatch todo render items to TodoCard"
```

---

## Task 8: Remove the old `TodoPanel` and `useTodoItems`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/BottomBar/BottomBar.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/BottomBar/styles.module.css`
- Modify: `apps/frontend/src/modules/chat-session/index.ts`
- Delete: `apps/frontend/src/modules/chat-session/components/TodoPanel/` (whole folder)
- Delete: `apps/frontend/src/modules/chat-session/hooks/useTodoItems.ts`

- [ ] **Step 1: Simplify `BottomBar.tsx`**

Replace the entire contents of `BottomBar.tsx` with (drop the TodoPanel + wrapper, keep InfoBar):

```tsx
import {InfoBar} from '../InfoBar/index.js';
import styles from './styles.module.css';

export function BottomBar() {
  return (
    <div className={styles.container}>
      <InfoBar />
    </div>
  );
}
```

- [ ] **Step 2: Simplify `BottomBar/styles.module.css`**

Replace the entire contents with (drop the absolute `todoPanelWrapper`; the container no longer needs to be a positioning context):

```css
.container {
  display: flex;
  flex-direction: column;
}
```

- [ ] **Step 3: Remove the `useTodoItems` export**

In `apps/frontend/src/modules/chat-session/index.ts`, delete this line:

```ts
export {useTodoItems} from './hooks/useTodoItems.js';
```

- [ ] **Step 4: Delete the dead files**

```bash
git rm -r apps/frontend/src/modules/chat-session/components/TodoPanel
git rm apps/frontend/src/modules/chat-session/hooks/useTodoItems.ts
```

- [ ] **Step 5: Typecheck and confirm no dangling references**

Run: `cd apps/frontend && bunx tsc --noEmit`
Expected: PASS.

Run: `cd apps/frontend && grep -rn "TodoPanel\|useTodoItems" src`
Expected: no output (all references gone).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/modules/chat-session
git commit -m "refactor(frontend): remove floating TodoPanel and useTodoItems"
```

---

## Task 9: Full verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full frontend test suite**

Run: `bun run test` (from repo root)
Expected: PASS, including the new `applyTodoUpdate`, `transformMessages — todo`, `StatusTimeline`, and `TodoCardView` tests.

- [ ] **Step 2: Typecheck and lint**

Run: `cd apps/frontend && bunx tsc --noEmit && bunx eslint src`
Expected: PASS (no errors).

- [ ] **Step 3: Browser validation in both themes**

Start the dev server from repo root: `bun dev` (per OmniCraft dev-server convention). Open the app, start a session, and have the agent produce a todo plan (e.g. ask for a multi-step task). Verify:

- The Plan card appears inline in the stream, collapsed by default, scrolling with content (does NOT float over chat).
- Progress bar fill + `Plan · N/M` + current task render correctly.
- Expanding shows the StatusTimeline (done = green check, in-progress = accent ring, pending = hollow), completed rows struck through, tooltips on hover.
- A second todo-update after intervening work creates a SECOND card (adjacency rule); rapid consecutive updates collapse into one.
- Reload the session → the cards reconstruct in timeline order.
- Dispatch a subagent that uses todos → its Plan card renders inline inside the subagent's expanded body.
- Toggle light/dark → both first-class; node glow present in dark, absent in light.

Capture screenshots of light and dark for the PR (required by frontend CLAUDE.md).

- [ ] **Step 4: Final commit (if any verification fixups were needed)**

```bash
git add -A
git commit -m "test(frontend): verify inline TodoCard in both themes"
```
