# Coding Task Dispatch UI

## Problem

The Coding Agent currently starts like the general Chat Agent: the empty route
shows setup hints, but the primary action is still the shared chat input. That
makes the first turn feel like an ordinary conversation, even though a Coding
session needs a task, a workspace, and task-scoped options before useful work can
begin.

Issue #188 requires a dedicated task dispatch input for Coding Agent creation,
with workspace required before creating the session. The chat input should be
available only after the session exists.

## Goals

- Make `/coding` feel task-driven instead of chat-driven.
- Put all task-scoped creation settings in one large card on the new session
  page.
- Require a configured workspace before starting a Coding task.
- Send the task description as the first user message immediately after session
  creation.
- Preserve the existing post-creation experience: message stream, bottom bar,
  VSCode action, stop generation, and follow-up chat input.
- Keep the card extensible so future task-level settings can be added without
  changing the page structure.

## Non-Goals

- Change Chat Agent behavior.
- Add new backend request fields beyond the existing Coding `workspace` session
  creation parameter.
- Persist task draft state across reloads.
- Redesign message rendering, tool cards, session history, or VSCode status.
- Add a multi-step wizard.

## Current State

- `packages/api-schema/src/chat/schema.ts` already defines
  `createCodingSessionRequestSchema` with required `workspace`.
- `apps/backend/src/dispatcher/agent-session/router.ts` already parses Coding
  session creation through that schema.
- `apps/frontend/src/pages/coding/CodingPage.tsx` already guards
  `selectedWorkspace` before creating a Coding session.
- `apps/frontend/src/pages/coding/CodingPageView.tsx` still renders
  `ChatInput` unconditionally at the bottom of the page.
- `apps/frontend/src/pages/coding/components/SessionSetup` renders workspace
  selection and warnings, but the copy still says users can start chatting right
  away.
- `useStreamChat.sendMessage` lazily creates a session if `sessionId` is null,
  then emits the user message and sends the completion request. This is the
  right flow to reuse for task dispatch, but it needs to accept optional session
  creation config so the first Coding task can pass `{workspace}` explicitly.

## Approaches Considered

### A. Single Dispatch Card

Render one large card in the empty Coding route. The card contains workspace,
task description, thinking level, validation/warnings, and a `Start task`
button. After creation, the existing session UI takes over.

This is the selected approach. It matches the desired mental model: dispatch a
task first, then refine through chat.

### B. Short Wizard

Split creation into workspace/settings, task description, and review steps. This
is more guided, but it slows down repeated agent dispatch and adds state that is
not needed for the current fields.

### C. Settings Side Panel

Keep the task text central and place creation settings beside it. This can work
for power users, but it is visually heavier and harder to fit on smaller
screens. It also makes future settings compete with the main task field.

## Selected Design

### Empty Coding Route

When `sessionId === null`, `/coding` renders a centered task dispatch card
inside the current empty-state area. It does not render `ChatInput` or
`BottomBar`.

The card uses the existing HeroUI and CSS Modules stack. It should be a focused
form surface, not a landing page. It should fit the current app chrome and use a
conservative operational UI style.

Card structure:

1. Header: title `Start coding task` and short description.
2. Settings area:
   - Required `Workspace` select.
   - `Thinking level` select using the same options and persistence behavior as
     the current `ChatInput` control.
3. Task area:
   - Large `TextArea` labelled `Task`.
   - Placeholder: `Describe the coding task: files, expected behavior,
constraints, and how to verify.`
4. Alerts:
   - Workspaces loading failure.
   - No configured workspaces, with a link to workspace settings.
   - Missing workspace on submit.
   - Empty task on submit.
5. Footer:
   - Primary `Start task` button.
   - Disabled while creating/sending, while workspaces are loading, when there
     are no configured workspaces, when no workspace is selected, or when the
     task text is empty.

The task dispatch card renders its own required workspace select without a
`None` option. If exactly one workspace is configured, the card auto-selects it.
If multiple workspaces are configured, the user must choose one before the task
can start.

### Session Creation Flow

Submitting the card performs the same logical flow as the first message in the
existing lazy session path:

1. Trim the task text.
2. Validate selected workspace and non-empty task text.
3. Update `SessionConfigProvider.selectedWorkspace` with the selected workspace,
   so the post-creation InfoBar and VSCode action have the same workspace value.
4. Call `sendMessage(taskText, thinkingLevel, {workspace})`.
5. `useStreamChat` creates the Coding session with `{workspace}` because
   `sessionId` is null.
6. Navigate to `/coding/:sessionId` through the existing `SessionIdProvider`
   behavior.
7. Emit the user message and send the completion request through the existing
   stream hook/API path.
8. Show the normal session UI once the route has a session ID.

The important behavioral change is not to expose a bottom chat input before step
3 succeeds. The first user message comes from the card, not from `ChatInput`.

### Existing Session Route

When `sessionId !== null`, Coding keeps the current layout:

- `TitleBarView`
- `StreamingMessageDisplay`
- `BottomBar`
- `ChatInput`

Follow-up messages continue to use the shared chat input. The dispatch card is
not shown inside an existing session, even if the session has no messages yet.

### New Session Button

The title bar's new session action continues to navigate to the base Coding
route. On `/coding`, the user sees a fresh dispatch card rather than an empty
chat input.

The disabled rule should remain conservative while streaming. On a blank Coding
route with no session, it can stay disabled because the user is already on the
new task screen.

### Errors and Loading

Creation and first-message failures should surface in the existing alert area at
the top of the page or inside the card if they are form validation errors.

- Workspace loading failures belong inside the card because they block task
  setup.
- Backend create-session failures can use the page-level `ChatAlert` because
  they come from the existing session creation path.
- First-message send failures can continue to use the existing stream error
  handling.

### Extensibility

The card is the task creation boundary. Future task-scoped settings should be
added to this card rather than to the bottom `ChatInput`. Examples include
approval mode, sandbox mode, model override, reasoning effort, branch/worktree
options, or attached context.

To keep that future growth manageable, implement the card as a Coding page
component with a narrow submit API:

```typescript
interface TaskDispatchValues {
  workspace: string;
  task: string;
  thinkingLevel: ThinkingLevel;
}
```

The container can map those values to the current session and message APIs. If a
future setting needs backend persistence or a request schema change, it should
be added deliberately at the API boundary instead of leaking generic form state
into `useStreamChat`.

## Component Plan

Replace `SessionSetup` with a task dispatch module under the Coding page:

```text
apps/frontend/src/pages/coding/components/TaskDispatchCard/
  TaskDispatchCard.tsx
  TaskDispatchCardView.tsx
  hooks/useTaskDispatchForm.ts
  index.ts
  styles.module.css
```

Responsibilities:

- `TaskDispatchCard.tsx`: container; reads `useSessionConfig`, owns form state,
  wires submit.
- `useTaskDispatchForm.ts`: manages task text, thinking level, local validation,
  and disabled/submitting state.
- `TaskDispatchCardView.tsx`: stateless HeroUI form/card view.
- `styles.module.css`: card layout, responsive form grid, textarea sizing.

Move the existing `ThinkingLevelSelect` to
`apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/` and
export it from the module barrel. Both `ChatInput` and `TaskDispatchCard` should
import that public component path.

## Data Flow

```text
/coding with no session
  TaskDispatchCard submit
    -> startTask({workspace, task, thinkingLevel})
    -> sendMessage(task, thinkingLevel, {workspace})
    -> createNewSessionId({workspace})
    -> route becomes /coding/:sessionId
    -> api sendMessage(sessionId, task, thinkingLevel)
    -> existing SSE/message UI renders progress

/coding/:sessionId
  ChatInput submit
    -> sendMessage(followUp, thinkingLevel)
```

`CodingPageContent` exposes a named `startTask(values)` handler to the view. It
calls the `sendMessage` returned by `useStreamChat` with `{workspace}` as an
optional third argument. `useStreamChat` uses that config only when it needs to
create a new session; follow-up ChatInput sends keep calling `sendMessage` with
only content and thinking level.

## Testing

Add focused frontend tests where practical:

- A view-model/form hook test for `useTaskDispatchForm` covering disabled and
  validation states.
- A Coding page or card render test, if existing test setup supports HeroUI
  components, confirming `ChatInput` is absent before session creation and the
  card shows required controls.
- Existing build and lint commands remain the main regression checks.

Manual verification should cover:

- `/coding` with no workspaces configured.
- `/coding` with workspaces configured but none selected.
- Successful submit creates a session, sends the task, and shows streaming.
- `/coding/:sessionId` still supports follow-up messages through `ChatInput`.
- `New session` returns to the dispatch card.

## Files Likely To Change

| File                                                                        | Change                                                                                                                      |
| --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `apps/frontend/src/pages/coding/CodingPage.tsx`                             | Add a named `startTask` flow or submit handler for dispatch card values.                                                    |
| `apps/frontend/src/pages/coding/CodingPageView.tsx`                         | Render dispatch card only when `sessionId` is null; render `ChatInput` only when `sessionId` exists.                        |
| `apps/frontend/src/pages/coding/components/SessionSetup/*`                  | Replace or retire in favor of `TaskDispatchCard`.                                                                           |
| `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/*`   | New shared location for the existing thinking level control.                                                                |
| `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx` | No behavioral change; only import path changes if `ThinkingLevelSelect` moves.                                              |
| `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`             | Let `sendMessage` accept optional session creation config and pass it to `createNewSessionId` only when creating a session. |
