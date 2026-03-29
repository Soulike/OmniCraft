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
          <MessageBubble
            role='user'
            content={item.content}
            isStreaming={false}
          />
        </div>
      );
    case 'assistant-text':
      return (
        <div className={styles.assistantMessage}>
          <MessageBubble
            role='assistant'
            content={item.content}
            isStreaming={item.isStreaming}
          />
        </div>
      );
    case 'tool-execution':
      return (
        <div className={styles.assistantMessage}>
          <ToolExecutionCard
            toolName={item.toolName}
            arguments={item.arguments}
            status={item.status}
            result={item.result}
          />
        </div>
      );
  }
}
