import type {RefObject} from 'react';

import type {ChatMessage} from '../../types.js';
import {MessageBubble} from './components/MessageBubble/index.js';
import styles from './styles.module.css';

interface MessageListProps {
  messages: ChatMessage[];
  scrollRef: RefObject<HTMLDivElement | null>;
}

export function MessageList({messages, scrollRef}: MessageListProps) {
  if (messages.length === 0) {
    return (
      <div className={styles.empty}>
        <p className={styles.emptyText}>Send a message to start chatting.</p>
      </div>
    );
  }

  return (
    <div className={styles.container} ref={scrollRef}>
      <div className={styles.list}>
        {messages.map((message, index) => (
          <div
            key={index}
            className={
              message.role === 'user'
                ? styles.userMessage
                : styles.assistantMessage
            }
          >
            <MessageBubble message={message} />
          </div>
        ))}
      </div>
    </div>
  );
}
