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
