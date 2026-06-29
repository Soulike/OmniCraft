import {useNewTaskForm} from './hooks/useNewTaskForm.js';
import {NewSessionModalView} from './NewSessionModalView.js';

interface NewSessionModalProps {
  readonly workspace: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (task: string) => Promise<void>;
}

export function NewSessionModal({
  workspace,
  onClose,
  onSubmit,
}: NewSessionModalProps) {
  const isOpen = workspace !== null;
  const form = useNewTaskForm({isOpen, onSubmit});

  return (
    <NewSessionModalView
      isOpen={isOpen}
      workspace={workspace}
      task={form.task}
      error={form.error}
      submitError={form.submitError}
      isSubmitting={form.isSubmitting}
      canSubmit={form.canSubmit}
      onTaskChange={form.handleTaskChange}
      onSubmit={() => {
        void form.submit();
      }}
      onClose={onClose}
    />
  );
}
