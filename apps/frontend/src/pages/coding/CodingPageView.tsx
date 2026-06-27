import {ScrollShadow} from '@heroui/react';
import type {RefObject} from 'react';

import {CollapsibleSidebar} from '@/components/CollapsibleSidebar/index.js';
import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatMessage,
} from '@/modules/chat-events/index.js';
import {
  BottomBar,
  ChatAlert,
  ChatInput,
  SessionList,
  TitleBarView,
} from '@/modules/chat-session/index.js';
import {StreamingMessageDisplay} from '@/modules/chat-stream/index.js';

import {TaskDispatchCard} from './components/TaskDispatchCard/index.js';
import styles from './styles.module.css';

interface CodingPageViewProps {
  title: string | null;
  eventBus: ChatEventBus;
  isStreaming: boolean;
  isReconnecting: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  onAskUserSubmit: AskUserSubmitHandler | null;
  onMessagesChange: (messages: readonly ChatMessage[]) => void;
  onStartTask: (content: string) => Promise<void>;
  onSend: (content: string) => Promise<void>;
  onStop: () => void;
  onNewSession: () => void;
  newSessionDisabled: boolean;
  vscodeUrl: string | null;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function CodingPageView({
  title,
  eventBus,
  isStreaming,
  isReconnecting,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onAskUserSubmit,
  onMessagesChange,
  onStartTask,
  onSend,
  onStop,
  onNewSession,
  newSessionDisabled,
  vscodeUrl,
  onDismissError,
  onDismissMaxRoundsReached,
}: CodingPageViewProps) {
  return (
    <div className={styles.wrapper}>
      <CollapsibleSidebar title='Sessions'>
        <SessionList />
      </CollapsibleSidebar>
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
            {!sessionId && (
              <div className={styles.emptyState}>
                <TaskDispatchCard onSend={onStartTask} />
              </div>
            )}
            <StreamingMessageDisplay
              eventBus={eventBus}
              onAskUserSubmit={onAskUserSubmit}
              onMessagesChange={onMessagesChange}
            />
          </ScrollShadow>
          {sessionId && <BottomBar />}
          {sessionId && (
            <ChatInput
              isStreaming={isStreaming}
              onSend={(content) => {
                void onSend(content);
              }}
              onStop={onStop}
            />
          )}
        </div>
      </div>
    </div>
  );
}
