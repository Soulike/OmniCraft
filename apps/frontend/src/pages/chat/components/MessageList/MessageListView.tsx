import {MessageBubble} from './components/MessageBubble/index.js';
import {ToolExecutionCard} from './components/ToolExecutionCard/index.js';
import type {
  AssistantMessageRenderItem,
  AssistantSegment,
  MessageRenderItem,
} from './hooks/useMessageList.js';
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
        {items.map((item, index) => {
          if (item.type === 'user') {
            return (
              <div key={index} className={styles.userMessage}>
                <MessageBubble
                  role='user'
                  content={item.text}
                  isStreaming={false}
                />
              </div>
            );
          }

          return (
            <div key={index} className={styles.assistantMessage}>
              <AssistantSegments segments={item.segments} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface AssistantSegmentsProps {
  segments: AssistantMessageRenderItem['segments'];
}

function AssistantSegments({segments}: AssistantSegmentsProps) {
  if (segments.length === 0) {
    return <MessageBubble role='assistant' content='' isStreaming={false} />;
  }

  return (
    <div className={styles.segmentList}>
      {segments.map((segment, index) => (
        <SegmentRenderer key={segmentKey(segment, index)} segment={segment} />
      ))}
    </div>
  );
}

interface SegmentRendererProps {
  segment: AssistantSegment;
}

function SegmentRenderer({segment}: SegmentRendererProps) {
  if (segment.type === 'text') {
    return (
      <MessageBubble
        role='assistant'
        content={segment.content}
        isStreaming={segment.isStreaming}
      />
    );
  }

  return (
    <ToolExecutionCard
      toolName={segment.toolName}
      arguments={segment.arguments}
      status={segment.status}
      result={segment.result}
    />
  );
}

/** Produces a stable key for a segment. Namespaced to avoid collisions. */
function segmentKey(segment: AssistantSegment, index: number): string {
  if (segment.type === 'tool-execution') {
    return `tool-${segment.callId}`;
  }
  return `text-${index.toString()}`;
}
