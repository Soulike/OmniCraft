# Session History Sidebar — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible sidebar to the Chat page that lists historical
sessions, lets users switch between them, and delete them.

**Architecture:** A reusable `CollapsibleSidebar` shared component provides the
expand/collapse shell. A chat-page-specific `SessionSidebar` fills it with a
HeroUI `ListBox` of sessions fetched from `GET /api/chat/sessions`. Clicking a
session navigates to `/chat/:sessionId`; deleting uses a `Popover` confirmation
then calls `DELETE /api/chat/session/:id`.

**Tech Stack:** React 19, HeroUI v3 (ListBox, Popover, Button), CSS Modules,
lucide-react icons, Zod schema validation

---

## File Map

### New files

| File                                                                              | Purpose                                    |
| --------------------------------------------------------------------------------- | ------------------------------------------ |
| `components/CollapsibleSidebar/index.ts`                                          | Barrel export                              |
| `components/CollapsibleSidebar/CollapsibleSidebar.tsx`                            | Stateless sidebar with expand/collapse     |
| `components/CollapsibleSidebar/styles.module.css`                                 | Sidebar layout and transition styles       |
| `pages/chat/components/SessionSidebar/index.ts`                                   | Barrel export                              |
| `pages/chat/components/SessionSidebar/SessionSidebar.tsx`                         | Container: state, API calls, navigation    |
| `pages/chat/components/SessionSidebar/SessionSidebarView.tsx`                     | View: renders CollapsibleSidebar + ListBox |
| `pages/chat/components/SessionSidebar/styles.module.css`                          | ListBox styling                            |
| `pages/chat/components/SessionSidebar/hooks/useSessionList.ts`                    | Fetches session list from API              |
| `pages/chat/components/SessionSidebar/components/SessionItem/index.ts`            | Barrel export                              |
| `pages/chat/components/SessionSidebar/components/SessionItem/SessionItem.tsx`     | Container: delete popover state            |
| `pages/chat/components/SessionSidebar/components/SessionItem/SessionItemView.tsx` | View: title + delete button                |
| `pages/chat/components/SessionSidebar/components/SessionItem/styles.module.css`   | Hover-reveal delete button styles          |

### Modified files

| File                           | Change                                  |
| ------------------------------ | --------------------------------------- |
| `api/chat/chat.ts`             | Add `listSessions()`, `deleteSession()` |
| `pages/chat/ChatPage.tsx`      | Add sidebar state, pass props           |
| `pages/chat/ChatPageView.tsx`  | Wrap in horizontal flex, add sidebar    |
| `pages/chat/styles.module.css` | Add horizontal wrapper class            |

> All paths relative to `apps/frontend/src/`.

---

### Task 1: API Functions

**Files:**

- Modify: `apps/frontend/src/api/chat/chat.ts`

- [ ] **Step 1: Add `listSessions` function**

Append to `apps/frontend/src/api/chat/chat.ts`:

```ts
import {
  createSessionResponseSchema,
  listSessionsResponseSchema,
  type ListSessionsResponse,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
```

(Update the existing import to add `listSessionsResponseSchema` and
`ListSessionsResponse`.)

```ts
/** Fetches the list of past sessions. */
export async function listSessions(
  offset: number,
  limit: number,
): Promise<ListSessionsResponse> {
  const res = await fetch(
    `${BASE}/sessions?offset=${offset.toString()}&limit=${limit.toString()}`,
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to list sessions (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  return listSessionsResponseSchema.parse(json);
}
```

- [ ] **Step 2: Add `deleteSession` function**

Append to the same file:

```ts
/** Deletes a session by ID. */
export async function deleteSession(id: string): Promise<void> {
  const res = await fetch(`${BASE}/session/${id}`, {
    method: 'DELETE',
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to delete session (${res.status.toString()}): ${body}`,
    );
  }
}
```

- [ ] **Step 3: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/chat/chat.ts
git commit -m "feat(frontend): add listSessions and deleteSession API functions"
```

---

### Task 2: CollapsibleSidebar Shared Component

**Files:**

- Create: `apps/frontend/src/components/CollapsibleSidebar/index.ts`
- Create: `apps/frontend/src/components/CollapsibleSidebar/CollapsibleSidebar.tsx`
- Create: `apps/frontend/src/components/CollapsibleSidebar/styles.module.css`

- [ ] **Step 1: Create `styles.module.css`**

```css
.sidebar {
  display: flex;
  flex-direction: column;
  height: 100%;
  border-right: 1px solid var(--color-border);
  overflow: hidden;
  transition: width 200ms ease;
}

.sidebar[data-open='true'] {
  width: 240px;
}

.sidebar[data-open='false'] {
  width: 40px;
}

.header {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 8px;
  border-bottom: 1px solid var(--color-border);
  flex-shrink: 0;
}

.title {
  flex: 1;
  font-weight: 600;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.headerExtra {
  flex-shrink: 0;
}

.content {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}

.collapsed {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding-top: 8px;
  height: 100%;
}
```

- [ ] **Step 2: Create `CollapsibleSidebar.tsx`**

```tsx
import {Button, Tooltip} from '@heroui/react';
import {PanelLeftClose, PanelLeftOpen} from 'lucide-react';
import type {ReactNode} from 'react';

import styles from './styles.module.css';

interface CollapsibleSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}

export function CollapsibleSidebar({
  isOpen,
  onOpenChange,
  title,
  headerExtra,
  children,
}: CollapsibleSidebarProps) {
  if (!isOpen) {
    return (
      <aside className={styles.sidebar} data-open='false'>
        <div className={styles.collapsed}>
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='Expand sidebar'
                onPress={() => {
                  onOpenChange(true);
                }}
              >
                <PanelLeftOpen size={16} />
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

  return (
    <aside className={styles.sidebar} data-open='true'>
      <div className={styles.header}>
        <span className={styles.title}>{title}</span>
        {headerExtra && <div className={styles.headerExtra}>{headerExtra}</div>}
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Collapse sidebar'
              onPress={() => {
                onOpenChange(false);
              }}
            >
              <PanelLeftClose size={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>Collapse sidebar</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
      <div className={styles.content}>{children}</div>
    </aside>
  );
}
```

- [ ] **Step 3: Create `index.ts`**

```ts
export {CollapsibleSidebar} from './CollapsibleSidebar.js';
```

- [ ] **Step 4: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/CollapsibleSidebar/
git commit -m "feat(frontend): add CollapsibleSidebar shared component"
```

---

### Task 3: useSessionList Hook

**Files:**

- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/hooks/useSessionList.ts`

- [ ] **Step 1: Create the hook**

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {listSessions} from '@/api/chat/index.js';

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

/**
 * Fetches the session list from the API and provides a manual refresh.
 * Re-fetches automatically on mount.
 */
export function useSessionList(): UseSessionListReturn {
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listSessions(0, 50);
        if (!cancelled) {
          setSessions(result.sessions);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load sessions');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  return {sessions, isLoading, error, refresh};
}
```

- [ ] **Step 2: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors. (The `listSessions` import requires Task 1 to be
done.)

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/components/SessionSidebar/hooks/useSessionList.ts
git commit -m "feat(frontend): add useSessionList hook"
```

---

### Task 4: SessionItem Component

**Files:**

- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/components/SessionItem/index.ts`
- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/components/SessionItem/SessionItemView.tsx`
- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/components/SessionItem/SessionItem.tsx`
- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/components/SessionItem/styles.module.css`

- [ ] **Step 1: Create `styles.module.css`**

```css
.item {
  display: flex;
  align-items: center;
  gap: 4px;
}

.title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.deleteButton {
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 150ms ease;
}

.item:hover .deleteButton {
  opacity: 1;
}

.popoverBody {
  margin-top: 8px;
  font-size: 0.875rem;
  color: var(--color-foreground-400);
}

.popoverActions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 2: Create `SessionItemView.tsx`**

```tsx
import {Button, Popover} from '@heroui/react';
import {Trash2} from 'lucide-react';

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
      <span className={styles.title}>{title}</span>
      <div className={styles.deleteButton}>
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

- [ ] **Step 3: Create `SessionItem.tsx`**

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

- [ ] **Step 4: Create `index.ts`**

```ts
export {SessionItem} from './SessionItem.js';
```

- [ ] **Step 5: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/SessionSidebar/components/SessionItem/
git commit -m "feat(frontend): add SessionItem component with delete popover"
```

---

### Task 5: SessionSidebar Component

**Files:**

- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/index.ts`
- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/SessionSidebarView.tsx`
- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/SessionSidebar.tsx`
- Create:
  `apps/frontend/src/pages/chat/components/SessionSidebar/styles.module.css`

- [ ] **Step 1: Create `styles.module.css`**

```css
.listBox {
  padding: 4px;
}
```

- [ ] **Step 2: Create `SessionSidebarView.tsx`**

```tsx
import {ListBox} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Key} from 'react';

import {CollapsibleSidebar} from '@/components/CollapsibleSidebar/index.js';

import {SessionItem} from './components/SessionItem/index.js';
import styles from './styles.module.css';

interface SessionSidebarViewProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: readonly SessionMetadata[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<void>;
}

export function SessionSidebarView({
  isOpen,
  onOpenChange,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: SessionSidebarViewProps) {
  const selectedKeys =
    currentSessionId !== null ? new Set([currentSessionId]) : new Set<string>();

  return (
    <CollapsibleSidebar
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title='Sessions'
    >
      <ListBox
        aria-label='Session list'
        className={styles.listBox}
        items={sessions}
        selectedKeys={selectedKeys}
        selectionMode='single'
        onAction={(key: Key) => {
          onSelectSession(String(key));
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
              onDelete={async () => onDeleteSession(session.id)}
            />
          </ListBox.Item>
        )}
      </ListBox>
    </CollapsibleSidebar>
  );
}
```

- [ ] **Step 3: Create `SessionSidebar.tsx`**

```tsx
import {useCallback, useState} from 'react';
import {useNavigate} from 'react-router';

import {deleteSession} from '@/api/chat/index.js';

import {useSessionId} from '../../hooks/useSessionId.js';
import {useSessionList} from './hooks/useSessionList.js';
import {SessionSidebarView} from './SessionSidebarView.js';

export function SessionSidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const {sessions, refresh} = useSessionList();
  const {sessionId} = useSessionId();
  const navigate = useNavigate();

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(`/chat/${id}`);
      }
    },
    [navigate, sessionId],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      refresh();
      if (id === sessionId) {
        void navigate('/chat', {replace: true});
      }
    },
    [refresh, sessionId, navigate],
  );

  return (
    <SessionSidebarView
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      sessions={sessions}
      currentSessionId={sessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
    />
  );
}
```

- [ ] **Step 4: Create `index.ts`**

```ts
export {SessionSidebar} from './SessionSidebar.js';
```

- [ ] **Step 5: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/components/SessionSidebar/
git commit -m "feat(frontend): add SessionSidebar component"
```

---

### Task 6: Integrate Sidebar into Chat Page

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`
- Modify: `apps/frontend/src/pages/chat/styles.module.css`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Add wrapper class to `styles.module.css`**

Add to `apps/frontend/src/pages/chat/styles.module.css`:

```css
.wrapper {
  display: flex;
  height: 100%;
}

.main {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 2: Update `ChatPageView.tsx`**

Add the sidebar to the layout. The `SessionSidebar` is a container component
(has its own state and hooks), so it goes directly in the view without being
threaded through props.

Update the import section — add `SessionSidebar`:

```tsx
import {SessionSidebar} from './components/SessionSidebar/index.js';
```

Wrap the return JSX: replace the existing `<div className={styles.page}>` with
the new wrapper structure:

```tsx
return (
  <div className={styles.wrapper}>
    <SessionSidebar />
    <div className={styles.main}>
      <div className={styles.page}>
        {/* ... all existing content unchanged ... */}
      </div>
    </div>
  </div>
);
```

The full updated return:

```tsx
return (
  <div className={styles.wrapper}>
    <SessionSidebar />
    <div className={styles.main}>
      <div className={styles.page}>
        {isReconnecting && (
          <ChatAlert
            status='warning'
            title='Reconnecting'
            message='Connection lost. Attempting to reconnect...'
          />
        )}
        {error && (
          <ChatAlert
            status='danger'
            title='Error'
            message={error}
            onDismiss={onDismissError}
          />
        )}
        {maxRoundsReached && (
          <ChatAlert
            status='warning'
            title='Tool limit reached'
            message='The assistant reached the maximum number of tool execution rounds. You can increase this limit in Settings > Agent.'
            onDismiss={onDismissMaxRoundsReached}
          />
        )}
        <TitleBarView
          title={title}
          onNewSession={onNewSession}
          newSessionDisabled={newSessionDisabled}
          vscodeUrl={vscodeUrl}
        />
        <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
          {isEmpty && !sessionId && (
            <div className={styles.emptyState}>
              <SessionSetup />
            </div>
          )}
          <StreamingMessageDisplay
            eventBus={eventBus}
            sessionId={sessionId}
            onMessagesChange={onMessagesChange}
          />
        </ScrollShadow>
        {sessionId && <InfoBar />}
        <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
      </div>
    </div>
  </div>
);
```

- [ ] **Step 3: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Manual smoke test**

Run: `cd apps/frontend && bun run dev`

Verify:

1. Chat page shows sidebar on the left, expanded by default.
2. Collapse button hides sidebar to narrow strip; expand button restores it.
3. Session list loads and shows past sessions.
4. Clicking a session navigates to `/chat/:sessionId` and loads history.
5. Hover shows delete icon; clicking it shows Popover confirmation.
6. Confirming delete removes the session and refreshes the list.
7. New session button in TitleBar still works.
8. Sidebar and chat area resize correctly.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPageView.tsx \
       apps/frontend/src/pages/chat/styles.module.css
git commit -m "feat(frontend): integrate session sidebar into chat page"
```

---

### Task 7: Refresh sidebar on new session title

**Files:**

- Modify:
  `apps/frontend/src/pages/chat/components/SessionSidebar/SessionSidebar.tsx`
- Modify:
  `apps/frontend/src/pages/chat/components/SessionSidebar/hooks/useSessionList.ts`

When a new session receives its title via the `session-title` SSE event, the
sidebar should refresh to show the updated entry. The `ChatEventBus` already
emits a `session-title` event.

- [ ] **Step 1: Subscribe to `session-title` in `useSessionList`**

Update `useSessionList.ts` to accept an optional `ChatEventBus` and refresh when
a `session-title` event fires:

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {listSessions} from '@/api/chat/index.js';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

interface UseSessionListOptions {
  eventBus: ChatEventBus;
}

interface UseSessionListReturn {
  sessions: readonly SessionMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}

export function useSessionList({
  eventBus,
}: UseSessionListOptions): UseSessionListReturn {
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = useCallback(() => {
    setRefreshKey((prev) => prev + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function fetchSessions() {
      setIsLoading(true);
      setError(null);
      try {
        const result = await listSessions(0, 50);
        if (!cancelled) {
          setSessions(result.sessions);
        }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load sessions');
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    void fetchSessions();

    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  useEffect(() => {
    const handler = () => {
      refresh();
    };
    eventBus.on('session-title', handler);
    return () => {
      eventBus.off('session-title', handler);
    };
  }, [eventBus, refresh]);

  return {sessions, isLoading, error, refresh};
}
```

- [ ] **Step 2: Pass `eventBus` in `SessionSidebar.tsx`**

Update `SessionSidebar.tsx`:

```tsx
import {useCallback, useState} from 'react';
import {useNavigate} from 'react-router';

import {deleteSession} from '@/api/chat/index.js';

import {useChatEventBus} from '../../hooks/useChatEventBus.js';
import {useSessionId} from '../../hooks/useSessionId.js';
import {useSessionList} from './hooks/useSessionList.js';
import {SessionSidebarView} from './SessionSidebarView.js';

export function SessionSidebar() {
  const [isOpen, setIsOpen] = useState(true);
  const eventBus = useChatEventBus();
  const {sessions, refresh} = useSessionList({eventBus});
  const {sessionId} = useSessionId();
  const navigate = useNavigate();

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(`/chat/${id}`);
      }
    },
    [navigate, sessionId],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      refresh();
      if (id === sessionId) {
        void navigate('/chat', {replace: true});
      }
    },
    [refresh, sessionId, navigate],
  );

  return (
    <SessionSidebarView
      isOpen={isOpen}
      onOpenChange={setIsOpen}
      sessions={sessions}
      currentSessionId={sessionId}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
    />
  );
}
```

- [ ] **Step 3: Verify the build**

Run: `cd apps/frontend && npx tsc --noEmit`

Expected: No type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/components/SessionSidebar/
git commit -m "feat(frontend): refresh sidebar on session title update"
```
