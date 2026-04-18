import {ScrollShadow} from '@heroui/react';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {RefObject} from 'react';

import {
  ChatAlert,
  type ChatEventBus,
  ChatInput,
  type ChatMessage,
  chatSessionStyles as styles,
  InfoBar,
  SessionSidebar,
  StreamingMessageDisplay,
  TitleBarView,
} from '@/modules/chat-session/index.js';

import {SessionSetup} from './components/SessionSetup/index.js';

interface ChatPageViewProps {
  title: string | null;
  eventBus: ChatEventBus;
  isEmpty: boolean;
  isStreaming: boolean;
  isReconnecting: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  onMessagesChange: (messages: readonly ChatMessage[]) => void;
  onSend: (content: string, thinkingLevel: ThinkingLevel) => void;
  onStop: () => void;
  onNewSession: () => void;
  newSessionDisabled: boolean;
  vscodeUrl: string | null;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function ChatPageView({
  title,
  eventBus,
  isEmpty,
  isStreaming,
  isReconnecting,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onMessagesChange,
  onSend,
  onStop,
  onNewSession,
  newSessionDisabled,
  vscodeUrl,
  onDismissError,
  onDismissMaxRoundsReached,
}: ChatPageViewProps) {
  return (
    <div className={styles.wrapper}>
      <SessionSidebar />
      <div className={styles.main}>
        <div className={styles.page}>
          {isReconnecting && (
            <ChatAlert
              status='warning'
              title='Reconnecting'
              message='Connection lost. Attempting to reconnect...'
            />
          )}
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
            vscodeUrl={vscodeUrl}
          />
          <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
            {isEmpty && !sessionId && (
              <div className={styles.emptyState}>
                <SessionSetup />
              </div>
            )}
            <StreamingMessageDisplay
              eventBus={eventBus}
              sessionId={sessionId}
              onMessagesChange={onMessagesChange}
            />
          </ScrollShadow>
          {sessionId && <InfoBar />}
          <ChatInput
            isStreaming={isStreaming}
            onSend={onSend}
            onStop={onStop}
          />
        </div>
      </div>
    </div>
  );
}
