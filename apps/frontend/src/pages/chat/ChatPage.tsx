import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Composes hooks and passes state to the view. */
export function ChatPage() {
  const {sessionId, sessionError, resetSession, clearSessionError} =
    useSession();

  const {
    messages,
    addUserMessage,
    appendAssistantText,
    pushToolExecutionStart,
    pushToolExecutionEnd,
    removeLastAssistantMessageIfEmpty,
  } = useMessages();

  const {title, requestTitle} = useSessionTitle();

  const handleFirstComplete = useCallback(
    (sid: string, userMsg: string, assistantMsg: string) => {
      void requestTitle(sid, userMsg, assistantMsg);
    },
    [requestTitle],
  );

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    resetSession,
    addUserMessage,
    appendAssistantText,
    pushToolExecutionStart,
    pushToolExecutionEnd,
    removeLastAssistantMessageIfEmpty,
    onFirstComplete: handleFirstComplete,
  });

  const scrollRef = useAutoScroll();

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
        void sendMessage(content);
      }}
      onStop={stopGeneration}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
