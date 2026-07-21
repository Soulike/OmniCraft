import {Button, Popover} from '@heroui/react';
import {Trash2} from 'lucide-react';

import styles from './styles.module.css';

interface TaskListItemViewProps {
  title: string;
  timeLabel: string | null;
  isSelected: boolean;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function TaskListItemView({
  title,
  timeLabel,
  isSelected,
  isDeleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
  isDeleting,
}: TaskListItemViewProps) {
  return (
    <div
      className={styles.item}
      data-selected={isSelected ? 'true' : undefined}
    >
      <span aria-hidden='true' className={styles.dot} />
      <div className={styles.content}>
        <span className={styles.title}>{title}</span>
        {timeLabel !== null && <span className={styles.meta}>{timeLabel}</span>}
      </div>
      <div className={styles.actions}>
        <Popover isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
          <Popover.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Delete task'
            >
              <Trash2 size={14} />
            </Button>
          </Popover.Trigger>
          <Popover.Content placement='right'>
            <Popover.Dialog>
              <Popover.Heading>Delete task?</Popover.Heading>
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
