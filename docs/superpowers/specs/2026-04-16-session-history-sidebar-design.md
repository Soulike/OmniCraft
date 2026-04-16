# Session History Sidebar

## Goal

Add a collapsible sidebar to the Chat page showing historical sessions. Users
can see, resume, and delete past sessions. Relates to
[issue #143](https://github.com/Soulike/OmniCraft/issues/143).

## Design Decisions

- **Sidebar component**: A reusable `CollapsibleSidebar` controlled component in
  `components/`. Default expanded, collapsible to a narrow strip with an expand
  button.
- **Session list**: HeroUI `ListBox` with `selectionMode="single"`. Chosen over
  `Tabs` because sessions are dynamic data with per-item actions (delete), not
  fixed navigation sections.
- **Delete confirmation**: HeroUI `Popover` with confirm/cancel buttons.
  Lightweight, doesn't block the view.
- **Icons**: `lucide-react` — consistent with existing usage (e.g.,
  `MessageSquarePlus`, `Code` in TitleBar).
- **No new Context**: Session list state lives inside the sidebar component via
  `useState` + `useEffect`. No global context needed.
- **New session button**: Stays in TitleBar, not moved. Sidebar is purely for
  browsing and switching between historical sessions.

## Components

### 1. CollapsibleSidebar (new shared component)

**Location**: `components/CollapsibleSidebar/`

```
CollapsibleSidebar/
  index.ts
  CollapsibleSidebar.tsx
  styles.module.css
```

**Props**:

```ts
interface CollapsibleSidebarProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  headerExtra?: ReactNode;
  children: ReactNode;
}
```

**Behavior**:

- **Expanded** (`isOpen=true`): Renders header bar (title + headerExtra +
  collapse button) and children content area. Fixed width via CSS.
- **Collapsed** (`isOpen=false`): Renders a narrow strip with only an expand
  button.
- **Icons**: `PanelLeftClose` (collapse), `PanelLeftOpen` (expand) from
  `lucide-react`.
- Layout uses CSS Modules. No margin/padding on the outer element — parent
  controls placement.

### 2. SessionSidebar (new chat-page component)

**Location**: `pages/chat/components/SessionSidebar/`

```
SessionSidebar/
  index.ts
  SessionSidebar.tsx          # Container: fetches data, manages state
  SessionSidebarView.tsx      # View: renders CollapsibleSidebar + ListBox
  components/
    SessionItem/
      index.ts
      SessionItem.tsx         # Container: manages delete popover state
      SessionItemView.tsx     # View: renders item content + delete button
      styles.module.css
  hooks/
    useSessionList.ts         # Fetches & caches session list from API
  styles.module.css
```

**SessionSidebar.tsx** (container):

- Manages `isOpen` state for the sidebar (default: `true`).
- Uses `useSessionList()` hook to fetch sessions.
- Gets `sessionId` from `useSessionId()` context to highlight current session.
- Passes `onSelectSession` that calls `navigate(ROUTES.chat(sessionId))`.

**SessionSidebarView.tsx** (view):

```ts
interface SessionSidebarViewProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: SessionMetadata[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<void>;
}
```

- Wraps content in `<CollapsibleSidebar>`.
- Renders `<ListBox>` with `selectionMode="single"`,
  `selectedKeys={currentSessionId}`, `onAction={onSelectSession}`.
- Each item renders `<SessionItem>`.

**SessionItem**:

- Shows session title (truncated with ellipsis).
- Delete button (`Trash2` icon from lucide-react) visible on hover via CSS.
- Click on delete opens a `<Popover>` with "Delete session?" heading, message,
  Cancel and Delete buttons.
- Delete button calls `DELETE /api/chat/session/:id`, then refreshes the list.
- If deleting the current session, navigates to `/chat`.

### 3. useSessionList hook

**Location**: `pages/chat/components/SessionSidebar/hooks/useSessionList.ts`

```ts
interface UseSessionListReturn {
  sessions: SessionMetadata[];
  isLoading: boolean;
  error: string | null;
  refresh: () => void;
}
```

- Calls `listSessions()` on mount and exposes a `refresh()` for manual reload.
- Called again when sidebar becomes visible or after delete.

## API Layer

**Location**: `api/chat/chat.ts` — add two functions:

```ts
/** Fetches the list of past sessions. */
async function listSessions(
  offset: number,
  limit: number,
): Promise<ListSessionsResponse>;

/** Deletes a session by ID. */
async function deleteSession(id: string): Promise<void>;
```

- `listSessions`: `GET /api/chat/sessions?offset=0&limit=50`, validates response
  with `listSessionsResponseSchema`.
- `deleteSession`: `DELETE /api/chat/session/${id}`, expects 204 No Content.

## Layout Changes

### ChatPageView

Current layout (vertical flex):

```
┌──────────────────────────────┐
│ TitleBar                     │
│ ScrollShadow (messages)      │
│ InfoBar                      │
│ ChatInput                    │
└──────────────────────────────┘
```

New layout (horizontal flex wrapping existing content):

```
┌────────────┬─────────────────┐
│            │ TitleBar        │
│  Session   │ ScrollShadow   │
│  Sidebar   │ InfoBar        │
│            │ ChatInput      │
└────────────┴─────────────────┘
```

- `ChatPageView` gets a new outer `div` with `display: flex`.
- `SessionSidebar` is the left child.
- Existing page content (alerts, title bar, messages, input) is the right child
  with `flex: 1`.

### TitleBar Changes

- No changes. New session button and VSCode button stay as-is.

## Route Changes

The route `/chat/:sessionId?` already supports both `/chat` and
`/chat/:sessionId`. No router changes needed. When a user clicks a session in
the sidebar, navigate to `/chat/:sessionId`. The existing `useStreamChat` hook
replays history via `GET /events?from=0`.

## Data Flow

1. User opens `/chat` → sidebar loads session list via `listSessions()`.
2. User clicks a session → navigate to `/chat/:sessionId` → `SessionIdContext`
   picks up new `sessionId` from URL params → `useStreamChat` subscribes to
   events from index 0 → messages replay.
3. User clicks delete → Popover confirms → `deleteSession(id)` →
   `useSessionList.refresh()` → if deleted session was current, navigate to
   `/chat`.
4. User clicks new session button in TitleBar → same flow as before
   (`startNewSession` from `useSessionLifecycle`).
5. When a new session gets a title (via `session-title` SSE event), the sidebar
   list should refresh to show the updated title.

## File Summary

New files:

- `components/CollapsibleSidebar/index.ts`
- `components/CollapsibleSidebar/CollapsibleSidebarView.tsx`
- `components/CollapsibleSidebar/styles.module.css`
- `pages/chat/components/SessionSidebar/index.ts`
- `pages/chat/components/SessionSidebar/SessionSidebar.tsx`
- `pages/chat/components/SessionSidebar/SessionSidebarView.tsx`
- `pages/chat/components/SessionSidebar/styles.module.css`
- `pages/chat/components/SessionSidebar/components/SessionItem/index.ts`
- `pages/chat/components/SessionSidebar/components/SessionItem/SessionItem.tsx`
- `pages/chat/components/SessionSidebar/components/SessionItem/SessionItemView.tsx`
- `pages/chat/components/SessionSidebar/components/SessionItem/styles.module.css`
- `pages/chat/components/SessionSidebar/hooks/useSessionList.ts`

Modified files:

- `api/chat/chat.ts` — add `listSessions()`, `deleteSession()`
- `pages/chat/ChatPage.tsx` — pass sidebar-related props
- `pages/chat/ChatPageView.tsx` — add sidebar to layout
- `pages/chat/styles.module.css` — horizontal flex wrapper
