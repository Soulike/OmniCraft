import {ScrollShadow} from '@heroui/react';
import type {RefObject} from 'react';

import {
  BottomBar,
  ChatAlert,
  type ChatEventBus,
  ChatInput,
  type ChatMessage,
  chatSessionStyles as styles,
  SessionSidebar,
  StreamingMessageDisplay,
  TitleBarView,
} from '@/modules/chat-session/index.js';

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
  onStartSession: (content: string) => void;
  onSend: (content: string) => void;
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
  isReconnecting,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onMessagesChange,
  onStartSession,
  onSend,
  onStop,
  onNewSession,
  newSessionDisabled,
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
          />
          <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
            {isEmpty && !sessionId && (
              <div className={styles.emptyState}>
                <p className={styles.emptyStateText}>
                  Start a conversation below.
                </p>
              </div>
            )}
            <StreamingMessageDisplay
              eventBus={eventBus}
              sessionId={sessionId}
              onMessagesChange={onMessagesChange}
            />
          </ScrollShadow>
          {sessionId && <BottomBar />}
          {sessionId ? (
            <ChatInput
              isStreaming={isStreaming}
              onSend={onSend}
              onStop={onStop}
            />
          ) : (
            <ChatInput
              isStreaming={isStreaming}
              showThinkingLevelSelect
              onSend={onStartSession}
              onStop={onStop}
            />
          )}
        </div>
      </div>
    </div>
  );
}
