import {Skeleton} from '@heroui/react';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import type {ChatMessage} from '../../../../types.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
import styles from './styles.module.css';

interface MessageBubbleViewProps {
  role: ChatMessage['role'];
  content: string;
}

export function MessageBubbleView({role, content}: MessageBubbleViewProps) {
  if (role === 'user') {
    return (
      <div className={styles.userBubble}>
        <div className={styles.content}>
          {content ? (
            <MarkdownRenderer content={content} />
          ) : (
            <Skeleton className={styles.skeleton} />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={styles.assistant}>
      <div className={styles.assistantLabel}>
        <span className={styles.assistantDot} aria-hidden='true' />
        Assistant
      </div>
      <div className={styles.content}>
        {content ? (
          <MarkdownRenderer content={content} />
        ) : (
          <WorkingIndicator />
        )}
      </div>
    </div>
  );
}
