import {
  Alert,
  Button,
  FieldError,
  Label,
  Modal,
  Spinner,
  TextArea,
  TextField,
} from '@heroui/react';
import {FolderCode} from 'lucide-react';

import {basename} from '@/helpers/path.js';

import styles from './styles.module.css';

interface NewSessionModalViewProps {
  readonly isOpen: boolean;
  readonly workspace: string | null;
  readonly task: string;
  readonly error: string | undefined;
  readonly submitError: string | null;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
  readonly onTaskChange: (task: string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}

export function NewSessionModalView({
  isOpen,
  workspace,
  task,
  error,
  submitError,
  isSubmitting,
  canSubmit,
  onTaskChange,
  onSubmit,
  onClose,
}: NewSessionModalViewProps) {
  const label = workspace ? basename(workspace) : '';

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog className={styles.dialog}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>New task in {label}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className={styles.body}>
              <div className={styles.wsCard}>
                <FolderCode size={16} className={styles.wsIcon} />
                <div className={styles.wsText}>
                  <span className={styles.wsName}>{label}</span>
                  <span className={styles.wsPath}>{workspace}</span>
                </div>
              </div>

              <TextField
                className={styles.field}
                isRequired
                isInvalid={error !== undefined}
                isDisabled={isSubmitting}
                value={task}
                onChange={onTaskChange}
              >
                <Label>Task</Label>
                <TextArea
                  aria-label='Task'
                  className={styles.taskInput}
                  placeholder='Describe the coding task: files, expected behavior, constraints, and how to verify.'
                  rows={8}
                />
                {!!error && (
                  <FieldError className={styles.fieldError}>{error}</FieldError>
                )}
              </TextField>

              {submitError !== null && (
                <Alert status='danger'>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{submitError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot='close' variant='ghost'>
              Cancel
            </Button>
            <Button
              variant='primary'
              isDisabled={!canSubmit}
              onPress={onSubmit}
            >
              {isSubmitting ? <Spinner size='sm' /> : 'Start task'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
