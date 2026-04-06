import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import type {ChatMessage} from '../../../../types.js';
import {formatTimestamp} from './helpers/formatTimestamp.js';
import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
  createdAt: number | null;
}

export function MessageBubbleView({
  role,
  content,
  createdAt,
}: MessageBubbleViewProps) {
  return (
    <div
      className={clsx(styles.bubble, {
        [styles.user]: role === 'user',
        [styles.assistant]: role === 'assistant',
      })}
    >
      <div className={styles.content}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <Skeleton className={styles.skeleton} />
        )}
      </div>
      {createdAt !== null && (
        <time className={styles.timestamp}>{formatTimestamp(createdAt)}</time>
      )}
    </div>
  );
}
