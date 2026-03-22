import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {useMessages} from './hooks/useMessages.js';
import {useSession} from './hooks/useSession.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Composes hooks and passes state to the view. */
export function ChatPage() {
  const {sessionId, sessionError} = useSession();

  const {messages, addUserMessage, appendToLastAssistantMessage} =
    useMessages();

  const {isStreaming, error, sendMessage, clearError} = useStreamChat({
    sessionId,
    addUserMessage,
    appendToLastAssistantMessage,
  });

  const scrollRef = useAutoScroll([messages]);

  const displayError = sessionError ?? error;

  return (
    <ChatPageView
      messages={messages}
      isInputDisabled={isStreaming || !sessionId}
      error={displayError}
      scrollRef={scrollRef}
      onSend={(content) => {
        void sendMessage(content);
      }}
      onDismissError={clearError}
    />
  );
}
