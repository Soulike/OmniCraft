import {ScrollShadow} from '@heroui/react';
import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {InfoBar} from './components/InfoBar/index.js';
import {MessageList} from './components/MessageList/index.js';
import {SessionSetup} from './components/SessionSetup/index.js';
import styles from './styles.module.css';
import type {ChatMessage} from './types.js';

interface ChatPageViewProps {
  title: string | null;
  messages: ChatMessage[];
  isStreaming: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  onSend: (content: string) => void;
  onStop: () => void;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  title,
  messages,
  isStreaming,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onSend,
  onStop,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
  const isEmpty = messages.length === 0;

  return (
    <div className={styles.page}>
      {error && (
        <ChatAlert
          status='danger'
          title='Error'
          message={error}
          onDismiss={onDismissError}
        />
      )}
      {maxRoundsReached && (
        <ChatAlert
          status='warning'
          title='Tool limit reached'
          message='The assistant reached the maximum number of tool execution rounds. You can increase this limit in Settings > Agent.'
          onDismiss={onDismissMaxRoundsReached}
        />
      )}
      <h2 className={styles.title}>{title ?? 'New Session'}</h2>
      <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
        {isEmpty && !sessionId ? (
          <div className={styles.emptyState}>
            <SessionSetup />
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
      </ScrollShadow>
      {sessionId && <InfoBar />}
      <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
    </div>
  );
}
