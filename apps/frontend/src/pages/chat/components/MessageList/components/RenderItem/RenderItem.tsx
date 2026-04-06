import clsx from 'clsx';

import {formatTimestamp} from '../../helpers/formatTimestamp.js';
import type {MessageRenderItem} from '../../hooks/useMessageList.js';
import {MessageBubble} from '../MessageBubble/index.js';
import {ToolExecutionCard} from '../ToolExecutionCard/index.js';
import styles from './styles.module.css';

interface RenderItemProps {
  item: MessageRenderItem;
}

export function RenderItem({item}: RenderItemProps) {
  switch (item.type) {
    case 'user-text':
      return (
        <div className={styles.userMessage}>
          <MessageBubble role='user' id={item.id} content={item.content} />
          {item.createdAt !== null && (
            <time className={styles.timestamp}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
    case 'assistant-text':
      return (
        <div className={styles.assistantMessage}>
          <MessageBubble role='assistant' id={item.id} content={item.content} />
          {item.createdAt !== null && (
            <time className={clsx(styles.timestamp, styles.timestampRight)}>
              {formatTimestamp(item.createdAt)}
            </time>
          )}
        </div>
      );
    case 'tool-execution':
      return (
        <div className={styles.assistantMessage}>
          <ToolExecutionCard
            toolName={item.toolName}
            displayName={item.displayName}
            arguments={item.arguments}
            status={item.status}
            result={item.result}
          />
        </div>
      );
  }
}
