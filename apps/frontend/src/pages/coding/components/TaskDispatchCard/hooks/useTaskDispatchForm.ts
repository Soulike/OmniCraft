import {useCallback, useEffect, useMemo, useState} from 'react';

import type {TaskDispatchErrors, TaskDispatchValues} from '../types.js';

interface UseTaskDispatchFormOptions {
  readonly selectedWorkspace: string | undefined;
  readonly isBlocked: boolean;
  readonly onStartTask: (values: TaskDispatchValues) => Promise<void>;
}

export function useTaskDispatchForm({
  selectedWorkspace,
  isBlocked,
  onStartTask,
}: UseTaskDispatchFormOptions) {
  const [task, setTask] = useState('');
  const [errors, setErrors] = useState<TaskDispatchErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const trimmedTask = task.trim();
  const isBusy = isSubmitting;

  const canSubmit = useMemo(
    () =>
      !isBlocked &&
      !isBusy &&
      selectedWorkspace !== undefined &&
      trimmedTask.length > 0,
    [isBlocked, isBusy, selectedWorkspace, trimmedTask],
  );

  const updateTask = useCallback((value: string) => {
    setTask(value);
    setErrors((current) => {
      if (current.task === undefined) return current;
      if (current.workspace === undefined) return {};
      return {workspace: current.workspace};
    });
  }, []);

  useEffect(() => {
    if (selectedWorkspace === undefined) return;

    setErrors((current) => {
      if (current.workspace === undefined) return current;
      if (current.task === undefined) return {};
      return {task: current.task};
    });
  }, [selectedWorkspace]);

  const validate = useCallback((): TaskDispatchErrors => {
    return {
      ...(selectedWorkspace === undefined
        ? {workspace: 'Select a workspace before starting a task.'}
        : {}),
      ...(!trimmedTask
        ? {task: 'Describe the coding task before starting.'}
        : {}),
    };
  }, [selectedWorkspace, trimmedTask]);

  const submit = useCallback(async () => {
    if (isBlocked || isBusy) return;

    const nextErrors = validate();
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    if (selectedWorkspace === undefined) return;

    setIsSubmitting(true);
    try {
      await onStartTask({
        task: trimmedTask,
      });
    } finally {
      setIsSubmitting(false);
    }
  }, [
    isBlocked,
    isBusy,
    onStartTask,
    selectedWorkspace,
    trimmedTask,
    validate,
  ]);

  return {
    task,
    errors,
    isSubmitting,
    canSubmit,
    setTask: updateTask,
    submit,
  };
}
