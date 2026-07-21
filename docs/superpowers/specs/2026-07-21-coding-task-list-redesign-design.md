# Coding Task List Redesign — Design Spec

- **Date:** 2026-07-21
- **Issue:** [#346 Coding Agent Task List Redesign](https://github.com/Soulike/OmniCraft/issues/346)
- **Follow-up:** [#348 per-task running/idle status indicator](https://github.com/Soulike/OmniCraft/issues/348)
- **Surface:** Coding page left sidebar — `apps/frontend/src/pages/coding/components/WorkspaceSessionList/`

---

## 1. Context & problem

The coding "task list" is the left sidebar on the Coding page: a two-level tree of **workspace groups** (a repo/folder) → **sessions**, where each session is a coding-agent **task**. Interactions today: expand/collapse a workspace, click a task to open it, hover a task to reveal a delete (confirm popover), `+` on a workspace to start a new task, "Manage workspaces…" at the bottom.

Two problems (confirmed with the PM/owner):

1. **Tasks are hard to tell apart.** Every row is the same chat-bubble icon + a truncated title — no recency, no differentiation, no sense of which task is active.
2. **The panel feels empty and unstructured.** At realistic density it is mostly dead space; groups default to collapsed so a fresh load shows only headers; the workspace header renders as a full-width grey "ghost button" pill that reads as a permanent selection and fights the real selected-task highlight; small artifacts (`·1` count, a detached `+`) look unfinished.

## 2. Goals / non-goals

**Goals (v1)**

- Make tasks **scannable**: a redesigned two-line row with title + relative recency ("2h ago"), newest-first.
- Make the panel feel **composed** at any density: quiet section headers, a real count treatment, cared-for empty states, and content-on-open (auto-expand).
- Keep the change **contained to the coding sidebar**; do not regress the Chat page.

**Non-goals (v1)**

- Live running/idle status indicator and its polling machinery → **deferred to #348** (we only reserve the visual slot).
- Search/filter, sorting controls, rename, "open in editor" → out of scope.
- Flattening the IA (the workspace→tasks tree is retained by decision).

## 3. Scope split

| Capability                                        | v1 (this spec, #346) | Follow-up (#348) |
| ------------------------------------------------- | -------------------- | ---------------- |
| Row redesign (dot slot, two-line, selected state) | ✅                   | —                |
| Recency ("time ago") via `updatedAt`              | ✅                   | —                |
| Quiet workspace header, count chip, inline `+`    | ✅                   | —                |
| Auto-expand + empty-state polish                  | ✅                   | —                |
| Reserved leading status-dot slot (shown as idle)  | ✅                   | —                |
| `isRunning` data + live polling + running dot     | —                    | ✅               |

## 4. Data changes (backend — recency only)

Recency is essentially free: the list endpoint already `stat()`s every snapshot and computes `mtimeMs` to sort by, then discards it.

- **`packages/api-schema/src/chat/schema.ts`** — add an optional field to `sessionMetadataSchema`:
  ```ts
  updatedAt: z.number().optional(), // epoch ms; last-activity (snapshot mtime, may be fractional)
  ```
  Optional keeps it backward-compatible: `z.object` tolerates its absence, old metadata parses, and existing consumers are untouched.
- **`apps/backend/src/models/agent-store/coding-agent-store.ts`** and **`main-agent-store.ts`** — in `listSessionMetadata`, thread the already-computed `mtime` for each page item into the returned object (inject **after** `sessionMetadataSchema.parse()`, which strips unknown keys), e.g. `return {...parsed, updatedAt: mtime}`. Both stores are updated symmetrically (shared, duplicated code path); no extraction refactor in this change.
- No change to `metadata.json` on disk, no migration, no new events.

**Consequence for Chat:** the shared endpoint now returns `updatedAt` for chat sessions too. That is harmless — the Chat list's `SessionItem` (unchanged, see §5) simply does not read it.

## 5. Frontend architecture

**Decision (owner directive): do not modify the shared `SessionItem`** (`apps/frontend/src/modules/chat-session/.../SessionItem/`). It is used by the Chat page's session list and must stay as-is. The coding list gets its **own new row component**.

### 5.1 New component — `TaskListItem`

A coding-task row, self-contained (owns its own delete confirmation, mirroring `SessionItem.tsx:11-37`). Placed as a subcomponent of `WorkspaceGroup`:

```
WorkspaceSessionList/components/WorkspaceGroup/components/TaskListItem/
  hooks/
    useTaskDeletion.ts          # single concern: delete-confirm popover state (isDeleteOpen, isDeleting, confirm)
  helpers/
    format-relative-time.ts     # pure: (updatedAtMs, nowMs) => label
    format-relative-time.test.ts
  TaskListItem.tsx              # container: composes useTaskDeletion; computes timeLabel via helper + Date.now()
  TaskListItemView.tsx          # stateless view: dot slot + title + time + delete popover UI
  TaskListItemView.test.tsx
  styles.module.css
  index.ts                     # export {TaskListItem} from './TaskListItem.js'
```

- **Container props:** `title: string`, `updatedAt?: number`, `isSelected: boolean`, `onDelete: () => Promise<void>`.
- **View props:** `title`, `timeLabel: string | null`, `isSelected`, `isDeleteOpen`, `onDeleteOpenChange`, `onConfirmDelete`, `isDeleting`.
- No `isRunning` prop in v1; the idle dot is rendered unconditionally. #348 adds the prop + running variant with no layout change.

**`format-relative-time.ts`** — pure `(updatedAtMs: number, nowMs: number) => string`, `now` injected for tests. Buckets: `< 60s` → `just now`; `< 60m` → `{m}m ago`; `< 24h` → `{h}h ago`; `< 48h` → `yesterday`; `< 7d` → `{d}d ago`; else short date (e.g. `Jul 12`). The container computes `timeLabel = updatedAt === undefined ? null : formatRelativeTime(updatedAt, Date.now())`, so a missing `updatedAt` (legacy / pre-deploy sessions) simply omits the meta line. Recomputed on render/reload — no ticking timer (avoids ambient churn).

### 5.2 `WorkspaceGroup` — quiet header + swap row component

`WorkspaceGroupView.tsx` + `styles.module.css`:

- Replace the ghost `<Button slot='trigger' variant='ghost'>` with **`<Disclosure.Trigger className={styles.trigger}>`** (the pattern `TodoCard` uses) so the header has **no built-in filled background** — this removes the "looks selected" pill.
- Header row contents: chevron indicator · small **folder/repo icon** (muted) · workspace name (semibold, truncates, full path on tooltip) · **count** — prefer HeroUI **`Chip`** (`size='sm'`, a subtle/secondary variant) if its styling lands close to a muted pill; otherwise a token-styled `span` (decide during implementation via the HeroUI MCP). · inline **`+`** icon-button (HeroUI `Button isIconOnly variant='ghost'`, pushed right, muted→accent on hover, "New task" tooltip).
- Keep the HeroUI **`ListBox`** for keyboard/selection semantics, but render **`<TaskListItem>`** inside each `ListBox.Item` instead of `SessionItem`, passing `updatedAt={session.updatedAt}`.
- Remove the `SessionItem` import from `@/modules/chat-session`; import the local `TaskListItem`.
- Per-group empty state: a slim "No tasks yet — press + to start" (lighter than today's plain text).

Sessions arrive **newest-first** already (backend mtime-desc; `groupSessionsByWorkspace` preserves encounter order), so no client-side sort is needed.

### 5.3 Auto-expand on load

`hooks/useExpandedGroups.ts` + `WorkspaceSessionList.tsx`:

- Today the expanded set seeds once from `activeKey` (the active session's group). When no session is selected (the common fresh-load case), `activeKey` is `null` → nothing expands → the empty feel.
- **Change:** seed from `activeKey ?? mostRecentGroupKey`. Groups are ordered by workspace-config order (not recency), so the fallback is **not** "the first group" — it is the group holding the most-recently-updated session. Since `sessions` is mtime-desc, `mostRecentGroupKey = sessions[0] ? sessionGroupKey(sessions[0].workingDirectory, workspaces) : null`. Compute it in `WorkspaceSessionList.tsx` and pass the resolved seed (`activeKey ?? mostRecentGroupKey`) into `useExpandedGroups` (rename its param to `initialExpandedGroupKey`; seed-once logic unchanged). With no sessions, nothing is force-expanded (the empty-state message shows). Manual expand/collapse is otherwise unchanged.

### 5.4 Panel title

`apps/frontend/src/pages/coding/CodingPageView.tsx` — `<CollapsibleSidebar title='Workspaces'>` → `title='Tasks'`. (The panel groups tasks by workspace; "Tasks" matches the owner's mental model and the existing "New task" copy.)

### 5.5 HeroUI reuse & tokens

Prefer HeroUI components where they fit; hand-roll only where forcing a HeroUI component would mean fighting it (difference too big). Everything is styled with **HeroUI semantic tokens** (`var(--surface)`, `var(--border)`, `var(--foreground)`, `var(--muted)`, `var(--accent)`, `var(--accent-soft)`, `var(--radius-*)`) — no token redefinition, no `:global` into HeroUI internals, no bespoke material (per `apps/frontend/CLAUDE.md`).

- **Reuse (fits well):** `Disclosure` + `Disclosure.Trigger`/`Disclosure.Indicator` (group open/close), `ListBox` + `ListBox.Item` (selection + keyboard), `Button` (the `+`, retry, and the icon-only delete trigger), `Popover` (delete confirm), `Tooltip` (workspace path, "New task", "Delete"), `Spinner` (loading). Consider `Chip`/`Badge` for the count (see §5.2).
- **Hand-roll with tokens (HeroUI has no good fit / divergence too large):** the status dot (a standalone list bullet; HeroUI `Badge`'s dot is meant to attach to another element, so it does not fit), and the two-line row / quiet-header composition (layout, not a component). These are plain elements styled entirely from tokens.
- Confirm exact component props/variants against the HeroUI MCP during implementation before hand-rolling anything.

## 6. Visual spec

Consumes HeroUI tokens only (no bespoke material, no token redefinition), per `apps/frontend/CLAUDE.md`. Validated against the real light + dark palettes in the mockup.

**Task row (`TaskListItem`)**

- **Leading dot column** (~14px): idle dot = 8px circle, `1.5px solid var(--muted)`, transparent fill, ~55% opacity (a quiet bullet). (#348: solid `var(--accent)` fill + `var(--accent-soft)` ring for running.)
- **Content:** title — `0.8125rem`, weight 500, `var(--foreground)`, single-line ellipsis; meta — `0.7rem`, `var(--muted)`, the relative-time label.
- **Selected:** `background: var(--accent-soft)`, `border-radius: var(--radius-lg)`, `box-shadow: inset 2px 0 0 var(--accent)`, title weight 600.
- **Hover:** `background: color-mix(in oklab, var(--foreground) 5%, transparent)`.
- **Delete:** trash icon revealed on `:hover`/`:focus-within` at the row end (opacity 0→1, no layout shift); HeroUI `Popover` confirm ("Delete session? This cannot be undone.") — same semantics as the current `SessionItemView`.

**Workspace header**

- Transparent by default; hover `color-mix(in oklab, var(--foreground) 5%, transparent)`; radius `8px`.
- Name `0.8125rem`/600 `var(--foreground)`; count chip `0.66rem` `var(--muted)` on `color-mix(in oklab, var(--foreground) 8%, transparent)`, `border-radius: 999px`; chevron + folder icons `var(--muted)`.

**States**

- Loading → existing spinner; workspaces/sessions failure → existing retry buttons; "No workspaces configured" → keep the gentle message. Only the per-workspace empty state gets the lighter inline hint.

**Motion & a11y**

- Static dot (no pulse/spin — repo no-ambient-animation rule). Only event-driven transitions (hover tint, disclosure expand); honor `prefers-reduced-motion`.
- Selection/keyboard via `ListBox` retained; `+`, chevron, and delete reachable; aria-labels preserved. Both themes first-class.

## 7. Behavior summary

- **Select:** unchanged (`handleSelectSession` → navigate to the session route).
- **New task:** unchanged (`handleNewSession` expands the target group + `onNewSession(path)`).
- **Delete:** unchanged handler (`handleDeleteSession`); confirmation now lives in `TaskListItem`'s own hook.
- **Expansion:** selected group auto-expands (existing) + most-recent group as fallback (new).

## 8. Testing

- `format-relative-time.test.ts` — each bucket boundary with a fixed `now` (just-now, minutes, hours, yesterday, days, date fallback).
- `TaskListItemView.test.tsx` — renders title; renders time label when present and omits it when `null` (covers the missing-`updatedAt` path); selected styling/`data` hook; delete popover opens and confirm calls handler; delete disabled while deleting.
- `WorkspaceGroupView.test.tsx` — update for the new header (count, `+`, folder icon) and that it renders `TaskListItem` rows; existing selection assertions preserved.
- `useExpandedGroups.test.ts` — add: seeds from the most-recent-group fallback when `activeKey` is null; still prefers `activeKey` when present; user toggles win after seeding.
- Backend: extend the `listSessionMetadata` tests (coding + main store) to assert `updatedAt` is present and equals the snapshot mtime, ordering preserved.
- api-schema: `sessionMetadataSchema` parses with and without `updatedAt`.

## 9. Verification (before "done")

Per `apps/frontend/CLAUDE.md`, validate in a real browser, both themes:

- **Coding page:** empty (no session) shows an expanded most-recent group with scannable rows; selected row highlight; hover delete + confirm; new task; count chip; multiple workspaces; a workspace with no tasks.
- **Chat page:** confirm the session list is **visually unchanged** (SessionItem untouched) and still works.
- Capture light + dark screenshots for the PR description.

## 10. Files touched (checklist)

**Backend**

- `packages/api-schema/src/chat/schema.ts` (+`updatedAt?`)
- `apps/backend/src/models/agent-store/coding-agent-store.ts` (inject `updatedAt`)
- `apps/backend/src/models/agent-store/main-agent-store.ts` (inject `updatedAt`)
- store tests

**Frontend**

- `apps/frontend/src/pages/coding/CodingPageView.tsx` (title → "Tasks")
- `.../WorkspaceSessionList/WorkspaceSessionList.tsx` (fallback first-group key)
- `.../WorkspaceSessionList/hooks/useExpandedGroups.ts` (fallback seed) + test
- `.../WorkspaceSessionList/components/WorkspaceGroup/WorkspaceGroupView.tsx` (quiet header, render `TaskListItem`) + `styles.module.css` + test
- `.../WorkspaceGroup/components/TaskListItem/**` (new component, hook, helper, styles, tests, index)

## 11. Hooks left for #348

- `TaskListItem` gains an `isRunning?: boolean` prop; the idle dot becomes the running variant. No layout change.
- A visibility-aware poll of `GET /coding/sessions` (background reload) feeds `isRunning`, reconciled with the open session's live streaming state. Backend adds `getRunningIds()` on `AgentStore` + `isRunning` on the list payload.
