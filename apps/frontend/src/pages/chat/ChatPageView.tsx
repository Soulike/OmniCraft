import {ScrollShadow} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {RefObject} from 'react';

import {ChatAlert} from './components/ChatAlert/index.js';
import {ChatInput} from './components/ChatInput/index.js';
import {InfoBar} from './components/InfoBar/index.js';
import {SessionSetup} from './components/SessionSetup/index.js';
import {
  type ChatEventBus,
  type ChatMessage,
  StreamingMessageDisplay,
} from './components/StreamingMessageDisplay/index.js';
import {TitleBarView} from './components/TitleBar/index.js';
import styles from './styles.module.css';

interface ChatPageViewProps {
  title: string | null;
  eventBus: ChatEventBus;
  isEmpty: boolean;
  isStreaming: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  onMessagesChange: (messages: readonly ChatMessage[]) => void;
  onSend: (content: string, thinkingLevel: ThinkingLevel) => void;
  onStop: () => void;
  onNewSession: () => void;
  newSessionDisabled: boolean;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  title,
  eventBus,
  isEmpty,
  isStreaming,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onMessagesChange,
  onSend,
  onStop,
  onNewSession,
  newSessionDisabled,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
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
      <TitleBarView
        title={title}
        onNewSession={onNewSession}
        newSessionDisabled={newSessionDisabled}
      />
      <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
        {isEmpty && !sessionId && (
          <div className={styles.emptyState}>
            <SessionSetup />
          </div>
        )}
        <StreamingMessageDisplay
          eventBus={eventBus}
          onMessagesChange={onMessagesChange}
        />
      </ScrollShadow>
      {sessionId && <InfoBar />}
      <ChatInput isStreaming={isStreaming} onSend={onSend} onStop={onStop} />
    </div>
  );
}
