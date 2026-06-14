import {Skeleton} from '@heroui/react';
import clsx from 'clsx';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import type {ChatMessage} from '../../../../types.js';
import {WorkingIndicator} from '../WorkingIndicator/index.js';
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
      <div className={styles.content}>{renderContent(role, content)}</div>
    </div>
  );
}

function renderContent(role: ChatMessage['role'], content: string) {
  if (content) {
    return <MarkdownRenderer content={content} />;
  }
  if (role === 'assistant') {
    return <WorkingIndicator />;
  }
  return <Skeleton className={styles.skeleton} />;
}
