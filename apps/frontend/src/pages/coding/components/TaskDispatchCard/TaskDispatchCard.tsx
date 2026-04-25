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
