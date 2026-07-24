import {Button, Popover} from '@heroui/react';
import {useState} from 'react';

import styles from './styles.module.css';

interface RemoveServerButtonProps {
  serverName: string;
  isDisabled: boolean;
  onConfirm: () => void;
}

export function RemoveServerButton({
  serverName,
  isDisabled,
  onConfirm,
}: RemoveServerButtonProps) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Popover isOpen={isOpen} onOpenChange={setIsOpen}>
      <Button size='sm' variant='danger' isDisabled={isDisabled}>
        Remove
      </Button>
      <Popover.Content className={styles.content}>
        <Popover.Dialog className={styles.dialog}>
          <p className={styles.text}>
            Remove <span className={styles.name}>{serverName}</span>?
          </p>
          <div className={styles.actions}>
            <Button
              size='sm'
              variant='ghost'
              onPress={() => {
                setIsOpen(false);
              }}
            >
              Cancel
            </Button>
            <Button
              size='sm'
              variant='danger'
              onPress={() => {
                setIsOpen(false);
                onConfirm();
              }}
            >
              Remove
            </Button>
          </div>
        </Popover.Dialog>
      </Popover.Content>
    </Popover>
  );
}
