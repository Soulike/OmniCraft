import {useCallback, useEffect, useState} from 'react';

import {useSessionConfig} from '@/modules/chat-session/index.js';

import {useTaskDispatchForm} from './hooks/useTaskDispatchForm.js';
import {TaskDispatchCardView} from './TaskDispatchCardView.js';
import type {TaskDispatchValues} from './types.js';

interface TaskDispatchCardProps {
  readonly onSend: (content: string) => Promise<void>;
}

export function TaskDispatchCard({onSend}: TaskDispatchCardProps) {
  const [submitError, setSubmitError] = useState<string | null>(null);
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

  const startTask = useCallback(
    async ({task}: TaskDispatchValues) => {
      await onSend(task);
    },
    [onSend],
  );

  const form = useTaskDispatchForm({
    selectedWorkspace,
    isBlocked: isLoading || loadError !== null || !hasConfiguredWorkspaces,
    onStartTask: startTask,
  });

  const handleWorkspaceChange = (workspace: string | undefined) => {
    setSubmitError(null);
    setSelectedWorkspace(workspace);
  };

  const handleTaskChange = (task: string) => {
    setSubmitError(null);
    form.setTask(task);
  };

  const handleSubmit = () => {
    setSubmitError(null);
    form.submit().catch((error: unknown) => {
      setSubmitError(
        error instanceof Error ? error.message : 'Failed to start task.',
      );
    });
  };

  return (
    <TaskDispatchCardView
      workspaces={workspaces}
      isLoadingWorkspaces={isLoading}
      hasWorkspaceLoadError={loadError !== null}
      hasConfiguredWorkspaces={hasConfiguredWorkspaces}
      selectedWorkspace={selectedWorkspace}
      task={form.task}
      errors={form.errors}
      submitError={submitError}
      canSubmit={form.canSubmit}
      isStarting={form.isSubmitting}
      onWorkspaceChange={handleWorkspaceChange}
      onTaskChange={handleTaskChange}
      onSubmit={handleSubmit}
    />
  );
}
