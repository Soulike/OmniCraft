import {ScrollShadow} from '@heroui/react';
import {MessagesSquare} from 'lucide-react';
import type {RefObject} from 'react';

import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatMessage,
} from '@/modules/chat-events/index.js';
import {
  BottomBar,
  ChatAlert,
  ChatInput,
  SessionSidebar,
  TitleBarView,
} from '@/modules/chat-session/index.js';
import {StreamingMessageDisplay} from '@/modules/chat-stream/index.js';

import styles from './styles.module.css';

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
  onAskUserSubmit: AskUserSubmitHandler | null;
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
  onAskUserSubmit,
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
                <span className={styles.emptyGlyph} aria-hidden='true'>
                  <MessagesSquare size={26} />
                </span>
                <p className={styles.emptyStateText}>Start a conversation</p>
                <p className={styles.emptyStateHint}>
                  Ask anything, or describe a task to begin.
                </p>
              </div>
            )}
            <StreamingMessageDisplay
              eventBus={eventBus}
              onAskUserSubmit={onAskUserSubmit}
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
              onSend={onStartSession}
              onStop={onStop}
            />
          )}
        </div>
      </div>
    </div>
  );
}
