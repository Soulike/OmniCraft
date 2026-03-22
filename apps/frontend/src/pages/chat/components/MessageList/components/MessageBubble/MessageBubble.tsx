import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import type {ChatMessage} from '../../../../types.js';
import styles from './styles.module.css';

interface MessageBubbleProps {
  message: ChatMessage;
}

export function MessageBubble({message}: MessageBubbleProps) {
  return (
    <div
      className={clsx(styles.bubble, {
        [styles.user]: message.role === 'user',
        [styles.assistant]: message.role === 'assistant',
      })}
    >
      <div className={styles.content}>
        {message.content || <Skeleton className={styles.skeleton} />}
      </div>
    </div>
  );
}
