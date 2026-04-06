import {RenderItem} from './components/RenderItem/index.js';
import type {MessageRenderItem} from './hooks/useMessageList.js';
import styles from './styles.module.css';

interface MessageListViewProps {
  items: MessageRenderItem[];
  toolOutput: ReadonlyMap<string, string>;
}

export function MessageListView({items, toolOutput}: MessageListViewProps) {
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
          <RenderItem
            key={itemKey(item, index)}
            item={item}
            toolOutput={toolOutput}
          />
        ))}
      </div>
    </div>
  );
}

/** Produces a stable key for a render item. */
function itemKey(item: MessageRenderItem, index: number): string {
  switch (item.type) {
    case 'tool-execution':
      return `tool-${item.callId}`;
    case 'user-text':
    case 'assistant-text':
      return item.id ?? `${item.type}-${index.toString()}`;
  }
}
