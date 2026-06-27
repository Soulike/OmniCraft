# Split SessionSidebar into a Layout-Agnostic SessionList Design

**Date:** 2026-06-27
**Status:** Approved (design phase)

## Goal

Separate two concerns that `SessionSidebar` currently fuses:

1. **The session list** — a domain list of sessions with its own behavior (fetch, highlight
   the current session, select-to-navigate, delete).
2. **The sidebar chrome** — a collapsible container that decides _where_ and _how_ the list
   sits on screen.

After this change, `chat-session` exposes only the list (`SessionList`). Each page decides
its own layout and composes the list into a sidebar itself. The migration keeps the existing
sidebar, just assembled at the page level rather than baked into the module.

Separately, the session list stops displaying each session's workspace (working directory).

## Background & Motivation

Today `modules/chat-session/components/SessionSidebar/` owns both concerns:

- `SessionSidebarView` wraps the list in `@/components/CollapsibleSidebar` and supplies the
  `title='Sessions'` and the open/collapse state.
- `SessionSidebar` (container) holds `isOpen` via `useState` alongside the genuine list logic.

This couples "the list of sessions" to "a collapsible sidebar," so the list can never be
placed in any other layout. `CollapsibleSidebar` is already a generic, business-agnostic
component under `components/`; the only thing binding it to the sidebar shape is this module.

`SessionSidebar` is also the **only** consumer of `CollapsibleSidebar`, and nothing outside
the module reads its `isOpen` value — the state is purely local UI. That makes the open/collapse
state safe to push _into_ `CollapsibleSidebar` itself.

The workspace line (`session.workingDirectory`, rendered as the directory basename under the
title) is being dropped from the list per product direction.

## Scope

**In scope:**

- Rename `SessionSidebar` → `SessionList`, stripped down to render only the list (no sidebar
  chrome, no open state). It keeps all list behavior internal so it stays a drop-in.
- Make `CollapsibleSidebar` self-manage its open/collapse state (uncontrolled, `defaultOpen`).
- Compose `<CollapsibleSidebar title='Sessions'><SessionList /></CollapsibleSidebar>` in each
  page view (`ChatPageView`, `CodingPageView`).
- Remove the workspace display from the session item.

**Out of scope:**

- Moving the page-shell layout styles (`wrapper` / `main` / `page`, etc.) out of
  `chat-session/styles.module.css`. The existing flex shell already lays out `[sidebar | main]`
  correctly and is shared by both pages; relocating the whole shell is a separate concern.
- Any change to the `SessionMetadata` API schema. `workingDirectory` stays in the data; we
  simply stop rendering it.
- Adding controlled-state props to `CollapsibleSidebar`. No consumer needs them (YAGNI).

## Design

### 1. `SessionList` (renamed from `SessionSidebar`)

Rename the folder `modules/chat-session/components/SessionSidebar/` → `.../SessionList/`.

- `SessionSidebar.tsx` → `SessionList.tsx` (container)
  - Remove the `isOpen` / `setIsOpen` `useState`.
  - Keep everything else unchanged: `useSessionList`, `useSessionId`, `useChatEventBus`,
    `handleSelectSession` (navigate), `handleDeleteSession` (delete + toast + route reset).
  - Render `<SessionListView ... />` without the `isOpen` / `onOpenChange` props.
- `SessionSidebarView.tsx` → `SessionListView.tsx` (view)
  - Remove the `CollapsibleSidebar` import and wrapper, and the `isOpen` / `onOpenChange`
    props from `SessionSidebarViewProps`.
  - Return the list content directly — the existing loading `Spinner`, error text, empty
    text, `ListBox`, and the infinite-scroll sentinel. The page's `CollapsibleSidebar`
    already provides the scrollable content area (`ScrollShadow`), so the list returns bare
    content.
  - Stop passing `workingDirectory` to `SessionItem` (see §4).
- `index.ts`: `export {SessionList} from './SessionList.js';`
- `hooks/useSessionList.ts` and `components/SessionItem/` keep their locations and names.
- `modules/chat-session/index.ts`: replace
  `export {SessionSidebar} from './components/SessionSidebar/index.js';`
  with `export {SessionList} from './components/SessionList/index.js';`

`SessionList` remains self-contained: select-to-navigate, current-session highlight, and
delete-with-toast all stay inside it, so a page only has to drop `<SessionList />` into
whatever layout it wants.

### 2. `CollapsibleSidebar` self-manages open state

In `components/CollapsibleSidebar/CollapsibleSidebar.tsx`:

- Drop the required `isOpen` and `onOpenChange` props.
- Add an optional `defaultOpen?: boolean` (default `true`).
- Manage state internally: `const [isOpen, setIsOpen] = useState(defaultOpen);`
- The collapse button calls `setIsOpen(false)`; the expand button calls `setIsOpen(true)`.
- `title`, `headerExtra`, `children` are unchanged.

This is safe because `SessionSidebarView` is the sole consumer and the value was never read
externally.

### 3. Page composition

In `ChatPageView.tsx` and `CodingPageView.tsx`, replace `<SessionSidebar />` with:

```tsx
<CollapsibleSidebar title='Sessions'>
  <SessionList />
</CollapsibleSidebar>
```

- Import `CollapsibleSidebar` from `@/components/CollapsibleSidebar/index.js` and `SessionList`
  from `@/modules/chat-session/index.js`.
- The page Views stay stateless (no sidebar state introduced), consistent with MVVM.
- `styles.wrapper` / `styles.main` are unchanged: `CollapsibleSidebar` renders the same
  `<aside>` in the same flex slot the old `SessionSidebar` occupied, so layout is preserved.

### 4. Remove the workspace display

- `SessionItem/SessionItemView.tsx`: remove the `workingDirectory` prop and the
  `<span className={styles.workingDirectory}>` block. `.content` now holds only the title.
- `SessionItem/SessionItem.tsx`: remove the `workingDirectory` prop and stop forwarding it.
- `SessionListView.tsx`: stop passing `workingDirectory={session.workingDirectory}`.
- `SessionItem/styles.module.css`: remove the `.workingDirectory` rule. `.content` keeps its
  flex column / `min-width: 0` ellipsis behavior (harmless with a single child).

## Testing & Verification

- No unit tests target `SessionSidebar`, `SessionList`, or `SessionItem` directly.
- `ChatPage.test.tsx` and `CodingPage.test.tsx` render through the page entry with
  `listSessions` mocked to `{sessions: [], total: 0}`. They exercise the empty-list path and
  reference neither the sidebar nor the workspace text, so they should pass unchanged after
  the rename. Re-run both to confirm.
- Run `bun run test` (Vitest) and the typecheck script from the repo root.
- Browser verification (both light and dark themes, per the frontend UI rule): the sessions
  sidebar still collapses and expands, the current session is highlighted, selecting a session
  navigates, delete still works, and rows render title-only (no workspace line).

## Risks

- **Rename churn / stale imports.** The folder and two files are renamed and the module
  barrel export changes. Mitigation: grep for `SessionSidebar` across the frontend after the
  change to ensure no references remain.
- **Layout regression from the `<aside>` swap.** Low: `CollapsibleSidebar` already produced
  the exact `<aside>` that rendered in this slot; only the open-state plumbing moves inward.
