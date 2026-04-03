# Lazy Chat Session Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Defer chat session creation from page mount to first message send.

**Architecture:** Remove the `useEffect` auto-creation in `useSession`, pass `resetSession` into `useStreamChat`, and call it lazily inside `sendMessage` when `sessionId` is `null`. Three files changed, no backend changes.

**Tech Stack:** React 19, TypeScript, Vitest

---

### Task 1: Remove eager session creation from `useSession`

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useSession.ts`

- [ ] **Step 1: Update `useSession.ts` to remove mount-time creation**

Remove the `useEffect`, `useRef` import, and `initRef` guard. Update the JSDoc. The hook becomes a simple state holder with an imperative `resetSession` function.

```typescript
import {useCallback, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

/** Manages the chat session lifecycle. Session is created on demand via `resetSession`. */
export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetSession = useCallback(async () => {
    setError(null);
    try {
      const id = await createSession();
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

  const clearSessionError = useCallback(() => {
    setError(null);
  }, []);

  return {sessionId, sessionError: error, resetSession, clearSessionError};
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: No errors (the return type of `useSession` hasn't changed, so consumers still compile).

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useSession.ts
git commit -m "refactor(frontend): remove eager session creation from useSession"
```

---

### Task 2: Make `useStreamChat` create session lazily on first message

**Files:**

- Modify: `apps/frontend/src/pages/chat/hooks/useStreamChat.ts`

- [ ] **Step 1: Add `resetSession` to `UseStreamChatOptions` and use it in `sendMessage`**

The key change: when `sessionId` is `null`, call `resetSession()` to get a fresh ID. Use a local variable `activeSessionId` to avoid relying on stale React state within the same callback execution.

```typescript
import {useCallback, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import type {useMessages} from './useMessages.js';
import type {useSession} from './useSession.js';

type MessagesHook = ReturnType<typeof useMessages>;
type SessionHook = ReturnType<typeof useSession>;

interface UseStreamChatOptions {
  sessionId: SessionHook['sessionId'];
  resetSession: SessionHook['resetSession'];
  addUserMessage: MessagesHook['addUserMessage'];
  appendAssistantText: MessagesHook['appendAssistantText'];
  pushToolExecutionStart: MessagesHook['pushToolExecutionStart'];
  pushToolExecutionEnd: MessagesHook['pushToolExecutionEnd'];
  removeLastAssistantMessageIfEmpty: MessagesHook['removeLastAssistantMessageIfEmpty'];
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  resetSession,
  addUserMessage,
  appendAssistantText,
  pushToolExecutionStart,
  pushToolExecutionEnd,
  removeLastAssistantMessageIfEmpty,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const activeSessionId = sessionId ?? (await resetSession());
      if (!activeSessionId) return;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      addUserMessage(trimmed);

      try {
        const stream = streamChatCompletion(activeSessionId, trimmed);

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              appendAssistantText(event.content);
              break;
            case 'tool-execute-start':
              pushToolExecutionStart({
                type: 'tool-execution-start',
                callId: event.callId,
                toolName: event.toolName,
                displayName: event.displayName,
                arguments: event.arguments,
              });
              break;
            case 'tool-execute-end':
              pushToolExecutionEnd({
                type: 'tool-execution-end',
                callId: event.callId,
                result: event.result,
                isError: event.isError,
              });
              break;
            case 'done':
              if (event.reason === 'max_rounds_reached') {
                setMaxRoundsReached(true);
              }
              removeLastAssistantMessageIfEmpty();
              break;
            case 'error':
              removeLastAssistantMessageIfEmpty();
              setStreamError(event.message);
              break;
          }
        }
      } catch (e: unknown) {
        console.error('Chat completion failed', e);
        removeLastAssistantMessageIfEmpty();
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setStreamError(message);
      } finally {
        removeLastAssistantMessageIfEmpty();
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      resetSession,
      addUserMessage,
      appendAssistantText,
      pushToolExecutionStart,
      pushToolExecutionEnd,
      removeLastAssistantMessageIfEmpty,
    ],
  );

  const clearStreamError = useCallback(() => {
    setStreamError(null);
  }, []);

  const clearMaxRoundsReached = useCallback(() => {
    setMaxRoundsReached(false);
  }, []);

  return {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    clearStreamError,
    clearMaxRoundsReached,
  };
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: Compile error in `ChatPage.tsx` because `useStreamChat` now requires `resetSession`. This is expected and fixed in Task 3.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/src/pages/chat/hooks/useStreamChat.ts
git commit -m "feat(frontend): create session lazily on first message in useStreamChat"
```

---

### Task 3: Wire up `ChatPage` and fix input disabled logic

**Files:**

- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`

- [ ] **Step 1: Pass `resetSession` to `useStreamChat` and update `isInputDisabled`**

Destructure `resetSession` from `useSession`, pass it to `useStreamChat`, and change `isInputDisabled` to only depend on `isStreaming`.

```typescript
import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Composes hooks and passes state to the view. */
export function ChatPage() {
  const {sessionId, sessionError, resetSession, clearSessionError} =
    useSession();

  const {
    messages,
    addUserMessage,
    appendAssistantText,
    pushToolExecutionStart,
    pushToolExecutionEnd,
    removeLastAssistantMessageIfEmpty,
  } = useMessages();

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    resetSession,
    addUserMessage,
    appendAssistantText,
    pushToolExecutionStart,
    pushToolExecutionEnd,
    removeLastAssistantMessageIfEmpty,
  });

  const scrollRef = useAutoScroll();

  const displayError = sessionError ?? streamError;

  const dismissError = useCallback(() => {
    clearSessionError();
    clearStreamError();
  }, [clearSessionError, clearStreamError]);

  return (
    <ChatPageView
      messages={messages}
      isInputDisabled={isStreaming}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      onSend={(content) => {
        void sendMessage(content);
      }}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
```

- [ ] **Step 2: Verify TypeScript compiles**

Run: `cd apps/frontend && bunx tsc -b --noEmit`
Expected: No errors.

- [ ] **Step 3: Run existing tests**

Run: `cd apps/frontend && bun run test`
Expected: All existing tests pass (the changes don't affect `transformMessages`, `parseSseStream`, or `defineRoutes`).

- [ ] **Step 4: Run production build**

Run: `cd apps/frontend && bun run build`
Expected: Build succeeds with exit code 0.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/chat/ChatPage.tsx
git commit -m "feat(frontend): wire lazy session creation in ChatPage"
```

---

### Task 4: Manual verification

- [ ] **Step 1: Start the dev server and open Chat page**

Open the browser Network tab, navigate to the Chat page.
Expected: **No** `POST /api/chat/session` request is made.

- [ ] **Step 2: Send a message**

Type a message and press Enter.
Expected: `POST /api/chat/session` fires first, then `POST /api/chat/session/:id/completions` fires. The assistant responds normally.

- [ ] **Step 3: Send a second message**

Type another message and press Enter.
Expected: Only `POST /api/chat/session/:id/completions` fires (no new session creation).

- [ ] **Step 4: Navigate away and back**

Click to another page (e.g., Settings), then click back to Chat.
Expected: No `POST /api/chat/session` request on return. Message list is empty (fresh page).
