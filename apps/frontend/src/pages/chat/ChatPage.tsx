import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Composes hooks and passes state to the view. */
export function ChatPage() {
  const {sessionId, sessionError, clearSessionError} = useSession();

  const {
    messages,
    addUserMessage,
    appendTextToLastAssistant,
    pushContentToLastAssistant,
    removeLastAssistantMessageIfEmpty,
  } = useMessages();

  const {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({
    sessionId,
    addUserMessage,
    appendTextToLastAssistant,
    pushContentToLastAssistant,
    removeLastAssistantMessageIfEmpty,
  });

  const scrollRef = useAutoScroll();

  const displayError = sessionError ?? streamError;

  const dismissError = useCallback(() => {
    clearSessionError();
    clearStreamError();
  }, [clearSessionError, clearStreamError]);

  return (
    <ChatPageView
      messages={messages}
      isInputDisabled={isStreaming || !sessionId}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      onSend={(content) => {
        void sendMessage(content);
      }}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
