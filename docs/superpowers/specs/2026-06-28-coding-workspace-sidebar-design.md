# Coding Sidebar: Group Sessions by Workspace

## Goal

Restructure the Coding page sidebar from a **flat, per-session** list into a
**per-workspace grouped** list: each configured workspace is a collapsible group
holding its sessions, and a new task is started from a `+` on a workspace group
(opening a modal) rather than from an inline form in the empty main pane.

Scope is Coding only — the Chat page keeps its flat session list unchanged.

## Design Decisions

UI decisions validated via visual mockups during brainstorming:

- **Grouping source**: the **workspace list** drives the groups (not the session
  list), so workspaces with zero sessions still appear. Sessions are bucketed
  under their workspace by `workingDirectory`.
- **Orphan sessions** (a `workingDirectory` not in the configured workspace
  list) fall into a single **Ungrouped** group, shown **only when
  non-empty**, with **no** `+`.
- **Expand behavior**: independent (multiple groups may be open at once;
  `allowsMultiple`). On first load, **only the active session's group** is
  expanded and the active session is highlighted/scrolled into view.
- **Group header (compact, single line)**: `⌄ {basename} ·{N}  [+]`. Label is the
  workspace path's **basename**; full path on hover. `·{N}` session count. The
  `+` is **always visible** (muted, brightens on hover); clicking it
  `stopPropagation`s so it does not toggle expand.
- **Empty workspace**: expanded body shows a single muted line "No sessions yet".
- **New-session modal (read-only workspace context)**: opened from a group's
  `+`. Title "New task in {workspace}"; the workspace is shown as a **read-only**
  card (icon + basename + path, not editable); a single Task textarea is the only
  input; footer is Cancel + "Start task" (accent primary). The workspace cannot be
  changed inside the modal — it is fixed by which `+` was clicked.
- **Empty main pane**: when no session is active, the main area shows a neutral
  centered placeholder ("Select a session, or click + on a workspace to start a
  new task."), with no inline task form.
- **Path normalization**: bucket key compares `workingDirectory` against
  workspace `path` after a trailing-slash normalization, then exact match.

Backend / data decisions:

- **Coding session list drops pagination**: the frontend loads **all** coding
  sessions at once and buckets client-side. The volume is bounded in practice
  (finished sessions are deleted manually). Only the **coding** endpoint changes;
  the **chat** endpoint keeps its paginated schema and `useInfiniteScroll`.
- **No new "list workspaces" endpoint** — reuse the existing
  `GET /api/settings/file-access/workspaces` (already loaded by
  `SessionConfigProvider`).

Settings decision:

- Workspaces settings move from the **File Access** group into a new **Coding**
  settings group, alongside **Coding Agent** (moved out of LLM). This is a
  navigation/route re-nesting only — the underlying settings keys
  (`fileAccess.workspaces`, the coding LLM keys) and their GET/PUT endpoints are
  unchanged.

## Architecture & Data Flow

```
CodingPage (owns create-session flow + modal state)
└── CodingPageView
    ├── CollapsibleSidebar title="Workspaces"
    │   └── WorkspaceSessionList  onNewSession={(ws) => openModal(ws)}
    │       ├── useAllCodingSessions()      // load ALL coding sessions
    │       ├── useWorkspaceGroups(...)      // pure bucketing → ordered groups (orphan last)
    │       └── WorkspaceGroup[]             // HeroUI Disclosure per workspace
    │           └── SessionItem[]            // reused from chat-session module
    └── main
        ├── TitleBarView (no new-session button on coding)
        ├── empty placeholder | StreamingMessageDisplay
        └── NewSessionModal (read-only workspace + task textarea)
```

Data flow for grouping:

1. `SessionConfigProvider` loads `workspaces: Workspace[]` (existing).
2. `useAllCodingSessions()` loads every coding session's metadata via the new
   param-less `listAllSessions()` in `@/api/coding`, and refreshes on the
   `session-created` / `session-title` event-bus events.
3. `useWorkspaceGroups(workspaces, sessions)` (pure) buckets sessions into a
   single ordered `WorkspaceGroup[]` (configured workspaces, then the orphan group
   last iff non-empty). Separately, the container derives the active session's
   workspace (via the shared `normalizeWorkspacePath`) to seed which group is
   expanded on first load — expansion is view state, kept out of the pure grouping
   hook.

Data flow for creation:

1. User clicks `+` on workspace `ws` → `onNewSession(ws)` → `CodingPage` opens
   `NewSessionModal` targeted at `ws`.
2. Submit → existing `sendMessageToNewSession(task, { workspace: ws })` →
   `POST /api/coding/session` → navigate to `/coding/{id}`.
3. `session-created` refreshes the list; the new session's group expands and the
   session highlights.

## Components

### 1. WorkspaceSessionList (new) — `pages/coding/components/WorkspaceSessionList/`

Coding-specific (depends on the workspace concept, coding session loading, and the
coding create flow), so it lives under `pages/coding`. It reuses `SessionItem`
(exported from the chat-session module's public index) and the module hooks
`useSessionConfig` / `useSessionId` / `useChatEventBus`. Sessions are **loaded and
deleted by calling `@/api/coding` directly** — not through the agent-agnostic
`ChatSessionApiContext`, which stays paginated for chat. MVVM:

```
WorkspaceSessionList/
  index.ts
  WorkspaceSessionList.tsx          // container: wires hooks → view
  WorkspaceSessionListView.tsx      // stateless: groups, loading, error, empty
  helpers/
    normalize-workspace-path.ts     // shared bucket-key helper (trailing-slash)
  hooks/
    useAllCodingSessions.ts         // load-all + event-bus refresh + delete
    useWorkspaceGroups.ts           // pure bucketing (unit-tested)
  components/
    WorkspaceGroup/                 // one HeroUI Disclosure per workspace
      index.ts
      WorkspaceGroupView.tsx
      styles.module.css
  styles.module.css
```

**Props**:

```ts
interface WorkspaceSessionListProps {
  onNewSession: (workspacePath: string) => void;
}
```

**Collapsible primitive**: HeroUI `DisclosureGroup` (`allowsMultiple`) with one
`Disclosure` per workspace; the header composes a custom trigger (chevron +
basename + count) plus a sibling `+` `Button` (`isIconOnly`, `variant="ghost"`,
`size="sm"`, tooltip `New task`) that calls `onNewSession` with `stopPropagation`. Hand-roll only if
the trigger composition fights the always-visible `+` (design language P6).

**WorkspaceGroupView** renders header + panel. Panel maps the group's sessions to
the existing `SessionItem`; empty groups render a muted "No sessions yet" line.
The Ungrouped group renders the same way but without the `+`.

**Footer**: a `Manage workspaces…` link at the bottom of the list navigates to the
workspaces settings route (`ROUTES.settings.coding.workspaces()`, see Settings
Re-nest).

### 2. useWorkspaceGroups (new, pure) — `hooks/useWorkspaceGroups.ts`

Pure grouping only — no notion of the active session. Returns a **single ordered
list**; the orphan Ungrouped group, when present, is simply the trailing entry
whose `workspace` is `undefined` (the optional field already encodes it — no
separate wrapper needed):

```ts
interface WorkspaceGroup {
  /** undefined ⇒ the orphan Ungrouped group (rendered without a `+`). */
  workspace?: Workspace;
  sessions: readonly SessionMetadata[];
}

// configured workspaces in config order, then the orphan group iff it has sessions
function useWorkspaceGroups(
  workspaces: readonly Workspace[],
  sessions: readonly SessionMetadata[],
): readonly WorkspaceGroup[];
```

Buckets by `normalizeWorkspacePath(workingDirectory)`. That same helper is reused
by the container to derive the active session's workspace, so the two can never
drift on normalization. Pure and fully unit-testable.

### 3. NewSessionModal (refactor of TaskDispatchCard) — `pages/coding/components/NewSessionModal/`

Replaces the inline `TaskDispatchCard`. HeroUI `Modal` (opaque overlay). Shows the
target workspace as a **read-only** card and a single Task textarea; the footer is
Cancel and "Start task" (accent primary). Reuses `useTaskDispatchForm` **with the
workspace field removed** (task-only validation).

```ts
interface NewSessionModalProps {
  isOpen: boolean;
  workspace: string; // fixed target, read-only
  onClose: () => void;
  onSubmit: (task: string) => Promise<void>;
}
```

## Backend & Schema Changes (coding only)

### `packages/api-schema/src/chat/schema.ts`

Add a coding-specific, non-paginated list response; leave the chat
`listSessionsQuerySchema` / `listSessionsResponseSchema` untouched:

```ts
export const listCodingSessionsResponseSchema = z.object({
  sessions: z.array(sessionMetadataSchema),
});
export type ListCodingSessionsResponse = z.infer<
  typeof listCodingSessionsResponseSchema
>;
```

### `apps/backend/src/models/agent-store/coding-agent-store.ts`

Add `listAllSessionMetadata(): Promise<SessionMetadata[]>` (returns every
session's metadata). Do not change the shared base `listSessionMetadata(offset,
limit)` used by chat.

### `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts`

`listSessions()` takes no args and returns `{ sessions }` via
`listAllSessionMetadata()`.

### `apps/backend/src/dispatcher/coding-agent-session/router.ts`

`GET /coding/sessions` drops the `listSessionsQuerySchema` parse and returns
`{ sessions }`. The chat router is unchanged.

### `apps/frontend/src/api/coding/coding.ts`

Add `listAllSessions(): Promise<ListCodingSessionsResponse>` (param-less, parses
`listCodingSessionsResponseSchema`); remove the old paginated `listSessions`.

## Settings Re-nest (frontend navigation/routing only)

New **Coding** settings group containing **Coding Agent** (moved from LLM) and
**Workspaces** (moved from File Access). LLM keeps only Chat Agent; the empty
File Access group is removed. Settings keys and their endpoints are unchanged; the
default settings redirect (`settings.llm.chat()`) stays valid.

- `routes.ts`: `settings.coding = { agent: {}, workspaces: {} }`; remove
  `settings.llm.coding` and `settings['file-access']`.
- `pages/settings/SettingsPage.tsx`: update `SETTINGS_NAV_ITEMS`.
- `router/router.tsx`: update the section route paths.
- `router/lazy-pages.tsx`: update the lazy imports.
- Move folders: `sections/llm/coding` → `sections/coding/agent`;
  `sections/file-access/workspaces` → `sections/coding/workspaces`.

## Changes to Existing Code

### `pages/coding/CodingPage.tsx`

- Own modal state (`isOpen`, `targetWorkspace`); `handleOpenNewSession(ws)`.
- On submit, call the existing `sendMessageToNewSession(task, { workspace })`.
- Remove `selectedWorkspace` usage (creation no longer reads a global selection).

### `pages/coding/CodingPageView.tsx`

- Replace `<SessionList />` with `<WorkspaceSessionList onNewSession=... />`
  (sidebar title `Workspaces`).
- Remove the inline empty-state `<TaskDispatchCard>`; render a neutral centered
  placeholder when `!sessionId`.
- Render `<NewSessionModal>`.
- Stop passing `onNewSession` / `newSessionDisabled` to `TitleBarView`.

### `modules/chat-session/components/TitleBar/TitleBarView.tsx`

- Make `onNewSession?` and `newSessionDisabled?` optional; render the new-session
  button only when `onNewSession` is provided. Chat keeps passing them.

### `modules/chat-session/contexts/SessionConfigContext/SessionConfigProvider.tsx`

- Drop the `selectedWorkspace` selection state; keep loading `workspaces`.

### `modules/chat-session/index.ts`

- Export `SessionItem` for reuse by `WorkspaceSessionList`.

### `modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts`

- Make `listSessions` optional; the coding provider omits it (coding loads via
  `@/api/coding` directly). Chat still provides and consumes it — no chat behavior
  change.

## Edge Cases & Defaults

- Active session's group auto-expands on load; if no active session, all groups
  start collapsed.
- Loading uses the existing `Spinner`; load error reuses the existing error text
  pattern.
- After creation, the targeted group expands and the new session highlights.
- Deleting the last session in a workspace leaves the (empty) group visible.

## Testing

- `useWorkspaceGroups` unit tests: bucketing, trailing-slash normalization,
  trailing Ungrouped group, none when no orphans, counts.
- `useAllCodingSessions`: loads all, refreshes on `session-created` /
  `session-title`.
- `NewSessionModal`: submit calls `onSubmit` with the task and the fixed
  workspace; validates non-empty task.
- Backend: update the coding `listSessions` test for the non-paginated response;
  confirm the chat list test is unaffected.
- `bun run test`, then `lint:all` / `typecheck:all`; `bun dev` and verify in the
  browser in **both** themes.

## File Summary

| File                                                                             | Action                                                                                       |
| -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pages/coding/components/WorkspaceSessionList/**`                                | Create (container, view, hooks, WorkspaceGroup)                                              |
| `modules/chat-session/index.ts`                                                  | Export `SessionItem` for reuse                                                               |
| `modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts`   | Make `listSessions` optional (coding omits)                                                  |
| `modules/chat-session/components/TitleBar/TitleBarView.tsx`                      | Make new-session props optional                                                              |
| `modules/chat-session/contexts/SessionConfigContext/SessionConfigProvider.tsx`   | Drop `selectedWorkspace` selection state                                                     |
| `pages/coding/components/NewSessionModal/**`                                     | Create (refactor of `TaskDispatchCard`)                                                      |
| `pages/coding/components/TaskDispatchCard/**`                                    | Remove (superseded by `NewSessionModal`)                                                     |
| `pages/coding/CodingPage.tsx`                                                    | Modal state + create wiring; drop `selectedWorkspace`                                        |
| `pages/coding/CodingPageView.tsx`                                                | Swap sidebar list; neutral empty pane; render modal; stop passing TitleBar new-session props |
| `packages/api-schema/src/chat/schema.ts`                                         | Add `listCodingSessionsResponseSchema`                                                       |
| `apps/backend/src/models/agent-store/coding-agent-store.ts`                      | Add `listAllSessionMetadata()`                                                               |
| `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts` | `listSessions()` returns all                                                                 |
| `apps/backend/src/dispatcher/coding-agent-session/router.ts`                     | `GET /sessions` drops pagination                                                             |
| `apps/frontend/src/api/coding/coding.ts`                                         | Add `listAllSessions()`; remove paginated `listSessions`                                     |
| `apps/frontend/src/routes.ts`                                                    | Add `settings.coding`; remove `llm.coding`, `file-access`                                    |
| `apps/frontend/src/pages/settings/SettingsPage.tsx`                              | New "Coding" nav group                                                                       |
| `apps/frontend/src/router/router.tsx`                                            | Update settings section paths                                                                |
| `apps/frontend/src/router/lazy-pages.tsx`                                        | Update settings lazy imports                                                                 |
| `apps/frontend/src/pages/settings/sections/llm/coding/**`                        | Move to `sections/coding/agent/**`                                                           |
| `apps/frontend/src/pages/settings/sections/file-access/workspaces/**`            | Move to `sections/coding/workspaces/**`                                                      |
