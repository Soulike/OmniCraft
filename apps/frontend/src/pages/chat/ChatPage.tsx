import {useCallback} from 'react';

import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {ChatEventBusProvider} from './contexts/ChatEventBusContext/index.js';
import {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
import {SessionIdProvider} from './contexts/SessionIdContext/index.js';
import {useChatEventBus} from './hooks/useChatEventBus.js';
import {useMessageCount} from './hooks/useMessageCount.js';
import {useSessionConfig} from './hooks/useSessionConfig.js';
import {useSessionId} from './hooks/useSessionId.js';
import {useSessionLifecycle} from './hooks/useSessionLifecycle.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Wraps content in providers. */
export function ChatPage() {
  return (
    <SessionIdProvider>
      <ChatEventBusProvider>
        <SessionConfigProvider>
          <ChatPageContent />
        </SessionConfigProvider>
      </ChatEventBusProvider>
    </SessionIdProvider>
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

  const resetDisplay = useCallback(() => {
    eventBus.emit('reset');
  }, [eventBus]);

  const {startNewSession} = useSessionLifecycle({
    stopGeneration,
    clearSessionId,
    resetDisplay,
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

  const isEmpty = messageCount === 0;
  const newSessionDisabled = (sessionId === null && isEmpty) || isStreaming;

  return (
    <ChatPageView
      title={title}
      eventBus={eventBus}
      isEmpty={isEmpty}
      isStreaming={isStreaming}
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
      onNewSession={startNewSession}
      newSessionDisabled={newSessionDisabled}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
