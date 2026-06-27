# SessionList Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split `SessionSidebar` into a layout-agnostic `SessionList` that `chat-session` exposes, move the collapsible-sidebar composition into the pages, and remove the workspace line from session rows.

**Architecture:** Three independently-green tasks. (1) Make the generic `CollapsibleSidebar` self-manage its open/collapse state. (2) Rename `SessionSidebar` → `SessionList`, strip the sidebar chrome out of it, and compose `<CollapsibleSidebar><SessionList/></CollapsibleSidebar>` in each page view. (3) Remove the `workingDirectory` display from `SessionItem`.

**Tech Stack:** React 19, TypeScript, Vite, Vitest, HeroUI v3, CSS Modules. Bun is the package manager/runner.

## Global Constraints

These apply to every task (from `CLAUDE.md` / `apps/frontend/CLAUDE.md`):

- Never use `any`; use `unknown` + narrowing.
- Use early-return style for `if`.
- One React component per file. View files (`*View.tsx`) are stateless — state lives in hooks/containers.
- CSS Modules only for our components; no Tailwind utility classes. Use HeroUI components directly.
- A component must not dictate its placement in the parent (no `flex`/`margin`/`grid-column` on its own root for parent-layout purposes).
- Import a component via its folder `index.ts` barrel. Public modules via `@/` alias; component-internal modules via relative paths.
- Use Node.js APIs in code, not Bun APIs. Use `bun run <script>` to run scripts.
- This is a **behavior-preserving refactor** (Tasks 1–2) plus a small display removal (Task 3). No new automated tests are added: there are no existing unit tests for `SessionSidebar`/`SessionItem`, the change surface is types + composition, and it is fully covered by `tsc -b` and the existing 245-test Vitest suite. Verification is typecheck + the existing suite + a grep for stale references + manual browser check.

### Verification commands (run from repo root `/Users/soulike/.superset/worktrees/omni-craft/spiral-buckthorn`)

- Typecheck: `bunx tsc -b apps/frontend --force` → Expected: exits 0, no output.
- Tests: `bun run --filter '@omnicraft/frontend' test` → Expected: `Test Files  35 passed (35)`, `Tests  245 passed (245)`.
- Lint: `bun run --filter '@omnicraft/frontend' lint` → Expected: exits 0, no errors.

Baseline (before any task) is green: typecheck passes, 35 files / 245 tests pass.

---

## File Structure

After the refactor, the module folder is renamed and its responsibilities narrow:

```
apps/frontend/src/components/CollapsibleSidebar/
  CollapsibleSidebar.tsx        # MODIFIED: self-manages open state (defaultOpen)

apps/frontend/src/modules/chat-session/
  index.ts                      # MODIFIED: export SessionList (was SessionSidebar)
  components/
    SessionList/                # RENAMED from SessionSidebar/
      index.ts                  # MODIFIED: export SessionList
      SessionList.tsx           # RENAMED from SessionSidebar.tsx; container, no isOpen
      SessionListView.tsx       # RENAMED from SessionSidebarView.tsx; list only, no chrome
      styles.module.css         # unchanged
      hooks/useSessionList.ts   # unchanged
      components/SessionItem/
        SessionItem.tsx         # MODIFIED (Task 3): drop workingDirectory
        SessionItemView.tsx     # MODIFIED (Task 3): drop workingDirectory
        styles.module.css       # MODIFIED (Task 3): drop .workingDirectory

apps/frontend/src/pages/chat/ChatPageView.tsx      # MODIFIED: compose sidebar
apps/frontend/src/pages/coding/CodingPageView.tsx  # MODIFIED: compose sidebar
```

---

## Task 1: `CollapsibleSidebar` self-manages open state

Make the generic sidebar own its open/collapse state internally, then drop the now-unused state plumbing from its sole consumer (`SessionSidebarView`/`SessionSidebar`). The component is still wrapped inside `SessionSidebar` at this point — the structural move happens in Task 2.

**Files:**

- Modify: `apps/frontend/src/components/CollapsibleSidebar/CollapsibleSidebar.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionSidebar/SessionSidebarView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionSidebar/SessionSidebar.tsx`

**Interfaces:**

- Produces: `CollapsibleSidebar(props: {title: string; headerExtra?: ReactNode; defaultOpen?: boolean; children: ReactNode})`. No `isOpen`/`onOpenChange` props.

- [ ] **Step 1: Rewrite `CollapsibleSidebar.tsx` to manage its own state**

Replace the entire file `apps/frontend/src/components/CollapsibleSidebar/CollapsibleSidebar.tsx` with:

```tsx
import {Button, ScrollShadow, Tooltip} from '@heroui/react';
import {SidebarClose, SidebarOpen} from 'lucide-react';
import type {ReactNode} from 'react';
import {useState} from 'react';

import styles from './styles.module.css';

interface CollapsibleSidebarProps {
  title: string;
  headerExtra?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function CollapsibleSidebar({
  title,
  headerExtra,
  defaultOpen = true,
  children,
}: CollapsibleSidebarProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <aside className={styles.sidebar} data-open={isOpen}>
      <div className={styles.expanded}>
        <div className={styles.header}>
          <span className={styles.title}>{title}</span>
          {headerExtra && (
            <div className={styles.headerExtra}>{headerExtra}</div>
          )}
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='Collapse sidebar'
                onPress={() => {
                  setIsOpen(false);
                }}
              >
                <SidebarClose size={16} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>Collapse sidebar</p>
            </Tooltip.Content>
          </Tooltip>
        </div>
        <ScrollShadow className={styles.content}>{children}</ScrollShadow>
      </div>
      <div className={styles.collapsed}>
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Expand sidebar'
              onPress={() => {
                setIsOpen(true);
              }}
            >
              <SidebarOpen size={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>Expand sidebar</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </aside>
  );
}
```

- [ ] **Step 2: Drop `isOpen`/`onOpenChange` from `SessionSidebarView.tsx`**

In `apps/frontend/src/modules/chat-session/components/SessionSidebar/SessionSidebarView.tsx`:

Remove these two lines from the `SessionSidebarViewProps` interface:

```tsx
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
```

Remove `isOpen,` and `onOpenChange,` from the destructured function parameters.

Change the `CollapsibleSidebar` usage from:

```tsx
<CollapsibleSidebar
  isOpen={isOpen}
  onOpenChange={onOpenChange}
  title='Sessions'
>
  {content}
</CollapsibleSidebar>
```

to:

```tsx
<CollapsibleSidebar title='Sessions'>{content}</CollapsibleSidebar>
```

- [ ] **Step 3: Remove the dead `isOpen` state from `SessionSidebar.tsx`**

In `apps/frontend/src/modules/chat-session/components/SessionSidebar/SessionSidebar.tsx`:

Delete this line:

```tsx
const [isOpen, setIsOpen] = useState(true);
```

Change the import `import {useCallback, useState} from 'react';` to `import {useCallback} from 'react';`.

In the `<SessionSidebarView ... />` JSX, delete these two props:

```tsx
isOpen = {isOpen};
onOpenChange = {setIsOpen};
```

- [ ] **Step 4: Typecheck**

Run: `bunx tsc -b apps/frontend --force`
Expected: exits 0, no errors. (Confirms no consumer still passes `isOpen`/`onOpenChange`.)

- [ ] **Step 5: Run tests**

Run: `bun run --filter '@omnicraft/frontend' test`
Expected: `Test Files  35 passed (35)`, `Tests  245 passed (245)`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/components/CollapsibleSidebar/CollapsibleSidebar.tsx \
        apps/frontend/src/modules/chat-session/components/SessionSidebar/SessionSidebarView.tsx \
        apps/frontend/src/modules/chat-session/components/SessionSidebar/SessionSidebar.tsx
git commit -m "refactor(frontend): make CollapsibleSidebar self-manage open state"
```

---

## Task 2: Extract `SessionList` and compose the sidebar in the pages

Rename the module to `SessionList`, remove the `CollapsibleSidebar` wrapper from its view (it now renders only the list), update the barrel exports, and compose the sidebar in both page views.

**Files:**

- Rename: `apps/frontend/src/modules/chat-session/components/SessionSidebar/` → `.../SessionList/`
- Rename: `SessionSidebar.tsx` → `SessionList.tsx`; `SessionSidebarView.tsx` → `SessionListView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/SessionList.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/index.ts`
- Modify: `apps/frontend/src/modules/chat-session/index.ts`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPageView.tsx`

**Interfaces:**

- Consumes: `CollapsibleSidebar` (Task 1).
- Produces: `SessionList()` — a self-contained component (no props) exported from `@/modules/chat-session/index.js`. Renders only the list content (no sidebar chrome).

- [ ] **Step 1: Rename the folder and files with `git mv`**

```bash
cd /Users/soulike/.superset/worktrees/omni-craft/spiral-buckthorn
git mv apps/frontend/src/modules/chat-session/components/SessionSidebar \
       apps/frontend/src/modules/chat-session/components/SessionList
git mv apps/frontend/src/modules/chat-session/components/SessionList/SessionSidebar.tsx \
       apps/frontend/src/modules/chat-session/components/SessionList/SessionList.tsx
git mv apps/frontend/src/modules/chat-session/components/SessionList/SessionSidebarView.tsx \
       apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx
```

- [ ] **Step 2: Rewrite `SessionList.tsx` (container) — rename, drop `isOpen`**

Replace the entire file `apps/frontend/src/modules/chat-session/components/SessionList/SessionList.tsx` with:

```tsx
import {toast} from '@heroui/react';
import {useCallback} from 'react';
import {useNavigate} from 'react-router';

import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionId} from '../../hooks/useSessionId.js';
import {useSessionList} from './hooks/useSessionList.js';
import {SessionListView} from './SessionListView.js';

export function SessionList() {
  const eventBus = useChatEventBus();
  const {sessionId, buildSessionRoute, baseRoute} = useSessionId();
  const {
    sessions,
    isLoadingInitial,
    isLoadingMore,
    error,
    hasMore,
    sentinelRef,
    deleteSession,
  } = useSessionList({
    eventBus,
  });
  const navigate = useNavigate();

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(buildSessionRoute(id));
      }
    },
    [navigate, sessionId, buildSessionRoute],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await deleteSession(id);
      } catch (e: unknown) {
        console.error('Failed to delete session:', e);
        toast.danger('Failed to delete session');
        return;
      }
      toast.success('Session deleted');
      if (id === sessionId) {
        void navigate(baseRoute, {replace: true});
      }
    },
    [deleteSession, sessionId, navigate, baseRoute],
  );

  return (
    <SessionListView
      sessions={sessions}
      isLoadingInitial={isLoadingInitial}
      isLoadingMore={isLoadingMore}
      error={error}
      hasMore={hasMore}
      sentinelRef={sentinelRef}
      currentSessionId={sessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
    />
  );
}
```

- [ ] **Step 3: Rewrite `SessionListView.tsx` (view) — remove sidebar chrome, render list only**

Replace the entire file `apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx` with (note: `workingDirectory` is still passed here; it is removed in Task 3):

```tsx
import type {Selection} from '@heroui/react';
import {ListBox, Spinner} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {RefObject} from 'react';

import {SessionItem} from './components/SessionItem/index.js';
import styles from './styles.module.css';

interface SessionListViewProps {
  sessions: readonly SessionMetadata[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<void>;
}

export function SessionListView({
  sessions,
  isLoadingInitial,
  isLoadingMore,
  error,
  hasMore,
  sentinelRef,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: SessionListViewProps) {
  if (isLoadingInitial) {
    return (
      <div className={styles.centered}>
        <Spinner size='sm' />
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className={styles.centered}>
        <p className={styles.errorText}>Failed to load sessions</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.centered}>
        <p className={styles.emptyText}>No sessions yet</p>
      </div>
    );
  }

  const selectedKeys =
    currentSessionId !== null ? new Set([currentSessionId]) : new Set<string>();

  return (
    <>
      <ListBox
        aria-label='Session list'
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
          >
            <SessionItem
              title={session.title}
              workingDirectory={session.workingDirectory}
              onDelete={async () => onDeleteSession(session.id)}
            />
          </ListBox.Item>
        )}
      </ListBox>
      {hasMore && (
        <div ref={sentinelRef} className={styles.centered}>
          {isLoadingMore && <Spinner size='sm' />}
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 4: Update `SessionList/index.ts`**

Replace the entire file `apps/frontend/src/modules/chat-session/components/SessionList/index.ts` with:

```ts
export {SessionList} from './SessionList.js';
```

- [ ] **Step 5: Update the module barrel `chat-session/index.ts`**

In `apps/frontend/src/modules/chat-session/index.ts`, change:

```ts
export {SessionSidebar} from './components/SessionSidebar/index.js';
```

to:

```ts
export {SessionList} from './components/SessionList/index.js';
```

(Keep it in alphabetical order within the `// Components` group — `SessionList` sorts after `InfoBar` and before `TitleBarView`, the same slot the old export occupied.)

- [ ] **Step 6: Compose the sidebar in `ChatPageView.tsx`**

In `apps/frontend/src/pages/chat/ChatPageView.tsx`:

Add this import (alias imports group, before the `@/modules/chat-events` import):

```tsx
import {CollapsibleSidebar} from '@/components/CollapsibleSidebar/index.js';
```

In the `@/modules/chat-session/index.js` import block, replace `SessionSidebar,` with `SessionList,`.

Replace the line `<SessionSidebar />` with:

```tsx
<CollapsibleSidebar title='Sessions'>
  <SessionList />
</CollapsibleSidebar>
```

- [ ] **Step 7: Compose the sidebar in `CodingPageView.tsx`**

In `apps/frontend/src/pages/coding/CodingPageView.tsx`:

Add this import (alias imports group, before the `@/modules/chat-events` import):

```tsx
import {CollapsibleSidebar} from '@/components/CollapsibleSidebar/index.js';
```

In the `@/modules/chat-session/index.js` import block, replace `SessionSidebar,` with `SessionList,`.

Replace the line `<SessionSidebar />` with:

```tsx
<CollapsibleSidebar title='Sessions'>
  <SessionList />
</CollapsibleSidebar>
```

- [ ] **Step 8: Verify no stale references remain**

Run: `grep -rn "SessionSidebar" apps/frontend/src`
Expected: no output (exit code 1).

- [ ] **Step 9: Typecheck**

Run: `bunx tsc -b apps/frontend --force`
Expected: exits 0, no errors.

- [ ] **Step 10: Run tests**

Run: `bun run --filter '@omnicraft/frontend' test`
Expected: `Test Files  35 passed (35)`, `Tests  245 passed (245)`.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src/modules/chat-session \
        apps/frontend/src/pages/chat/ChatPageView.tsx \
        apps/frontend/src/pages/coding/CodingPageView.tsx
git commit -m "refactor(frontend): extract SessionList and compose the sidebar in pages"
```

---

## Task 3: Remove the workspace display from session rows

Stop rendering each session's working directory. The `SessionMetadata` schema is untouched; only the UI stops reading the field.

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/SessionItemView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/SessionItem.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/styles.module.css`

**Interfaces:**

- Produces: `SessionItem(props: {title: string; onDelete: () => Promise<void>})` — no `workingDirectory`.

- [ ] **Step 1: Drop `workingDirectory` from `SessionItemView.tsx`**

Replace the entire file `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/SessionItemView.tsx` with:

```tsx
import {Button, Popover} from '@heroui/react';
import {MessageSquare, Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface SessionItemViewProps {
  title: string;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function SessionItemView({
  title,
  isDeleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
  isDeleting,
}: SessionItemViewProps) {
  return (
    <div className={styles.item}>
      <div className={styles.icon}>
        <MessageSquare size={14} fill='currentColor' strokeWidth={1.5} />
      </div>
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
      </div>
      <div className={styles.actions}>
        <Popover isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
          <Popover.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Delete session'
            >
              <Trash2 size={14} />
            </Button>
          </Popover.Trigger>
          <Popover.Content placement='right'>
            <Popover.Dialog>
              <Popover.Heading>Delete session?</Popover.Heading>
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

- [ ] **Step 2: Drop `workingDirectory` from `SessionItem.tsx`**

Replace the entire file `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/SessionItem.tsx` with:

```tsx
import {useCallback, useState} from 'react';

import {SessionItemView} from './SessionItemView.js';

interface SessionItemProps {
  title: string;
  onDelete: () => Promise<void>;
}

export function SessionItem({title, onDelete}: SessionItemProps) {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete();
    } finally {
      setIsDeleting(false);
      setIsDeleteOpen(false);
    }
  }, [onDelete]);

  return (
    <SessionItemView
      title={title}
      isDeleteOpen={isDeleteOpen}
      onDeleteOpenChange={setIsDeleteOpen}
      onConfirmDelete={() => {
        void handleConfirmDelete();
      }}
      isDeleting={isDeleting}
    />
  );
}
```

- [ ] **Step 3: Stop passing `workingDirectory` in `SessionListView.tsx`**

In `apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx`, change the `<SessionItem>` usage from:

```tsx
<SessionItem
  title={session.title}
  workingDirectory={session.workingDirectory}
  onDelete={async () => onDeleteSession(session.id)}
/>
```

to:

```tsx
<SessionItem
  title={session.title}
  onDelete={async () => onDeleteSession(session.id)}
/>
```

- [ ] **Step 4: Remove the `.workingDirectory` rule from the item styles**

In `apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem/styles.module.css`, delete this rule block entirely:

```css
.workingDirectory {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.75rem;
  color: var(--muted);
}
```

- [ ] **Step 5: Typecheck**

Run: `bunx tsc -b apps/frontend --force`
Expected: exits 0, no errors.

- [ ] **Step 6: Run tests**

Run: `bun run --filter '@omnicraft/frontend' test`
Expected: `Test Files  35 passed (35)`, `Tests  245 passed (245)`.

- [ ] **Step 7: Lint**

Run: `bun run --filter '@omnicraft/frontend' lint`
Expected: exits 0, no errors (catches any unused import left behind, e.g. an orphaned `styles` reference).

- [ ] **Step 8: Manual browser verification (required by the frontend UI rule)**

Start the dev server from the repo root with `bun dev`, open the app, and verify in **both light and dark themes**:

- The Sessions sidebar still collapses (close button) and expands (open button).
- Session rows show the **title only** — no working-directory line beneath it.
- The current session is highlighted; clicking another session navigates to it.
- The delete popover still confirms and removes a session.

Capture screenshots of the chat/coding sidebar in both themes for the PR description.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/SessionList/components/SessionItem \
        apps/frontend/src/modules/chat-session/components/SessionList/SessionListView.tsx
git commit -m "refactor(frontend): remove workspace line from session list rows"
```

---

## Self-Review

**Spec coverage:**

- Spec §1 (rename `SessionSidebar`→`SessionList`, strip chrome, keep behavior internal, barrel export) → Task 2. ✓
- Spec §2 (`CollapsibleSidebar` self-managed, `defaultOpen`, no controlled props) → Task 1. ✓
- Spec §3 (compose `<CollapsibleSidebar title='Sessions'><SessionList/></CollapsibleSidebar>` in both pages, Views stay stateless, `wrapper`/`main` unchanged) → Task 2 Steps 6–7. ✓
- Spec §4 (remove `workingDirectory` from view/item/styles, schema untouched) → Task 3. ✓
- Spec Testing & Verification (typecheck + existing suite + grep + browser, both themes) → Global Constraints + Task 2 Step 8 (grep) + Task 3 Step 8 (browser). ✓
- Spec Risks (stale imports → Task 2 Step 8 grep; layout regression → Task 3 Step 8 browser). ✓

**Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows full file or exact before/after. ✓

**Type consistency:** `SessionList()` (no props) is produced in Task 2 and consumed by both pages in the same task. `CollapsibleSidebar` prop shape `{title, headerExtra?, defaultOpen?, children}` defined in Task 1, consumed in Task 2. `SessionItem` narrows to `{title, onDelete}` in Task 3, and its only caller (`SessionListView`) is updated in the same task (Step 3). `SessionListView` prop interface is identical across Task 2 (created) and Task 3 (only the inner `<SessionItem>` call changes, not the props). ✓
