import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';
import {useUsage} from './hooks/useUsage.js';

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

  const {usage} = useUsage();

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
      usage={usage}
      scrollRef={scrollRef}
      onSend={(content) => {
        void sendMessage(content);
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }}
      onStop={stopGeneration}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
