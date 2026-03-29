import {RenderItem} from './components/RenderItem/index.js';
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

/** Produces a stable key for a render item. */
function itemKey(item: MessageRenderItem, index: number): string {
  if (item.type === 'tool-execution') {
    return `tool-${item.callId}`;
  }
  return `${item.type}-${index.toString()}`;
}
