import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
import {useMessages} from './hooks/useMessages.js';
import {useSessionConfig} from './hooks/useSessionConfig.js';
import {useSessionId} from './hooks/useSessionId.js';
import {useSessionLifecycle} from './hooks/useSessionLifecycle.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Wraps content in providers. */
export function ChatPage() {
  return (
    <ChatEventBusProvider>
      <SessionConfigProvider>
        <ChatPageContent />
      </SessionConfigProvider>
    </ChatEventBusProvider>
  );
}

/** Inner content that uses contexts. */
function ChatPageContent() {
  const {
    sessionId,
    createNewSessionIdError,
    createNewSessionId,
    clearSessionId,
    clearCreateNewSessionIdError,
  } = useSessionId();

  const {messages, clearMessages} = useMessages();
  const {title, clearTitle} = useSessionTitle();

  const {selectedWorkspace, selectedExtraAllowedPaths} = useSessionConfig();

  const createNewSessionIdWithConfig = useCallback(
    async () =>
      createNewSessionId({
        workspace: selectedWorkspace,
        extraAllowedPaths:
          selectedExtraAllowedPaths.length > 0
            ? selectedExtraAllowedPaths
            : undefined,
      }),
    [createNewSessionId, selectedWorkspace, selectedExtraAllowedPaths],
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
    createNewSessionId: createNewSessionIdWithConfig,
  });

  const {startNewSession} = useSessionLifecycle({
    stopGeneration,
    clearSessionId,
    clearMessages,
    clearTitle,
    clearStreamError,
    clearMaxRoundsReached,
  });

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const displayError = createNewSessionIdError ?? streamError;

  const dismissError = useCallback(() => {
    clearCreateNewSessionIdError();
    clearStreamError();
  }, [clearCreateNewSessionIdError, clearStreamError]);

  const newSessionDisabled =
    (sessionId === null && messages.length === 0) || isStreaming;

  return (
    <ChatPageView
      title={title}
      messages={messages}
      isStreaming={isStreaming}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      sessionId={sessionId}
      onSend={(content) => {
        void sendMessage(content);
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }}
      onStop={stopGeneration}
      onNewSession={startNewSession}
      newSessionDisabled={newSessionDisabled}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
