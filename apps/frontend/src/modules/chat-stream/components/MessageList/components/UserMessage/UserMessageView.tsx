import {Skeleton} from '@heroui/react';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';

import styles from './styles.module.css';

interface UserMessageViewProps {
  content: string;
}

export function UserMessageView({content}: UserMessageViewProps) {
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
