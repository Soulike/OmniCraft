import {useCallback, useState} from 'react';

interface UseTaskDeletionResult {
  readonly isDeleteOpen: boolean;
  readonly isDeleting: boolean;
  readonly onDeleteOpenChange: (open: boolean) => void;
  readonly onConfirmDelete: () => void;
}

/** Delete-confirmation state for a task row: popover open + in-flight guard. */
export function useTaskDeletion(
  onDelete: () => Promise<void>,
): UseTaskDeletionResult {
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const onConfirmDelete = useCallback(() => {
    setIsDeleting(true);
    void (async () => {
      try {
        await onDelete();
      } catch (error) {
        // The caller owns user-facing reporting (e.g. a toast). Catch here so a
        // rejecting onDelete can't surface as an unhandled promise rejection.
        console.error('Task deletion failed:', error);
      } finally {
        setIsDeleting(false);
        setIsDeleteOpen(false);
      }
    })();
  }, [onDelete]);

  return {
    isDeleteOpen,
    isDeleting,
    onDeleteOpenChange: setIsDeleteOpen,
    onConfirmDelete,
  };
}
