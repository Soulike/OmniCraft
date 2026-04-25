# Coding Task Dispatch UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the empty Coding Agent chat input with a task dispatch card that collects workspace, task description, and thinking level before creating a session.

**Architecture:** The Coding page gets a new `TaskDispatchCard` component that owns first-turn task setup. `useStreamChat.sendMessage` is extended with optional session creation config so the dispatch card can create the Coding session with `{workspace}` and send the task through the existing message/SSE flow. Existing session routes keep the current chat input and message UI.

**Tech Stack:** React 19, TypeScript, Vite, Vitest/jsdom, HeroUI v3, CSS Modules, Bun.

---

## File Structure

Create a focused Coding page module for the pre-session form:

```text
apps/frontend/src/pages/coding/components/TaskDispatchCard/
  TaskDispatchCard.tsx
  TaskDispatchCardView.tsx
  hooks/useTaskDispatchForm.ts
  hooks/useTaskDispatchForm.test.ts
  index.ts
  styles.module.css
  types.ts
```

Move thinking-level UI out of `ChatInput` internals so both `ChatInput` and `TaskDispatchCard` can use the same control:

```text
apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/
  ThinkingLevelSelect.tsx
  hooks/useThinkingLevel.ts
  index.ts
  styles.module.css
```

Modify session orchestration in these existing files:

```text
apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts
apps/frontend/src/modules/chat-session/index.ts
apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx
apps/frontend/src/modules/chat-session/components/ChatInput/ChatInputView.tsx
apps/frontend/src/pages/coding/CodingPage.tsx
apps/frontend/src/pages/coding/CodingPageView.tsx
```

Remove the old setup component after the new card is wired:

```text
apps/frontend/src/pages/coding/components/SessionSetup/
```

---

### Task 1: Share Thinking Level Control

**Files:**

- Move: `apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx` -> `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx`
- Move: `apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect/styles.module.css` -> `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/styles.module.css`
- Move: `apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect/index.ts` -> `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/index.ts`
- Move: `apps/frontend/src/modules/chat-session/components/ChatInput/hooks/useThinkingLevel.ts` -> `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/hooks/useThinkingLevel.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInputView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/index.ts`

- [ ] **Step 1: Move files into a shared component folder**

```bash
mkdir -p apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/hooks
git mv apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/ThinkingLevelSelect.tsx
git mv apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect/styles.module.css apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/styles.module.css
git mv apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect/index.ts apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/index.ts
git mv apps/frontend/src/modules/chat-session/components/ChatInput/hooks/useThinkingLevel.ts apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/hooks/useThinkingLevel.ts
rmdir apps/frontend/src/modules/chat-session/components/ChatInput/components/ThinkingLevelSelect
rmdir apps/frontend/src/modules/chat-session/components/ChatInput/components
rmdir apps/frontend/src/modules/chat-session/components/ChatInput/hooks
```

- [ ] **Step 2: Export the shared control and hook from the chat-session barrel**

In `apps/frontend/src/modules/chat-session/index.ts`, add this export with the other component exports:

```typescript
export {
  ThinkingLevelSelect,
  useThinkingLevel,
} from './components/ThinkingLevelSelect/index.js';
```

Replace `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/index.ts` with:

```typescript
export {ThinkingLevelSelect} from './ThinkingLevelSelect.js';
export {useThinkingLevel} from './hooks/useThinkingLevel.js';
```

- [ ] **Step 3: Update ChatInput imports**

In `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx`, replace:

```typescript
import {useThinkingLevel} from './hooks/useThinkingLevel.js';
```

with:

```typescript
import {useThinkingLevel} from '../ThinkingLevelSelect/index.js';
```

In `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInputView.tsx`, replace:

```typescript
import {ThinkingLevelSelect} from './components/ThinkingLevelSelect/index.js';
```

with:

```typescript
import {ThinkingLevelSelect} from '../ThinkingLevelSelect/index.js';
```

- [ ] **Step 4: Verify typecheck for the move**

Run:

```bash
cd apps/frontend && bun run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session
git commit -m "refactor(frontend): share thinking level control"
```

---

### Task 2: Add Task Dispatch Form Hook

**Files:**

- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/types.ts`
- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts`
- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.ts`

- [ ] **Step 1: Create shared task dispatch types**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/types.ts`:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';

export interface TaskDispatchValues {
  readonly workspace: string;
  readonly task: string;
  readonly thinkingLevel: ThinkingLevel;
}

export interface TaskDispatchErrors {
  readonly workspace?: string;
  readonly task?: string;
}
```

- [ ] **Step 2: Write failing hook tests**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts`:

```typescript
import {act, renderHook} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {useTaskDispatchForm} from './useTaskDispatchForm.js';

describe('useTaskDispatchForm', () => {
  it('blocks submit and reports validation errors without workspace or task', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: undefined,
        isBlocked: false,
        isStarting: false,
        onStartTask,
      }),
    );

    expect(result.current.canSubmit).toBe(false);

    await act(async () => {
      await result.current.submit();
    });

    expect(onStartTask).not.toHaveBeenCalled();
    expect(result.current.errors).toEqual({
      workspace: 'Select a workspace before starting a task.',
      task: 'Describe the coding task before starting.',
    });
  });

  it('trims task text and submits values', async () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const {result} = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: false,
        isStarting: false,
        onStartTask,
      }),
    );

    act(() => {
      result.current.setTask('  Fix the failing tests.  ');
    });

    expect(result.current.canSubmit).toBe(true);

    await act(async () => {
      await result.current.submit();
    });

    expect(onStartTask).toHaveBeenCalledWith({
      workspace: '/repo',
      task: 'Fix the failing tests.',
      thinkingLevel: 'none',
    });
    expect(result.current.errors).toEqual({});
  });

  it('treats external blocked and starting states as submit blockers', () => {
    const onStartTask = vi.fn().mockResolvedValue(undefined);

    const blocked = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: true,
        isStarting: false,
        onStartTask,
      }),
    );
    act(() => {
      blocked.result.current.setTask('Do work');
    });
    expect(blocked.result.current.canSubmit).toBe(false);

    const starting = renderHook(() =>
      useTaskDispatchForm({
        selectedWorkspace: '/repo',
        isBlocked: false,
        isStarting: true,
        onStartTask,
      }),
    );
    act(() => {
      starting.result.current.setTask('Do work');
    });
    expect(starting.result.current.canSubmit).toBe(false);
  });
});
```

- [ ] **Step 3: Run the hook tests to verify they fail**

Run:

```bash
cd apps/frontend && bun run test src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts
```

Expected: FAIL because `useTaskDispatchForm.ts` does not exist yet.

- [ ] **Step 4: Implement the hook**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.ts`:

```typescript
import {useCallback, useMemo, useState} from 'react';

import {useThinkingLevel} from '@/modules/chat-session/index.js';

import type {TaskDispatchErrors, TaskDispatchValues} from '../types.js';

interface UseTaskDispatchFormOptions {
  readonly selectedWorkspace: string | undefined;
  readonly isBlocked: boolean;
  readonly isStarting: boolean;
  readonly onStartTask: (values: TaskDispatchValues) => Promise<void>;
}

export function useTaskDispatchForm({
  selectedWorkspace,
  isBlocked,
  isStarting,
  onStartTask,
}: UseTaskDispatchFormOptions) {
  const [task, setTaskValue] = useState('');
  const [errors, setErrors] = useState<TaskDispatchErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {thinkingLevel, setThinkingLevel} = useThinkingLevel();

  const trimmedTask = task.trim();
  const isBusy = isStarting || isSubmitting;

  const canSubmit = useMemo(
    () =>
      !isBlocked &&
      !isBusy &&
      selectedWorkspace !== undefined &&
      trimmedTask.length > 0,
    [isBlocked, isBusy, selectedWorkspace, trimmedTask],
  );

  const setTask = useCallback((value: string) => {
    setTaskValue(value);
    setErrors((current) => ({...current, task: undefined}));
  }, []);

  const validate = useCallback((): TaskDispatchErrors => {
    const nextErrors: TaskDispatchErrors = {};
    if (selectedWorkspace === undefined) {
      nextErrors.workspace = 'Select a workspace before starting a task.';
    }
    if (!trimmedTask) {
      nextErrors.task = 'Describe the coding task before starting.';
    }
    return nextErrors;
  }, [selectedWorkspace, trimmedTask]);

  const submit = useCallback(async () => {
    if (isBusy) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (selectedWorkspace === undefined) return;

    setIsSubmitting(true);
    try {
      await onStartTask({
        workspace: selectedWorkspace,
        task: trimmedTask,
        thinkingLevel,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isBusy,
    onStartTask,
    selectedWorkspace,
    thinkingLevel,
    trimmedTask,
    validate,
  ]);

  return {
    task,
    thinkingLevel,
    errors,
    isSubmitting,
    canSubmit,
    setTask,
    setThinkingLevel,
    submit,
  };
}
```

- [ ] **Step 5: Run the hook tests to verify they pass**

Run:

```bash
cd apps/frontend && bun run test src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/coding/components/TaskDispatchCard/types.ts apps/frontend/src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.ts apps/frontend/src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts
git commit -m "feat(coding): add task dispatch form state"
```

---

### Task 3: Build TaskDispatchCard UI

**Files:**

- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCard.tsx`
- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCardView.tsx`
- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/index.ts`
- Create: `apps/frontend/src/pages/coding/components/TaskDispatchCard/styles.module.css`

- [ ] **Step 1: Implement the TaskDispatchCard container**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCard.tsx`:

```typescript
import {useEffect} from 'react';

import {useSessionConfig} from '@/modules/chat-session/index.js';

import {useTaskDispatchForm} from './hooks/useTaskDispatchForm.js';
import {TaskDispatchCardView} from './TaskDispatchCardView.js';
import type {TaskDispatchValues} from './types.js';

interface TaskDispatchCardProps {
  readonly isStarting: boolean;
  readonly onStartTask: (values: TaskDispatchValues) => Promise<void>;
}

export function TaskDispatchCard({
  isStarting,
  onStartTask,
}: TaskDispatchCardProps) {
  const {
    workspaces,
    isLoading,
    loadError,
    selectedWorkspace,
    setSelectedWorkspace,
  } = useSessionConfig();

  useEffect(() => {
    if (selectedWorkspace !== undefined) return;
    if (workspaces.length !== 1) return;
    setSelectedWorkspace(workspaces[0].path);
  }, [selectedWorkspace, setSelectedWorkspace, workspaces]);

  const hasConfiguredWorkspaces =
    !isLoading && loadError === null && workspaces.length > 0;

  const form = useTaskDispatchForm({
    selectedWorkspace,
    isBlocked: isLoading || loadError !== null || !hasConfiguredWorkspaces,
    isStarting,
    onStartTask,
  });

  return (
    <TaskDispatchCardView
      workspaces={workspaces}
      isLoadingWorkspaces={isLoading}
      loadError={loadError}
      hasConfiguredWorkspaces={hasConfiguredWorkspaces}
      selectedWorkspace={selectedWorkspace}
      task={form.task}
      thinkingLevel={form.thinkingLevel}
      errors={form.errors}
      canSubmit={form.canSubmit}
      isStarting={isStarting || form.isSubmitting}
      onWorkspaceChange={setSelectedWorkspace}
      onTaskChange={form.setTask}
      onThinkingLevelChange={form.setThinkingLevel}
      onSubmit={() => {
        void form.submit();
      }}
    />
  );
}
```

- [ ] **Step 2: Implement the TaskDispatchCard view**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCardView.tsx`:

```typescript
import {
  Alert,
  Button,
  Card,
  Form,
  Label,
  ListBox,
  Select,
  Spinner,
  TextArea,
} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Link} from 'react-router';

import {ThinkingLevelSelect} from '@/modules/chat-session/index.js';
import {ROUTES} from '@/routes.js';

import styles from './styles.module.css';
import type {TaskDispatchErrors} from './types.js';

interface TaskDispatchCardViewProps {
  readonly workspaces: readonly Workspace[];
  readonly isLoadingWorkspaces: boolean;
  readonly loadError: unknown;
  readonly hasConfiguredWorkspaces: boolean;
  readonly selectedWorkspace: string | undefined;
  readonly task: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly errors: TaskDispatchErrors;
  readonly canSubmit: boolean;
  readonly isStarting: boolean;
  readonly onWorkspaceChange: (workspace: string | undefined) => void;
  readonly onTaskChange: (task: string) => void;
  readonly onThinkingLevelChange: (level: ThinkingLevel) => void;
  readonly onSubmit: () => void;
}

export function TaskDispatchCardView({
  workspaces,
  isLoadingWorkspaces,
  loadError,
  hasConfiguredWorkspaces,
  selectedWorkspace,
  task,
  thinkingLevel,
  errors,
  canSubmit,
  isStarting,
  onWorkspaceChange,
  onTaskChange,
  onThinkingLevelChange,
  onSubmit,
}: TaskDispatchCardViewProps) {
  return (
    <Card className={styles.card}>
      <Card.Header className={styles.header}>
        <Card.Title className={styles.title}>Start coding task</Card.Title>
        <Card.Description className={styles.description}>
          Choose the workspace and describe the task. After it starts, use chat
          for follow-up adjustments.
        </Card.Description>
      </Card.Header>
      <Form
        className={styles.form}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <Card.Content className={styles.content}>
          <div className={styles.settingsGrid}>
            <div className={styles.field}>
              <Label isRequired>Workspace</Label>
              <Select
                isDisabled={
                  isLoadingWorkspaces || workspaces.length === 0 || isStarting
                }
                value={selectedWorkspace ?? ''}
                onChange={(value) => {
                  onWorkspaceChange(value ? String(value) : undefined);
                }}
              >
                <Select.Trigger>
                  <Select.Value />
                  <Select.Indicator />
                </Select.Trigger>
                <Select.Popover>
                  <ListBox>
                    {workspaces.map((entry) => (
                      <ListBox.Item
                        key={entry.path}
                        id={entry.path}
                        textValue={entry.path}
                      >
                        {entry.path}
                        <ListBox.ItemIndicator />
                      </ListBox.Item>
                    ))}
                  </ListBox>
                </Select.Popover>
              </Select>
              {errors.workspace && (
                <p className={styles.fieldError}>{errors.workspace}</p>
              )}
            </div>
            <div className={styles.field}>
              <Label>Thinking level</Label>
              <ThinkingLevelSelect
                value={thinkingLevel}
                isDisabled={isStarting}
                onChange={onThinkingLevelChange}
              />
            </div>
          </div>

          <div className={styles.field}>
            <Label isRequired>Task</Label>
            <TextArea
              aria-label='Task'
              className={styles.taskInput}
              disabled={isStarting}
              placeholder='Describe the coding task: files, expected behavior, constraints, and how to verify.'
              rows={8}
              value={task}
              onChange={(event) => {
                onTaskChange(event.target.value);
              }}
            />
            {errors.task && <p className={styles.fieldError}>{errors.task}</p>}
          </div>

          <div className={styles.alerts}>
            {loadError !== null && (
              <Alert status='danger'>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Failed to load workspaces from settings.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {!isLoadingWorkspaces && loadError === null && !hasConfiguredWorkspaces && (
              <Alert status='warning'>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    No workspaces configured.{' '}
                    <Link
                      className={styles.settingsLink}
                      to={ROUTES.settings['file-access'].workspaces()}
                    >
                      Configure workspaces in Settings
                    </Link>
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
            {hasConfiguredWorkspaces && selectedWorkspace === undefined && (
              <Alert status='warning'>
                <Alert.Indicator />
                <Alert.Content>
                  <Alert.Description>
                    Select a workspace before starting a coding task.
                  </Alert.Description>
                </Alert.Content>
              </Alert>
            )}
          </div>
        </Card.Content>

        <Card.Footer className={styles.footer}>
          <Button type='submit' variant='primary' isDisabled={!canSubmit}>
            {isStarting ? <Spinner size='sm' /> : 'Start task'}
          </Button>
        </Card.Footer>
      </Form>
    </Card>
  );
}
```

- [ ] **Step 3: Add styles**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/styles.module.css`:

```css
.card {
  width: min(760px, 100%);
  border-radius: 8px;
}

.header {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.title {
  font-size: 1.125rem;
  font-weight: 600;
}

.description {
  line-height: 1.45;
}

.form {
  display: contents;
}

.content {
  display: flex;
  flex-direction: column;
  gap: 18px;
}

.settingsGrid {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 16px;
  align-items: end;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.taskInput {
  resize: vertical;
}

.fieldError {
  margin: 0;
  color: var(--danger);
  font-size: 0.8125rem;
}

.alerts {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.settingsLink {
  color: var(--color-accent);
  text-decoration: underline;
}

.footer {
  display: flex;
  justify-content: flex-end;
}

@media (max-width: 720px) {
  .settingsGrid {
    grid-template-columns: 1fr;
  }
}
```

- [ ] **Step 4: Add the component export**

Create `apps/frontend/src/pages/coding/components/TaskDispatchCard/index.ts`:

```typescript
export {TaskDispatchCard} from './TaskDispatchCard.js';
export type {TaskDispatchValues} from './types.js';
```

- [ ] **Step 5: Run frontend tests and build**

Run:

```bash
cd apps/frontend && bun run test src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts && bun run build
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/coding/components/TaskDispatchCard
git commit -m "feat(coding): add task dispatch card"
```

---

### Task 4: Wire Dispatch Into Coding Session Flow

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/pages/coding/CodingPage.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPageView.tsx`

- [ ] **Step 1: Extend `useStreamChat.sendMessage` with optional creation config**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, add this type near `type SessionIdHook`:

```typescript
type CreateSessionConfig = Parameters<SessionIdHook['createNewSessionId']>[0];
```

Replace the `sendMessage` callback signature and lazy session creation line with:

```typescript
  const sendMessage = useCallback(
    async (
      content: string,
      thinkingLevel: ThinkingLevel,
      sessionConfig?: CreateSessionConfig,
    ) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const activeSessionId =
        sessionId ?? (await createNewSessionId(sessionConfig));
      if (!activeSessionId) return;
```

Leave the rest of the callback body unchanged.

- [ ] **Step 2: Update `CodingPage.tsx` to expose `startTask`**

In `apps/frontend/src/pages/coding/CodingPage.tsx`, add this import:

```typescript
import type {TaskDispatchValues} from './components/TaskDispatchCard/index.js';
```

Change the session config destructure from:

```typescript
const {selectedWorkspace} = useSessionConfig();
```

to:

```typescript
const {selectedWorkspace, setSelectedWorkspace} = useSessionConfig();
```

Replace `createNewSessionIdWithConfig` with:

```typescript
const createNewSessionIdWithConfig = useCallback(
  async (config?: {workspace?: string}) => {
    const workspace = config?.workspace ?? selectedWorkspace;
    if (workspace === undefined) {
      throw new Error('Please select a workspace before starting a session.');
    }
    return createNewSessionId({workspace});
  },
  [createNewSessionId, selectedWorkspace],
);
```

After `const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();`, add:

```typescript
const startTask = useCallback(
  async ({workspace, task, thinkingLevel}: TaskDispatchValues) => {
    setSelectedWorkspace(workspace);
    await sendMessage(task, thinkingLevel, {workspace});
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  },
  [sendMessage, scrollToBottom, setSelectedWorkspace],
);
```

Pass `startTask` to `CodingPageView`:

```typescript
onStartTask = {startTask};
```

- [ ] **Step 3: Update `CodingPageView.tsx` to render pre-session and post-session controls separately**

In `apps/frontend/src/pages/coding/CodingPageView.tsx`, replace the `SessionSetup` import with:

```typescript
import {
  TaskDispatchCard,
  type TaskDispatchValues,
} from './components/TaskDispatchCard/index.js';
```

Add this prop to `CodingPageViewProps`:

```typescript
onStartTask: (values: TaskDispatchValues) => Promise<void>;
```

Add `onStartTask` to the function destructuring.

Replace the empty-state block:

```tsx
{
  isEmpty && !sessionId && (
    <div className={styles.emptyState}>
      <SessionSetup />
    </div>
  );
}
```

with:

```tsx
{
  !sessionId && (
    <div className={styles.emptyState}>
      <TaskDispatchCard isStarting={isStreaming} onStartTask={onStartTask} />
    </div>
  );
}
```

Replace the unconditional `ChatInput` render:

```tsx
<ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
```

with:

```tsx
{
  sessionId && (
    <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
  );
}
```

Leave `BottomBar` gated by `sessionId`.

- [ ] **Step 4: Run build**

Run:

```bash
cd apps/frontend && bun run build
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/pages/coding/CodingPage.tsx apps/frontend/src/pages/coding/CodingPageView.tsx
git commit -m "feat(coding): start sessions from task dispatch"
```

---

### Task 5: Remove Old Coding SessionSetup

**Files:**

- Delete: `apps/frontend/src/pages/coding/components/SessionSetup/`

- [ ] **Step 1: Remove the old setup component**

Run:

```bash
git rm -r apps/frontend/src/pages/coding/components/SessionSetup
```

- [ ] **Step 2: Verify no stale references remain**

Run:

```bash
rg -n "SessionSetup|WorkspaceSelect" apps/frontend/src/pages/coding apps/frontend/src/modules/chat-session
```

Expected: no output.

- [ ] **Step 3: Run frontend verification**

Run:

```bash
cd apps/frontend && bun run lint && bun run test src/pages/coding/components/TaskDispatchCard/hooks/useTaskDispatchForm.test.ts && bun run build
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/pages/coding apps/frontend/src/modules/chat-session
git commit -m "refactor(coding): remove legacy session setup"
```

---

### Task 6: Manual Browser Verification

**Files:**

- No file changes expected.

- [ ] **Step 1: Start the app**

Run from the repo root:

```bash
bun run dev
```

Expected: frontend and backend dev servers start. If the default frontend port is occupied, use the Vite URL printed by the command.

- [ ] **Step 2: Verify `/coding` before session creation**

Open the frontend URL and navigate to `/coding`.

Expected:

- A large `Start coding task` card is visible.
- The bottom chat input is not visible.
- Workspace is required and has no `None` option.
- If exactly one workspace is configured, it is selected automatically.
- `Start task` is disabled until a workspace and non-empty task are present.

- [ ] **Step 3: Verify successful task start**

Enter a task and click `Start task`.

Expected:

- The URL changes to `/coding/:sessionId`.
- The task appears as the first user message.
- Assistant streaming starts.
- BottomBar and ChatInput appear after the session exists.

- [ ] **Step 4: Verify follow-up chat**

Send a follow-up message from the bottom ChatInput.

Expected: the follow-up sends in the existing session without creating a second session.

- [ ] **Step 5: Verify New Session**

Click the title bar new-session button.

Expected: the URL returns to `/coding`, the task dispatch card appears, and ChatInput is hidden again.

- [ ] **Step 6: Final status check**

Run:

```bash
git status --short
```

Expected: no uncommitted files except intentional local dev artifacts ignored by `.gitignore`.
