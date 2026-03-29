import {MessageBubble} from './components/MessageBubble/index.js';
import {ToolExecutionCard} from './components/ToolExecutionCard/index.js';
import type {MessageRenderItem} from './hooks/useMessageList.js';
import styles from './styles.module.css';

interface MessageListViewProps {
  items: MessageRenderItem[];
}

export function MessageListView({items}: MessageListViewProps) {
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Send a message to start chatting.</p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.list}>
        {items.map((item, index) => (
          <RenderItem key={itemKey(item, index)} item={item} />
        ))}
      </div>
    </div>
  );
}

interface RenderItemProps {
  item: MessageRenderItem;
}

function RenderItem({item}: RenderItemProps) {
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

/** Produces a stable key for a render item. */
function itemKey(item: MessageRenderItem, index: number): string {
  if (item.type === 'tool-execution') {
    return `tool-${item.callId}`;
  }
  return `${item.type}-${index.toString()}`;
}
