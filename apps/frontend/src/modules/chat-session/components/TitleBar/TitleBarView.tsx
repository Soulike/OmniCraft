import {Button, Tooltip} from '@heroui/react';
import {Code, MessageSquarePlus} from 'lucide-react';

import styles from './styles.module.css';

interface TitleBarViewProps {
  title: string | null;
  onNewSession: () => void;
  newSessionDisabled: boolean;
  vscodeUrl?: string | null;
}

export function TitleBarView({
  title,
  onNewSession,
  newSessionDisabled,
  vscodeUrl,
}: TitleBarViewProps) {
  return (
    <div className={styles.container}>
      <div className={styles.left} />
      <h2 className={styles.title}>{title ?? 'New Session'}</h2>
      <div className={styles.right}>
        {!!vscodeUrl && (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <a href={vscodeUrl} target='_blank' rel='noreferrer'>
                <Button
                  isIconOnly
                  size='sm'
                  variant='ghost'
                  aria-label='Open in VSCode'
                >
                  <Code size={16} />
                </Button>
              </a>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>Open workspace in VSCode</p>
            </Tooltip.Content>
          </Tooltip>
        )}
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
