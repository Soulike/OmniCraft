# Coding Task List Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the coding-agent task list (the Coding page's left "Workspaces" sidebar) into a scannable, composed panel — two-line task rows with recency, quiet workspace headers, and auto-expand — adding an optional `updatedAt` to session metadata.

**Architecture:** Backend adds a cheap optional `updatedAt` (the snapshot mtime the list already computes) to `SessionMetadata`. The coding list gets a **new** `TaskListItem` row component (the shared `SessionItem` is left untouched, so the Chat page is unaffected). `WorkspaceGroup` gets a quiet `Disclosure.Trigger` header and renders `TaskListItem` inside the existing `ListBox`. The expansion hook gains a fallback so the panel opens with the most-recent group expanded.

**Tech Stack:** pnpm monorepo · Node.js + Koa (backend) · React 19 + Vite + HeroUI v3 + CSS Modules (frontend) · Zod (`@omnicraft/api-schema`) · Vitest.

**Spec:** `docs/superpowers/specs/2026-07-21-coding-task-list-redesign-design.md` · **Issue** #346 · **Follow-up** #348 (running/idle indicator — out of scope here).

## Global Constraints

_Every task's requirements implicitly include this section._

- **Package manager is pnpm.** Run package scripts via `pnpm --filter <pkg> <script>`; run a single test file via `pnpm --filter <pkg> exec vitest run <relative/path>`.
- **No `any`.** Use `unknown` + narrowing.
- **No default exports** (frontend and backend). Frontend non-page components export via `index.ts` as `export {X} from './X.js'`.
- **Frontend MVVM:** one React component per file; hooks are view models, one concern each; the `*.tsx` container composes hooks and holds no state; the `*View.tsx` is a stateless view driven by props. A component must **not** set properties that dictate its placement in the parent (`margin`, `align-self`, `flex` on its own root beyond filling); the parent controls layout.
- **Frontend styling:** CSS Modules only; **no Tailwind utility classes in our components**; use HeroUI (`@heroui/react`) components directly; style from **HeroUI semantic tokens** only (`var(--surface)`, `var(--border)`, `var(--foreground)`, `var(--muted)`, `var(--accent)`, `var(--accent-soft)`, `var(--radius-lg)`, …). Do **not** redefine tokens, reach into HeroUI internals (`:global`), or paint bespoke material.
- **Motion:** event-driven only (hover/expand), never ambient/looping; honor `prefers-reduced-motion`.
- **Both light and dark themes are first-class** — verify every UI change in both.
- **Do NOT modify** `apps/frontend/src/modules/chat-session/.../SessionItem/` (shared with the Chat page).
- **Backend conventions:** kebab-case filenames; relative imports use `.js`; `@/*` alias across modules; no `console` (use `logger` from `@/logger.js`); Conventional Commits.
- **File naming:** dash-case folders/files; React component files/folders UpperCamelCase; hook files camelCase starting `use`; tests `<name>.test.ts(x)`.
- **Commits:** Conventional Commits; end every commit message with the trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. A pre-commit hook runs prettier/eslint on staged files — do not re-verify compilation/tests just because it reformatted.

---

## Task 1: Backend — expose `updatedAt` on session metadata

**Files:**

- Modify: `packages/api-schema/src/chat/schema.ts` (add optional field to `sessionMetadataSchema`)
- Test: `packages/api-schema/src/chat/schema.test.ts` (add parse cases)
- Modify: `apps/backend/src/models/agent-store/main-agent-store.ts:96-109` (inject `updatedAt`)
- Modify: `apps/backend/src/models/agent-store/coding-agent-store.ts:96-107` (inject `updatedAt` — identical edit)
- Test: `apps/backend/src/models/agent-store/main-agent-store.test.ts` (add mtime assertion; update exact `toEqual` assertions)

**Interfaces:**

- Produces: `SessionMetadata` now has `updatedAt?: number` (epoch ms). Consumed by Task 3 (`TaskListItem`) and Task 4 (`WorkspaceGroup` passes `session.updatedAt`).

- [ ] **Step 1: Write the failing schema test**

Add to `packages/api-schema/src/chat/schema.test.ts` — extend the imports and add a `describe`:

```ts
import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  sessionMetadataSchema,
} from './schema.js';

// valid UUID (sessionIdSchema = z.uuid())
const ID = '11111111-1111-4111-8111-111111111111';

describe('sessionMetadataSchema', () => {
  it('preserves updatedAt when present', () => {
    const parsed = sessionMetadataSchema.parse({
      id: ID,
      title: 'T',
      updatedAt: 123,
    });
    expect(parsed.updatedAt).toBe(123);
  });

  it('parses without updatedAt (backward compatible)', () => {
    const parsed = sessionMetadataSchema.parse({id: ID, title: 'T'});
    expect(parsed.updatedAt).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/api-schema exec vitest run src/chat/schema.test.ts`
Expected: FAIL — `preserves updatedAt` gets `undefined` (unknown key stripped by `z.object`).

- [ ] **Step 3: Add the field to the schema**

In `packages/api-schema/src/chat/schema.ts`, inside `sessionMetadataSchema` (currently `{id, title, workingDirectory}`), add:

```ts
export const sessionMetadataSchema = z.object({
  id: sessionIdSchema,
  title: z.string(),
  workingDirectory: z.string().optional(),
  updatedAt: z.number().optional(), // epoch ms; last-activity (snapshot mtime, may be fractional)
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/api-schema exec vitest run src/chat/schema.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing store test**

Add this test inside the `describe('listSessionMetadata', …)` block in `apps/backend/src/models/agent-store/main-agent-store.test.ts`:

```ts
it('includes updatedAt equal to the snapshot mtime', async () => {
  const store = MainAgentStore.create(sessionsDir);
  const id = crypto.randomUUID();
  await writeSnapshot(sessionsDir, id, {id, title: 'Timed'});
  const when = new Date('2026-01-02T03:04:05.000Z');
  await utimes(path.join(sessionsDir, id, 'snapshot.json'), when, when);

  const result = await store.listSessionMetadata(0, 100);
  expect(result.sessions[0].updatedAt).toBe(when.getTime());
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/models/agent-store/main-agent-store.test.ts -t "updatedAt"`
Expected: FAIL — `updatedAt` is `undefined`.

- [ ] **Step 7: Inject `updatedAt` in both stores**

In `apps/backend/src/models/agent-store/main-agent-store.ts`, change the Phase-2 map to destructure `mtime` and spread it onto the parsed metadata:

```ts
const results = await Promise.all(
  page.map(async ({id, mtime}): Promise<SessionMetadata | null> => {
    try {
      const content = await this.readSessionMetadataFile(id);
      const json: unknown = JSON.parse(content);
      return {...sessionMetadataSchema.parse(json), updatedAt: mtime};
    } catch (e) {
      logger.warn({err: e, sessionId: id}, 'Skipping unreadable session');
      return null;
    }
  }),
);
```

Apply the **identical** change to `apps/backend/src/models/agent-store/coding-agent-store.ts` (same `page.map` block). (Both stores duplicate this logic by design — the spec explicitly avoids extracting it in this change. The coding path is covered end-to-end by the browser verification in Task 6; the shared logic is unit-tested here via the main store.)

- [ ] **Step 8: Update the existing exact-match assertions**

Injecting `updatedAt` changes the returned object shape, so every exact `toEqual` in `main-agent-store.test.ts` must include it. Update each listed session object to add `updatedAt: expect.any(Number)`:

- `returns metadata from valid snapshots` → `sessions: [{id, title: 'Title A', updatedAt: expect.any(Number)}]`
- `sorts by file mtime descending …` → both entries get `updatedAt: expect.any(Number)`
- `skips directories with missing snapshot.json` → `[{id: validId, title: 'Valid', updatedAt: expect.any(Number)}]`
- `skips snapshots with invalid JSON` → `[{id: goodId, title: 'Good', updatedAt: expect.any(Number)}]`
- `skips snapshots missing required fields` → `[{id: completeId, title: 'Complete', updatedAt: expect.any(Number)}]`
- `paginates with offset and limit` → each of the 5 expected objects gets `updatedAt: expect.any(Number)`
- `reads from metadata.json when present` → `[{id, title: 'Metadata Title', workingDirectory: '/tmp', updatedAt: expect.any(Number)}]`
- `falls back to snapshot.json when metadata.json is missing` → `[{id, title: 'Legacy Title', updatedAt: expect.any(Number)}]`

(`expect` is already imported. `expect.any(Number)` is the matcher.)

- [ ] **Step 9: Run the full store + schema tests**

Run:

```bash
pnpm --filter @omnicraft/backend exec vitest run src/models/agent-store/main-agent-store.test.ts
pnpm --filter @omnicraft/api-schema exec vitest run src/chat/schema.test.ts
```

Expected: PASS (all).

- [ ] **Step 10: Typecheck both packages**

Run:

```bash
pnpm --filter @omnicraft/api-schema typecheck
pnpm --filter @omnicraft/backend typecheck
```

Expected: no errors.

- [ ] **Step 11: Commit**

```bash
git add packages/api-schema/src/chat/schema.ts packages/api-schema/src/chat/schema.test.ts \
  apps/backend/src/models/agent-store/main-agent-store.ts \
  apps/backend/src/models/agent-store/coding-agent-store.ts \
  apps/backend/src/models/agent-store/main-agent-store.test.ts
git commit -m "$(cat <<'EOF'
feat(backend): expose updatedAt on session metadata

Thread the snapshot mtime the list already computes into SessionMetadata
as an optional updatedAt (epoch ms). Powers task-list recency (#346).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Frontend — `formatRelativeTime` helper

**Files:**

- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/helpers/format-relative-time.ts`
- Test: `.../TaskListItem/helpers/format-relative-time.test.ts`

**Interfaces:**

- Produces: `formatRelativeTime(updatedAtMs: number, nowMs: number): string`. Consumed by Task 3's container.

- [ ] **Step 1: Write the failing test**

Create `.../TaskListItem/helpers/format-relative-time.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {formatRelativeTime} from './format-relative-time.js';

const NOW = Date.parse('2026-07-21T12:00:00.000Z');
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatRelativeTime', () => {
  it('returns "just now" under a minute', () => {
    expect(formatRelativeTime(NOW - 30_000, NOW)).toBe('just now');
  });

  it('returns whole minutes', () => {
    expect(formatRelativeTime(NOW - 5 * MIN, NOW)).toBe('5m ago');
  });

  it('returns whole hours', () => {
    expect(formatRelativeTime(NOW - 2 * HOUR, NOW)).toBe('2h ago');
  });

  it('returns "yesterday" between 24 and 48 hours', () => {
    expect(formatRelativeTime(NOW - 30 * HOUR, NOW)).toBe('yesterday');
  });

  it('returns whole days under a week', () => {
    expect(formatRelativeTime(NOW - 3 * DAY, NOW)).toBe('3d ago');
  });

  it('returns a short "Mon D" date beyond a week', () => {
    expect(formatRelativeTime(NOW - 10 * DAY, NOW)).toMatch(
      /^[A-Z][a-z]{2} \d{1,2}$/,
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/helpers/format-relative-time.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the helper**

Create `.../TaskListItem/helpers/format-relative-time.ts`:

```ts
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/**
 * Formats `updatedAtMs` as a compact relative label against `nowMs`.
 * Buckets: just now (<1m) / {m}m ago / {h}h ago / yesterday (<48h) /
 * {d}d ago (<7d) / local "Mon D" date beyond a week. `now` is injected so
 * the function is pure and deterministic under test.
 */
export function formatRelativeTime(updatedAtMs: number, nowMs: number): string {
  const diff = nowMs - updatedAtMs;
  if (diff < MINUTE) {
    return 'just now';
  }
  if (diff < HOUR) {
    return `${Math.floor(diff / MINUTE)}m ago`;
  }
  if (diff < DAY) {
    return `${Math.floor(diff / HOUR)}h ago`;
  }
  if (diff < 2 * DAY) {
    return 'yesterday';
  }
  if (diff < 7 * DAY) {
    return `${Math.floor(diff / DAY)}d ago`;
  }
  const date = new Date(updatedAtMs);
  return `${MONTHS[date.getMonth()]} ${date.getDate()}`;
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/helpers/format-relative-time.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/helpers/
git commit -m "$(cat <<'EOF'
feat(frontend): add formatRelativeTime helper for task recency

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Frontend — `TaskListItem` component

**Files** (all under `apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/`):

- Create: `hooks/useTaskDeletion.ts`
- Test: `hooks/useTaskDeletion.test.ts`
- Create: `TaskListItem.tsx`
- Create: `TaskListItemView.tsx`
- Test: `TaskListItemView.test.tsx`
- Create: `styles.module.css`
- Create: `index.ts`

**Interfaces:**

- Consumes: `formatRelativeTime` (Task 2); `SessionMetadata.updatedAt` (Task 1).
- Produces: `TaskListItem` with props `{title: string; updatedAt?: number; isSelected: boolean; onDelete: () => Promise<void>}`. Consumed by Task 4.

- [ ] **Step 1: Write the failing hook test**

Create `hooks/useTaskDeletion.test.ts`:

```ts
import {act, renderHook, waitFor} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useTaskDeletion} from './useTaskDeletion.js';

describe('useTaskDeletion', () => {
  it('opens, runs onDelete, then closes', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const {result} = renderHook(() => useTaskDeletion(onDelete));

    act(() => {
      result.current.onDeleteOpenChange(true);
    });
    expect(result.current.isDeleteOpen).toBe(true);

    act(() => {
      result.current.onConfirmDelete();
    });
    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(result.current.isDeleteOpen).toBe(false));
    expect(result.current.isDeleting).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/hooks/useTaskDeletion.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the hook**

Create `hooks/useTaskDeletion.ts`:

```ts
import {useCallback, useState} from 'react';

interface UseTaskDeletionResult {
  readonly isDeleteOpen: boolean;
  readonly isDeleting: boolean;
  readonly onDeleteOpenChange: (open: boolean) => void;
  readonly onConfirmDelete: () => void;
}

/** Delete-confirmation state for a task row: popover open + in-flight guard. */
export function useTaskDeletion(
  onDelete: () => Promise<void>,
): UseTaskDeletionResult {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onConfirmDelete = useCallback(() => {
    setIsDeleting(true);
    void (async () => {
      try {
        await onDelete();
      } finally {
        setIsDeleting(false);
        setIsDeleteOpen(false);
      }
    })();
  }, [onDelete]);

  return {
    isDeleteOpen,
    isDeleting,
    onDeleteOpenChange: setIsDeleteOpen,
    onConfirmDelete,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/hooks/useTaskDeletion.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing view test**

Create `TaskListItemView.test.tsx`:

```tsx
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {TaskListItemView} from './TaskListItemView.js';

afterEach(() => {
  cleanup();
});

const baseProps = {
  title: 'Fix the thing',
  timeLabel: '2h ago' as string | null,
  isSelected: false,
  isDeleteOpen: false,
  onDeleteOpenChange: () => undefined,
  onConfirmDelete: () => undefined,
  isDeleting: false,
};

describe('TaskListItemView', () => {
  it('renders the title and time label', () => {
    render(<TaskListItemView {...baseProps} />);
    expect(screen.getByText('Fix the thing')).toBeInTheDocument();
    expect(screen.getByText('2h ago')).toBeInTheDocument();
  });

  it('omits the meta line when timeLabel is null', () => {
    render(<TaskListItemView {...baseProps} timeLabel={null} />);
    expect(screen.getByText('Fix the thing')).toBeInTheDocument();
    expect(screen.queryByText('2h ago')).not.toBeInTheDocument();
  });

  it('exposes a delete button', () => {
    render(<TaskListItemView {...baseProps} />);
    expect(
      screen.getByRole('button', {name: 'Delete task'}),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/TaskListItemView.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 7: Create the styles**

Create `styles.module.css`:

```css
.item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  min-width: 0;
  padding: 7px 9px;
  border-radius: var(--radius-lg);
}

.item:not([data-selected='true']):hover {
  background: color-mix(in oklab, var(--foreground) 5%, transparent);
}

.item[data-selected='true'] {
  background: var(--accent-soft);
  box-shadow: inset 2px 0 0 var(--accent);
}

/* Leading status column. Idle bullet in v1; #348 fills it accent for running. */
.dot {
  flex-shrink: 0;
  width: 8px;
  height: 8px;
  margin-top: 5px;
  border-radius: 50%;
  border: 1.5px solid var(--muted);
  background: transparent;
  opacity: 0.55;
}

.content {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.title {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  font-weight: 500;
  line-height: 1.35;
  color: var(--foreground);
}

.item[data-selected='true'] .title {
  font-weight: 600;
}

.meta {
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.7rem;
  color: var(--muted);
}

.actions {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  opacity: 0;
  transition: opacity 150ms ease;
}

.item:hover .actions,
.item:focus-within .actions {
  opacity: 1;
}

.popoverBody {
  margin-top: 8px;
  font-size: 0.85rem;
  color: var(--muted);
}

.popoverActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}

@media (prefers-reduced-motion: reduce) {
  .actions {
    transition: none;
  }
}
```

- [ ] **Step 8: Create the view**

Create `TaskListItemView.tsx`:

```tsx
import {Button, Popover} from '@heroui/react';
import {Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface TaskListItemViewProps {
  title: string;
  timeLabel: string | null;
  isSelected: boolean;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function TaskListItemView({
  title,
  timeLabel,
  isSelected,
  isDeleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
  isDeleting,
}: TaskListItemViewProps) {
  return (
    <div
      className={styles.item}
      data-selected={isSelected ? 'true' : undefined}
    >
      <span aria-hidden='true' className={styles.dot} />
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
        {timeLabel !== null && <span className={styles.meta}>{timeLabel}</span>}
      </div>
      <div className={styles.actions}>
        <Popover isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
          <Popover.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Delete task'
            >
              <Trash2 size={14} />
            </Button>
          </Popover.Trigger>
          <Popover.Content placement='right'>
            <Popover.Dialog>
              <Popover.Heading>Delete task?</Popover.Heading>
              <p className={styles.popoverBody}>This cannot be undone.</p>
              <div className={styles.popoverActions}>
                <Button
                  size='sm'
                  variant='ghost'
                  onPress={() => {
                    onDeleteOpenChange(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size='sm'
                  variant='danger'
                  isDisabled={isDeleting}
                  onPress={onConfirmDelete}
                >
                  Delete
                </Button>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Run the view test to verify it passes**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/TaskListItemView.test.tsx`
Expected: PASS.

- [ ] **Step 10: Create the container**

Create `TaskListItem.tsx`:

```tsx
import {formatRelativeTime} from './helpers/format-relative-time.js';
import {useTaskDeletion} from './hooks/useTaskDeletion.js';
import {TaskListItemView} from './TaskListItemView.js';

interface TaskListItemProps {
  title: string;
  updatedAt?: number;
  isSelected: boolean;
  onDelete: () => Promise<void>;
}

export function TaskListItem({
  title,
  updatedAt,
  isSelected,
  onDelete,
}: TaskListItemProps) {
  const {isDeleteOpen, isDeleting, onDeleteOpenChange, onConfirmDelete} =
    useTaskDeletion(onDelete);
  const timeLabel =
    updatedAt === undefined ? null : formatRelativeTime(updatedAt, Date.now());

  return (
    <TaskListItemView
      title={title}
      timeLabel={timeLabel}
      isSelected={isSelected}
      isDeleteOpen={isDeleteOpen}
      onDeleteOpenChange={onDeleteOpenChange}
      onConfirmDelete={onConfirmDelete}
      isDeleting={isDeleting}
    />
  );
}
```

- [ ] **Step 11: Create the barrel**

Create `index.ts`:

```ts
export {TaskListItem} from './TaskListItem.js';
```

- [ ] **Step 12: Run the whole TaskListItem folder + typecheck**

Run:

```bash
pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/
pnpm --filter @omnicraft/frontend typecheck
```

Expected: PASS; no type errors.

- [ ] **Step 13: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/
git commit -m "$(cat <<'EOF'
feat(frontend): add TaskListItem row for the coding task list

Two-line row (title + recency), reserved leading status-dot slot, and its
own delete-confirm popover. Keeps the shared SessionItem untouched.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Frontend — quiet `WorkspaceGroup` header + render `TaskListItem`

**Files:**

- Modify: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/WorkspaceGroupView.tsx` (full rewrite of the view below)
- Modify: `.../WorkspaceGroup/styles.module.css` (full rewrite below)
- Test: `.../WorkspaceGroup/WorkspaceGroupView.test.tsx` (update count + empty-text assertions)

**Interfaces:**

- Consumes: `TaskListItem` (Task 3); `session.updatedAt` (Task 1). Props of `WorkspaceGroupView` are unchanged.

- [ ] **Step 1: Update the failing test**

In `.../WorkspaceGroup/WorkspaceGroupView.test.tsx`, change the count assertion from `·1` to `1`, and the empty-hint text to the new copy:

```tsx
expect(screen.getByText('proj')).toBeInTheDocument();
expect(screen.getByText('1')).toBeInTheDocument();
expect(
  screen.getByRole('button', {name: 'New task in proj'}),
).toBeInTheDocument();
```

and in the Ungrouped test:

```tsx
expect(screen.getByText('Ungrouped')).toBeInTheDocument();
expect(screen.getByText('No tasks yet')).toBeInTheDocument();
expect(
  screen.queryByRole('button', {name: /New task/}),
).not.toBeInTheDocument();
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/WorkspaceGroupView.test.tsx`
Expected: FAIL — `·1` / `No sessions yet` no longer present (old view still renders them).

- [ ] **Step 3: Rewrite the view**

Replace the contents of `WorkspaceGroupView.tsx` with:

```tsx
import type {Selection} from '@heroui/react';
import {Button, Chip, Disclosure, ListBox, Tooltip} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Folder, Plus} from 'lucide-react';
import {useMemo} from 'react';

import {basename} from '@/helpers/path.js';

import {TaskListItem} from './components/TaskListItem/index.js';
import styles from './styles.module.css';

interface WorkspaceGroupViewProps {
  readonly workspace?: Workspace;
  readonly sessions: readonly SessionMetadata[];
  readonly isExpanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly currentSessionId: string | null;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => Promise<void>;
  readonly onNewSession?: (workspacePath: string) => void;
}

export function WorkspaceGroupView({
  workspace,
  sessions,
  isExpanded,
  onExpandedChange,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}: WorkspaceGroupViewProps) {
  const label = workspace ? basename(workspace.path) : 'Ungrouped';

  const selectedKeys = useMemo(
    () =>
      currentSessionId !== null
        ? new Set([currentSessionId])
        : new Set<string>(),
    [currentSessionId],
  );

  return (
    <Disclosure
      className={styles.group}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      <Disclosure.Heading className={styles.heading}>
        <Disclosure.Trigger className={styles.trigger}>
          <Disclosure.Indicator className={styles.indicator} />
          <Folder className={styles.folder} size={14} />
          <span className={styles.label} title={workspace?.path}>
            {label}
          </span>
        </Disclosure.Trigger>
        <Chip className={styles.count} size='sm' variant='soft'>
          {sessions.length}
        </Chip>
        {!!onNewSession && !!workspace && (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label={`New task in ${label}`}
                className={styles.plus}
                onPress={() => {
                  onNewSession(workspace.path);
                }}
              >
                <Plus size={15} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>New task</p>
            </Tooltip.Content>
          </Tooltip>
        )}
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className={styles.body}>
          {sessions.length === 0 ? (
            <p className={styles.empty}>No tasks yet</p>
          ) : (
            <ListBox
              aria-label={`${label} tasks`}
              className={styles.listBox}
              items={sessions}
              selectedKeys={selectedKeys}
              selectionMode='single'
              onSelectionChange={(keys: Selection) => {
                if (keys === 'all') {
                  return;
                }
                const selected = [...keys][0];
                if (typeof selected === 'string') {
                  onSelectSession(selected);
                }
              }}
            >
              {(session) => (
                <ListBox.Item
                  key={session.id}
                  id={session.id}
                  textValue={session.title}
                  className={styles.item}
                >
                  {({isSelected}) => (
                    <TaskListItem
                      title={session.title}
                      updatedAt={session.updatedAt}
                      isSelected={isSelected}
                      onDelete={async () => onDeleteSession(session.id)}
                    />
                  )}
                </ListBox.Item>
              )}
            </ListBox>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
```

- [ ] **Step 4: Rewrite the styles**

Replace the contents of `.../WorkspaceGroup/styles.module.css` with:

```css
.group {
  display: block;
}

.heading {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 2px 4px;
}

/* Quiet header trigger — no filled "ghost button" background. */
.trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 6px 6px 8px;
  background: none;
  border: none;
  border-radius: 8px;
  color: var(--foreground);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: background 150ms ease;
}

.trigger:hover {
  background: color-mix(in oklab, var(--foreground) 5%, transparent);
}

.trigger:focus-visible {
  outline: 1px solid color-mix(in srgb, var(--accent) 55%, transparent);
  outline-offset: 2px;
}

.indicator {
  flex: 0 0 auto;
  color: var(--muted);
}

.folder {
  flex: 0 0 auto;
  color: var(--muted);
}

.label {
  flex: 1;
  min-width: 0;
  font-weight: 600;
  font-size: 0.8125rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  flex: 0 0 auto;
}

.plus {
  flex: 0 0 auto;
  color: var(--muted);
}

.body {
  padding: 0 0 4px;
}

.empty {
  margin: 0;
  padding: 4px 8px 8px 30px;
  color: var(--muted);
  font-size: 0.8rem;
}

.listBox {
  padding-left: 14px;
}

/* Wrapper only — selected styling lives in TaskListItem. */
.item {
  width: 100%;
}

@media (prefers-reduced-motion: reduce) {
  .trigger {
    transition: none;
  }
}
```

- [ ] **Step 5: Run the view test + typecheck**

Run:

```bash
pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/WorkspaceGroupView.test.tsx
pnpm --filter @omnicraft/frontend typecheck
```

Expected: PASS; no type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/
git commit -m "$(cat <<'EOF'
feat(frontend): quiet workspace header + render TaskListItem rows

Replace the ghost-button header with a Disclosure.Trigger (no filled
"selected" pill), a HeroUI Chip count, and a folder icon; render the new
TaskListItem inside the ListBox instead of the shared SessionItem.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Frontend — auto-expand fallback + panel title

**Files:**

- Modify: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useExpandedGroups.ts` (add fallback arg)
- Test: `.../hooks/useExpandedGroups.test.ts` (add fallback cases)
- Modify: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/WorkspaceSessionList.tsx` (compute + pass `mostRecentGroupKey`)
- Modify: `apps/frontend/src/pages/coding/CodingPageView.tsx` (panel title → "Tasks")

**Interfaces:**

- Consumes: existing `sessionGroupKey` (already imported in `WorkspaceSessionList.tsx`).
- Produces: `useExpandedGroups(initialActiveGroupKey, initialFallbackGroupKey?)`.

- [ ] **Step 1: Write the failing hook tests**

Add to `.../hooks/useExpandedGroups.test.ts`:

```ts
it('seeds from the fallback key when the active key is null', () => {
  const {result} = renderHook(() => useExpandedGroups(null, '/fallback'));
  expect([...result.current.expandedGroups]).toEqual(['/fallback']);
});

it('prefers the active key over the fallback', () => {
  const {result} = renderHook(() => useExpandedGroups('/active', '/fallback'));
  expect([...result.current.expandedGroups]).toEqual(['/active']);
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/hooks/useExpandedGroups.test.ts`
Expected: FAIL — fallback arg ignored, expanded set is empty.

- [ ] **Step 3: Add the fallback to the hook**

In `useExpandedGroups.ts`, update the signature, doc comment, and seeding effect (leave `toggleGroup`/`expandGroup` unchanged):

```ts
/**
 * Tracks which workspace groups are expanded. Seeds the set once from the
 * active session's group (`initialActiveGroupKey`), or — when no session is
 * active — from `initialFallbackGroupKey` (the most-recent group), so the
 * panel opens with content. Only the first non-null seed is consumed; after
 * that the user controls expansion.
 */
export function useExpandedGroups(
  initialActiveGroupKey: string | null,
  initialFallbackGroupKey: string | null = null,
): UseExpandedGroupsResult {
  const [expandedGroups, setExpandedGroups] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seeded, setSeeded] = useState(false);

  useEffect(() => {
    if (seeded) {
      return;
    }
    const seedKey = initialActiveGroupKey ?? initialFallbackGroupKey;
    if (seedKey === null) {
      return;
    }
    setExpandedGroups(new Set([seedKey]));
    setSeeded(true);
  }, [seeded, initialActiveGroupKey, initialFallbackGroupKey]);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/coding/components/WorkspaceSessionList/hooks/useExpandedGroups.test.ts`
Expected: PASS (existing + new cases).

- [ ] **Step 5: Compute and pass the fallback in the container**

In `WorkspaceSessionList.tsx`, add a memo after the `activeKey` memo (it reuses the already-imported `sessionGroupKey`, `workspacesLoading`, `sessionsLoading`, `sessions`, `workspaces`):

```ts
// When no session is active, seed expansion with the group holding the most
// recently updated session (sessions are returned mtime-desc), so the panel
// never opens fully collapsed.
const mostRecentGroupKey = useMemo(() => {
  if (workspacesLoading || sessionsLoading) {
    return null;
  }
  const mostRecent = sessions[0];
  if (mostRecent === undefined) {
    return null;
  }
  return sessionGroupKey(mostRecent.workingDirectory, workspaces);
}, [workspacesLoading, sessionsLoading, sessions, workspaces]);
```

and pass it into the hook:

```ts
const {expandedGroups, toggleGroup, expandGroup} = useExpandedGroups(
  activeKey,
  mostRecentGroupKey,
);
```

- [ ] **Step 6: Change the panel title**

In `apps/frontend/src/pages/coding/CodingPageView.tsx`, change the sidebar title:

```tsx
      <CollapsibleSidebar title='Tasks'>
```

- [ ] **Step 7: Typecheck**

Run: `pnpm --filter @omnicraft/frontend typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useExpandedGroups.ts \
  apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useExpandedGroups.test.ts \
  apps/frontend/src/pages/coding/components/WorkspaceSessionList/WorkspaceSessionList.tsx \
  apps/frontend/src/pages/coding/CodingPageView.tsx
git commit -m "$(cat <<'EOF'
feat(frontend): auto-expand most-recent group; rename panel to "Tasks"

Seed expansion from the active session's group or, when none is selected,
the most-recently-updated session's group, so the task panel opens with
content instead of all-collapsed.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Verification (both themes; whole-suite; Chat unaffected)

**Files:** none (verification only).

- [ ] **Step 1: Run the touched package suites, typecheck, and lint**

```bash
pnpm --filter @omnicraft/api-schema test
pnpm --filter @omnicraft/backend test
pnpm --filter @omnicraft/frontend test
pnpm --filter @omnicraft/frontend typecheck
pnpm --filter @omnicraft/frontend lint
pnpm --filter @omnicraft/backend lint
```

Expected: all pass, no lint errors.

- [ ] **Step 2: Start the dev server**

Run from repo root: `pnpm dev` (allocates free ports; note the frontend URL, e.g. `http://localhost:5173/`).

- [ ] **Step 3: Verify the Coding page in the browser — both light and dark**

Open `/coding` and confirm:

- On fresh load (no session selected) the most-recent workspace group is **expanded** with scannable rows (title + "time ago").
- The workspace header is a quiet row (chevron · folder · name · count chip · `+`) with **no** grey filled "selected" pill.
- Selecting a task highlights it (accent-soft + accent left-bar + semibold title); the workspace header is visually distinct from the selected row.
- Hovering a row reveals the delete button; the confirm popover deletes.
- `+` starts a new task in that workspace; the count chip reflects the number of tasks.
- Toggle the theme and re-check all of the above in the other theme.

- [ ] **Step 4: Verify the Chat page is unchanged**

Open `/chat` and confirm the session list looks and behaves exactly as before (the shared `SessionItem` was not modified). It may now receive `updatedAt` in its payload but must render identically.

- [ ] **Step 5: Capture screenshots**

Capture the Coding sidebar in **light** and **dark** for the PR description.

---

## Notes for the executor

- **`updatedAt` liveness:** relative time refreshes when the list reloads (on `session-created` / `session-title` events and after delete) and on re-render. No polling/ticking timer in this scope — that arrives with the running/idle indicator in **#348**.
- **Running/idle indicator is out of scope** (#348). Task 3 deliberately renders only the idle dot; the layout reserves the slot so `#348` adds a variant with no relayout.
- If HeroUI `Chip` at `size='sm'` reads too large in the header during Step 3 of Task 4/verification, that is a styling nudge (adjust in `WorkspaceGroup/styles.module.css` via the `.count` class), not a structural change.
- **Selected-background double-up (watch in Task 6 Step 3):** selection styling now lives on `TaskListItem` (`.item[data-selected]`). The old accent-soft rule on the `WorkspaceGroup` `.item` (the `ListBox.Item`) was removed. If a selected row shows a second background from the `ListBox.Item` itself, move the accent-soft/inset-bar back onto `WorkspaceGroup` `.item[data-selected='true']` and drop it from `TaskListItem`. (Today's app adds the highlight itself, implying the `ListBox.Item` has no default selected background — so this is only a fallback.)
- **mtime exactness (Task 1 Step 5):** `toBe(when.getTime())` assumes the filesystem preserves whole-second mtimes exactly (it does on APFS/ext4). If it proves flaky on the CI filesystem, assert `Number.isFinite(result.sessions[0].updatedAt)` instead.
