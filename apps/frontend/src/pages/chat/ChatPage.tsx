import {useCallback} from 'react';

import * as chatApi from '@/api/chat/index.js';
import {useAutoScroll} from '@/hooks/useAutoScroll.js';
import {
  ChatEventBusProvider,
  ChatSessionApiContext,
  SessionIdProvider,
  useChatEventBus,
  useMessageCount,
  useSessionId,
  useSessionTitle,
  useStreamChat,
} from '@/modules/chat-session/index.js';
import {ROUTES} from '@/routes.js';

import {ChatPageView} from './ChatPageView.js';

/** Chat page container. Wraps content in providers. */
export function ChatPage() {
  return (
    <ChatSessionApiContext value={chatApi}>
      <ChatEventBusProvider>
        <SessionIdProvider
          buildSessionRoute={(id) => `${ROUTES.chat()}/${id}`}
          baseRoute={ROUTES.chat()}
        >
          <ChatPageContent />
        </SessionIdProvider>
      </ChatEventBusProvider>
    </ChatSessionApiContext>
  );
}

/** Inner content that uses contexts. */
function ChatPageContent() {
  const eventBus = useChatEventBus();

  const {
    sessionId,
    createNewSessionIdError,
    createNewSessionId,
    clearSessionId,
    clearCreateNewSessionIdError,
  } = useSessionId();

  const {messageCount, onMessagesChange} = useMessageCount();
  const {title} = useSessionTitle();

  const {
    isStreaming,
    isReconnecting,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    createNewSessionId,
  });

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const displayError = createNewSessionIdError ?? streamError;

  const dismissError = useCallback(() => {
    clearCreateNewSessionIdError();
    clearStreamError();
  }, [clearCreateNewSessionIdError, clearStreamError]);

  const isEmpty = messageCount === 0;
  const newSessionDisabled = (sessionId === null && isEmpty) || isStreaming;

  return (
    <ChatPageView
      title={title}
      eventBus={eventBus}
      isEmpty={isEmpty}
      isStreaming={isStreaming}
      isReconnecting={isReconnecting}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      sessionId={sessionId}
      onMessagesChange={onMessagesChange}
      onSend={(content, thinkingLevel) => {
        void sendMessage(content, thinkingLevel);
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }}
      onStop={stopGeneration}
      onNewSession={clearSessionId}
      newSessionDisabled={newSessionDisabled}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
