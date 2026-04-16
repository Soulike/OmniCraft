import {Button, Popover} from '@heroui/react';
import {Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface SessionItemViewProps {
  title: string;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function SessionItemView({
  title,
  isDeleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
  isDeleting,
}: SessionItemViewProps) {
  return (
    <div className={styles.item}>
      <span className={styles.title}>{title}</span>
      <div className={styles.deleteButton}>
        <Popover isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
          <Popover.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Delete session'
            >
              <Trash2 size={14} />
            </Button>
          </Popover.Trigger>
          <Popover.Content placement='right'>
            <Popover.Dialog>
              <Popover.Heading>Delete session?</Popover.Heading>
              <p className={styles.popoverBody}>This cannot be undone.</p>
              <div className={styles.popoverActions}>
                <Button
                  size='sm'
                  variant='ghost'
                  onPress={() => {
                    onDeleteOpenChange(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size='sm'
                  variant='danger'
                  isDisabled={isDeleting}
                  onPress={onConfirmDelete}
                >
                  Delete
                </Button>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
}
