import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Wraps content in event bus provider. */
export function ChatPage() {
  return (
    <ChatEventBusProvider>
      <ChatPageContent />
    </ChatEventBusProvider>
  );
}

/** Inner content that uses the event bus via context. */
function ChatPageContent() {
  const {sessionId, sessionError, resetSession, clearSessionError} =
    useSession();

  const {messages} = useMessages();
  const {title} = useSessionTitle();

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({sessionId, resetSession});

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const displayError = sessionError ?? streamError;

  const dismissError = useCallback(() => {
    clearSessionError();
    clearStreamError();
  }, [clearSessionError, clearStreamError]);

  return (
    <ChatPageView
      title={title}
      messages={messages}
      isStreaming={isStreaming}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      onSend={(content) => {
        scrollToBottom();
        void sendMessage(content);
      }}
      onStop={stopGeneration}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
