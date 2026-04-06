import {Button, Tooltip} from '@heroui/react';
import {MessageSquarePlus} from 'lucide-react';

import styles from './styles.module.css';

interface TitleBarViewProps {
  title: string | null;
  onNewSession: () => void;
  newSessionDisabled: boolean;
}

export function TitleBarView({
  title,
  onNewSession,
  newSessionDisabled,
}: TitleBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left} />
      <h2 className={styles.title}>{title ?? 'New Session'}</h2>
      <div className={styles.right}>
        <Tooltip delay={0}>
          <Tooltip.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='New session'
              isDisabled={newSessionDisabled}
              onPress={onNewSession}
            >
              <MessageSquarePlus size={16} />
            </Button>
          </Tooltip.Trigger>
          <Tooltip.Content>
            <p>New session</p>
          </Tooltip.Content>
        </Tooltip>
      </div>
    </div>
  );
}
