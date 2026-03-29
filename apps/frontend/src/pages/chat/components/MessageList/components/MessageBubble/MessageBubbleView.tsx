import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import type {ChatMessage} from '../../../../types.js';
import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
}

export function MessageBubbleView({role, content}: MessageBubbleViewProps) {
  return (
    <div
      className={clsx(styles.bubble, {
        [styles.user]: role === 'user',
        [styles.assistant]: role === 'assistant',
      })}
    >
      <div className={styles.content}>
        {content || <Skeleton className={styles.skeleton} />}
      </div>
    </div>
  );
}
