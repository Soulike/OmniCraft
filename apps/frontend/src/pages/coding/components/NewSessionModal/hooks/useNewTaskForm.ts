import {useCallback, useEffect, useState} from 'react';

interface UseNewTaskFormOptions {
  readonly isOpen: boolean;
  readonly onSubmit: (task: string) => Promise<void>;
}

export function useNewTaskForm({isOpen, onSubmit}: UseNewTaskFormOptions) {
  const [task, setTask] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset the draft whenever the modal closes.
  useEffect(() => {
    if (isOpen) {
      return;
    }
    setTask('');
    setError(undefined);
    setSubmitError(null);
  }, [isOpen]);

  const trimmed = task.trim();
  const canSubmit = !isSubmitting && trimmed.length > 0;

  const handleTaskChange = useCallback((value: string) => {
    setTask(value);
    setError(undefined);
    setSubmitError(null);
  }, []);

  const submit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (trimmed.length === 0) {
      setError('Describe the coding task before starting.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(trimmed);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to start task.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, trimmed, onSubmit]);

  return {
    task,
    error,
    submitError,
    isSubmitting,
    canSubmit,
    handleTaskChange,
    submit,
  };
}
