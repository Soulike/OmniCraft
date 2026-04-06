# New Session Button & TitleBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "new session" icon button to the Chat page title bar by extracting the title into a TitleBar component, adding session lifecycle orchestration, and wiring the reset flow.

**Architecture:** A new `useSessionLifecycle` hook orchestrates session transitions by calling clear methods on existing data hooks. A new `TitleBar` view component replaces the inline `<h2>` title and houses the new session button. Existing data hooks (`useSessionId`, `useSessionTitle`) gain minimal clear methods. `useSession` is renamed to `useSessionId` with all exports renamed accordingly.

**Tech Stack:** React 19, HeroUI v3, lucide-react, CSS Modules, Vitest

**Spec:** `docs/superpowers/specs/2026-04-06-new-session-button-design.md`

---

### Task 1: Rename `useSession` to `useSessionId` and update all consumers

**Files:**

- Rename: `apps/frontend/src/pages/chat/hooks/useSession.ts` → `apps/frontend/src/pages/chat/hooks/useSessionId.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Rename file and refactor the hook**

Rename `apps/frontend/src/pages/chat/hooks/useSession.ts` to `useSessionId.ts` and replace its full contents:

```ts
import {useCallback, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

interface SessionConfig {
  workspace?: string;
  extraAllowedPaths?: readonly string[];
}

/** Manages the session ID lifecycle. Session is created on demand via `createNewSessionId`. */
export function useSessionId() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const createNewSessionId = useCallback(async (config: SessionConfig = {}) => {
    setError(null);
    try {
      const id = await createSession(config);
      setSessionId(id);
      return id;
    } catch (e) {
      console.error('Failed to create session', e);
      const message =
        e instanceof Error ? e.message : 'Failed to create session';
      setError(message);
      return null;
    }
  }, []);

  const clearSessionId = useCallback(() => {
    setSessionId(null);
    setError(null);
  }, []);

  const clearCreateNewSessionIdError = useCallback(() => {
    setError(null);
  }, []);

  return {
    sessionId,
    createNewSessionIdError: error,
    createNewSessionId,
    clearSessionId,
    clearCreateNewSessionIdError,
  };
}
```

- [ ] **Step 2: Update `useStreamChat.ts` import type**

In `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`, update the import and type alias (lines 6-8):

Replace:

```ts
import type {useSession} from './useSession.js';

type SessionHook = ReturnType<typeof useSession>;
```

With:

```ts
import type {useSessionId} from './useSessionId.js';

type SessionIdHook = ReturnType<typeof useSessionId>;
```

Update the `UseStreamChatOptions` interface (lines 10-13):

Replace:

```ts
interface UseStreamChatOptions {
  sessionId: SessionHook['sessionId'];
  resetSession: SessionHook['resetSession'];
}
```

With:

```ts
interface UseStreamChatOptions {
  sessionId: SessionIdHook['sessionId'];
  createNewSessionId: SessionIdHook['createNewSessionId'];
}
```

Update the function signature and body — replace `resetSession` with `createNewSessionId` in the destructuring (line 16) and usage (line 30):

Replace:

```ts
export function useStreamChat({sessionId, resetSession}: UseStreamChatOptions) {
```

With:

```ts
export function useStreamChat({sessionId, createNewSessionId}: UseStreamChatOptions) {
```

Replace:

```ts
const activeSessionId = sessionId ?? (await resetSession());
```

With:

```ts
const activeSessionId = sessionId ?? (await createNewSessionId());
```

Update the dependency array (line 108):

Replace:

```ts
    [isStreaming, sessionId, resetSession, eventBus],
```

With:

```ts
    [isStreaming, sessionId, createNewSessionId, eventBus],
```

- [ ] **Step 3: Update `ChatPage.tsx` import and destructuring**

In `apps/frontend/src/pages/chat/ChatPage.tsx`, update the import (line 9):

Replace:

```ts
import {useSession} from './hooks/useSession.js';
```

With:

```ts
import {useSessionId} from './hooks/useSessionId.js';
```

Update the destructuring in `ChatPageContent` (lines 27-28):

Replace:

```ts
const {sessionId, sessionError, resetSession, clearSessionError} = useSession();
```

With:

```ts
const {
  sessionId,
  createNewSessionIdError,
  createNewSessionId,
  clearCreateNewSessionIdError,
} = useSessionId();
```

Update `resetSessionWithConfig` (lines 35-45):

Replace:

```ts
const resetSessionWithConfig = useCallback(
  async () =>
    resetSession({
      workspace: selectedWorkspace,
      extraAllowedPaths:
        selectedExtraAllowedPaths.length > 0
          ? selectedExtraAllowedPaths
          : undefined,
    }),
  [resetSession, selectedWorkspace, selectedExtraAllowedPaths],
);
```

With:

```ts
const createNewSessionIdWithConfig = useCallback(
  async () =>
    createNewSessionId({
      workspace: selectedWorkspace,
      extraAllowedPaths:
        selectedExtraAllowedPaths.length > 0
          ? selectedExtraAllowedPaths
          : undefined,
    }),
  [createNewSessionId, selectedWorkspace, selectedExtraAllowedPaths],
);
```

Update the `useStreamChat` call (line 55):

Replace:

```ts
  } = useStreamChat({sessionId, resetSession: resetSessionWithConfig});
```

With:

```ts
  } = useStreamChat({sessionId, createNewSessionId: createNewSessionIdWithConfig});
```

Update the `displayError` (line 59):

Replace:

```ts
const displayError = sessionError ?? streamError;
```

With:

```ts
const displayError = createNewSessionIdError ?? streamError;
```

Update the `dismissError` callback (lines 61-64):

Replace:

```ts
const dismissError = useCallback(() => {
  clearSessionError();
  clearStreamError();
}, [clearSessionError, clearStreamError]);
```

With:

```ts
const dismissError = useCallback(() => {
  clearCreateNewSessionIdError();
  clearStreamError();
}, [clearCreateNewSessionIdError, clearStreamError]);
```

- [ ] **Step 4: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run existing tests**

Run: `cd apps/frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useSessionId.ts apps/frontend/src/pages/chat/hooks/useStreamChat.ts apps/frontend/src/pages/chat/ChatPage.tsx
git rm apps/frontend/src/pages/chat/hooks/useSession.ts
git commit -m "refactor(frontend): rename useSession to useSessionId with clearer export names"
```

---

### Task 2: Add `clearTitle` to `useSessionTitle` and `clearSessionId` to `useSessionId`

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useSessionId.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useSessionTitle.ts`

- [ ] **Step 1: Add `clearSessionId` to `useSessionId`**

`clearSessionId` was already added in Task 1. Verify it exists in the return value of `useSessionId`.

- [ ] **Step 2: Add `clearTitle` to `useSessionTitle`**

In `apps/frontend/src/pages/chat/hooks/useSessionTitle.ts`, add before the return statement:

```ts
const clearTitle = useCallback(() => {
  setTitle(null);
  titleRequestedRef.current = false;
}, []);
```

Update the return to include `clearTitle`:

```ts
return {title, clearTitle};
```

The `useCallback` import is already present (add it if not — check the existing imports).

- [ ] **Step 3: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useSessionTitle.ts
git commit -m "feat(frontend): add clearTitle to useSessionTitle"
```

---

### Task 3: Create `useSessionLifecycle` hook

**Files:**

- Create: `apps/frontend/src/pages/chat/hooks/useSessionLifecycle.ts`

- [ ] **Step 1: Create the hook file**

Create `apps/frontend/src/pages/chat/hooks/useSessionLifecycle.ts`:

```ts
import {useCallback} from 'react';

interface UseSessionLifecycleOptions {
  stopGeneration: () => void;
  clearSessionId: () => void;
  clearMessages: () => void;
  clearTitle: () => void;
  clearStreamError: () => void;
  clearMaxRoundsReached: () => void;
}

/** Orchestrates session transitions (new session, future: switch session). */
export function useSessionLifecycle({
  stopGeneration,
  clearSessionId,
  clearMessages,
  clearTitle,
  clearStreamError,
  clearMaxRoundsReached,
}: UseSessionLifecycleOptions) {
  const startNewSession = useCallback(() => {
    stopGeneration();
    clearSessionId();
    clearMessages();
    clearTitle();
    clearStreamError();
    clearMaxRoundsReached();
  }, [
    stopGeneration,
    clearSessionId,
    clearMessages,
    clearTitle,
    clearStreamError,
    clearMaxRoundsReached,
  ]);

  return {startNewSession};
}
```

- [ ] **Step 2: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useSessionLifecycle.ts
git commit -m "feat(frontend): add useSessionLifecycle orchestrator hook"
```

---

### Task 4: Create `TitleBar` component

**Files:**

- Create: `apps/frontend/src/pages/chat/components/TitleBar/TitleBarView.tsx`
- Create: `apps/frontend/src/pages/chat/components/TitleBar/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/TitleBar/index.ts`

- [ ] **Step 1: Create the CSS module**

Create `apps/frontend/src/pages/chat/components/TitleBar/styles.module.css`:

```css
.container {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 12px 16px;
}

.title {
  font-size: 0.85em;
  font-weight: 500;
  text-align: center;
  color: var(--muted);
}

.left {
  justify-self: start;
}

.right {
  justify-self: end;
}
```

Layout uses CSS Grid `1fr auto 1fr`. Left and right slots are reserved for future use (left-aligned and right-aligned respectively). Title in the center `auto` column stays perfectly centered regardless of side content width.

- [ ] **Step 2: Create the view component**

Create `apps/frontend/src/pages/chat/components/TitleBar/TitleBarView.tsx`:

```tsx
import {Button, Tooltip} from '@heroui/react';
import {MessageSquarePlus} from 'lucide-react';

import styles from './styles.module.css';

interface TitleBarViewProps {
  title: string | null;
  onNewSession: () => void;
  newSessionDisabled: boolean;
}

export function TitleBarView({
  title,
  onNewSession,
  newSessionDisabled,
}: TitleBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left} />
      <h2 className={styles.title}>{title ?? 'New Session'}</h2>
      <div className={styles.right}>
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='New session'
              isDisabled={newSessionDisabled}
              onPress={onNewSession}
            >
              <MessageSquarePlus size={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>New session</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the index export**

Create `apps/frontend/src/pages/chat/components/TitleBar/index.ts`:

```ts
export {TitleBarView} from './TitleBarView.js';
```

- [ ] **Step 4: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/components/TitleBar/
git commit -m "feat(frontend): add TitleBar component with new session button"
```

---

### Task 5: Wire everything together

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/styles.module.css`

- [ ] **Step 1: Update `ChatPageView` to use `TitleBar`**

Replace the full contents of `apps/frontend/src/pages/chat/ChatPageView.tsx`:

```tsx
import {ScrollShadow} from '@heroui/react';
import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {InfoBar} from './components/InfoBar/index.js';
import {MessageList} from './components/MessageList/index.js';
import {SessionSetup} from './components/SessionSetup/index.js';
import {TitleBarView} from './components/TitleBar/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  title: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  onSend: (content: string) => void;
  onStop: () => void;
  onNewSession: () => void;
  newSessionDisabled: boolean;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  title,
  messages,
  isStreaming,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onSend,
  onStop,
  onNewSession,
  newSessionDisabled,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
  const isEmpty = messages.length === 0;

  return (
    <div className={styles.page}>
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
      />
      <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
        {isEmpty && !sessionId ? (
          <div className={styles.emptyState}>
            <SessionSetup />
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </ScrollShadow>
      {sessionId && <InfoBar />}
      <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
    </div>
  );
}
```

- [ ] **Step 2: Remove `.title` from `styles.module.css`**

In `apps/frontend/src/pages/chat/styles.module.css`, remove the `.title` block (lines 7-13):

```css
.title {
  padding: 12px 16px;
  font-size: 0.85em;
  font-weight: 500;
  text-align: center;
  color: var(--muted);
}
```

The file should be left with `.page`, `.messageListWrapper`, and `.emptyState` only.

- [ ] **Step 3: Update `ChatPageContent` in `ChatPage.tsx`**

Replace the full contents of `apps/frontend/src/pages/chat/ChatPage.tsx`:

```tsx
import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {useSessionConfig} from './hooks/useSessionConfig.js';
import {useSessionId} from './hooks/useSessionId.js';
import {useSessionLifecycle} from './hooks/useSessionLifecycle.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Wraps content in providers. */
export function ChatPage() {
  return (
    <ChatEventBusProvider>
      <SessionConfigProvider>
        <ChatPageContent />
      </SessionConfigProvider>
    </ChatEventBusProvider>
  );
}

/** Inner content that uses contexts. */
function ChatPageContent() {
  const {
    sessionId,
    createNewSessionIdError,
    createNewSessionId,
    clearSessionId,
    clearCreateNewSessionIdError,
  } = useSessionId();

  const {messages, clearMessages} = useMessages();
  const {title, clearTitle} = useSessionTitle();

  const {selectedWorkspace, selectedExtraAllowedPaths} = useSessionConfig();

  const createNewSessionIdWithConfig = useCallback(
    async () =>
      createNewSessionId({
        workspace: selectedWorkspace,
        extraAllowedPaths:
          selectedExtraAllowedPaths.length > 0
            ? selectedExtraAllowedPaths
            : undefined,
      }),
    [createNewSessionId, selectedWorkspace, selectedExtraAllowedPaths],
  );

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    createNewSessionId: createNewSessionIdWithConfig,
  });

  const {startNewSession} = useSessionLifecycle({
    stopGeneration,
    clearSessionId,
    clearMessages,
    clearTitle,
    clearStreamError,
    clearMaxRoundsReached,
  });

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const displayError = createNewSessionIdError ?? streamError;

  const dismissError = useCallback(() => {
    clearCreateNewSessionIdError();
    clearStreamError();
  }, [clearCreateNewSessionIdError, clearStreamError]);

  const newSessionDisabled =
    (sessionId === null && messages.length === 0) || isStreaming;

  return (
    <ChatPageView
      title={title}
      messages={messages}
      isStreaming={isStreaming}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      sessionId={sessionId}
      onSend={(content) => {
        void sendMessage(content);
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }}
      onStop={stopGeneration}
      onNewSession={startNewSession}
      newSessionDisabled={newSessionDisabled}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
```

- [ ] **Step 4: Verify types compile**

Run: `cd apps/frontend && npx tsc --noEmit`
Expected: No errors.

- [ ] **Step 5: Run existing tests**

Run: `cd apps/frontend && npx vitest run`
Expected: All tests pass.

- [ ] **Step 6: Run lint and format**

Run: `cd apps/frontend && npx eslint src/ && npx prettier --check src/`
Expected: No errors.

- [ ] **Step 7: Manual verification**

Start the dev server and verify:

1. Title bar shows "New Session" with the `MessageSquarePlus` button on the right
2. Button is disabled when on empty session page (no messages, no session)
3. Send a message → session starts → button becomes enabled
4. Click button → page resets to empty state, title clears
5. Button is disabled while streaming
6. Title remains visually centered

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPageView.tsx apps/frontend/src/pages/chat/ChatPage.tsx apps/frontend/src/pages/chat/styles.module.css
git commit -m "feat(frontend): wire TitleBar and session lifecycle into chat page"
```
