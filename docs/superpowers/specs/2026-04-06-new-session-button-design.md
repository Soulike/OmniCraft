# New Session Button & TitleBar Extraction

## Goal

Add an icon button to the Chat page title bar that creates a new session (resets
current state). Extract the current inline `<h2>` title into a dedicated
`TitleBar` component.

## Design Decisions

- **Reset strategy**: Direct reset (clear all state in-place). No persistence or
  history for now.
- **Icon**: `MessageSquarePlus` from `lucide-react`.
- **Confirmation dialog**: None. Click resets immediately.
- **Session lifecycle orchestration**: A dedicated `useSessionLifecycle` hook
  owns the "when to clear what" logic. Data hooks stay pure.
- **Future-proofing**: The orchestrator hook is the single place to add
  `switchSession(id)` later. Data hooks expose clear/set methods and never
  watch `sessionId` themselves.

## Components

### 1. TitleBar (new component)

**Location**: `pages/chat/components/TitleBar/`

```
TitleBar/
  index.ts
  TitleBarView.tsx
  styles.module.css
```

**Props**:

```ts
interface TitleBarViewProps {
  title: string | null;
  onNewSession: () => void;
  newSessionDisabled: boolean; // true when already in empty state or streaming
}
```

**Layout**: Flexbox row. Title centered. Button right-aligned (absolute
positioning or `margin-left: auto` trick with invisible left spacer for true
centering).

**Button**: HeroUI `Button` with `isIconOnly`, `variant="ghost"`, `size="sm"`,
`aria-label="New session"`. Contains `<MessageSquarePlus size={16} />`.

**Styling**: Inherits the current `.title` styles (padding, font-size, color)
for the title text. CSS Modules, no Tailwind.

### 2. useSessionLifecycle (new hook)

**Location**: `pages/chat/hooks/useSessionLifecycle.ts`

**Purpose**: Orchestrates session transitions. Takes clear/set functions from
data hooks and exposes high-level actions.

```ts
interface UseSessionLifecycleOptions {
  clearSessionId: () => void;
  clearMessages: () => void;
  clearTitle: () => void;
  stopGeneration: () => void;
  clearStreamError: () => void;
  clearMaxRoundsReached: () => void;
}

interface SessionLifecycle {
  startNewSession: () => void;
  // Future: switchSession: (id: string) => Promise<void>;
}
```

**`startNewSession` flow**:

1. `stopGeneration()` — abort any in-flight SSE stream
2. `clearSessionId()` — set sessionId to null
3. `clearMessages()` — empty the message array
4. `clearTitle()` — set title to null
5. `clearStreamError()` — clear any stream error
6. `clearMaxRoundsReached()` — clear max-rounds flag

All calls are synchronous state setters, React batches them into one render.

**Future `switchSession(id)` sketch** (not implemented now):

1. Run all the clears above
2. Fetch session data from backend (messages, title)
3. Set messages and title from fetched data
4. Set sessionId to the target id

## Changes to Existing Code

### useSession.ts → useSessionId.ts (rename)

Rename hook from `useSession` to `useSessionId`. Rename all return values:

- `resetSession` → `createNewSessionId`
- `sessionError` → `createNewSessionIdError`
- `clearSessionError` → `clearCreateNewSessionIdError`

Add `clearSessionId` — sets sessionId to null and clears error:

```ts
const clearSessionId = useCallback(() => {
  setSessionId(null);
  setError(null);
}, []);
```

Return `clearSessionId` alongside existing exports.

Update consumers:

- `ChatPage.tsx` — import path and destructured names
- `hooks/useStreamChat.ts` — import type path and type alias

### useSessionTitle.ts

Add `clearTitle` — resets title and the `titleRequestedRef`:

```ts
const clearTitle = useCallback(() => {
  setTitle(null);
  titleRequestedRef.current = false;
}, []);
```

Return `clearTitle` alongside existing exports.

### useMessages.ts

Already exposes `clearMessages`. No changes needed.

### ChatPageView.tsx

- Replace inline `<h2 className={styles.title}>...</h2>` with `<TitleBar>`.
- Add `onNewSession` and `newSessionDisabled` to props.
- Remove `.title` from `styles.module.css`.

### ChatPage.tsx (ChatPageContent)

- Destructure new clear functions from hooks.
- Create `useSessionLifecycle` with all clear functions.
- Pass `startNewSession` down to `ChatPageView` as `onNewSession`.
- Compute `newSessionDisabled`: `true` when `sessionId === null && messages.length === 0`
  (already in empty state), or when `isStreaming` is true.

## File Summary

| File                                    | Action                                                                |
| --------------------------------------- | --------------------------------------------------------------------- |
| `components/TitleBar/TitleBarView.tsx`  | Create                                                                |
| `components/TitleBar/styles.module.css` | Create                                                                |
| `components/TitleBar/index.ts`          | Create                                                                |
| `hooks/useSessionLifecycle.ts`          | Create                                                                |
| `hooks/useSession.ts`                   | Rename to `useSessionId.ts`, add `clearSessionId`, rename all exports |
| `hooks/useStreamChat.ts`                | Update import type for renamed hook                                   |
| `hooks/useSessionTitle.ts`              | Add `clearTitle`                                                      |
| `ChatPageView.tsx`                      | Replace h2 with TitleBar                                              |
| `ChatPage.tsx`                          | Wire up useSessionLifecycle, update imports                           |
| `styles.module.css`                     | Remove `.title`                                                       |
