import {useCallback, useState} from 'react';

import {EventBus} from '@/helpers/event-bus.js';
import {useAutoScroll} from '@/hooks/useAutoScroll.js';

import {ChatPageView} from './ChatPageView.js';
import {
  ChatEventBusProvider,
  type ChatEventMap,
  type ChatMessage,
} from './components/StreamingMessageDisplay/index.js';
import {SessionConfigProvider} from './contexts/SessionConfigContext/index.js';
import {useSessionConfig} from './hooks/useSessionConfig.js';
import {useSessionId} from './hooks/useSessionId.js';
import {useSessionLifecycle} from './hooks/useSessionLifecycle.js';
import {useSessionTitle} from './hooks/useSessionTitle.js';
import {useStreamChat} from './hooks/useStreamChat.js';

/** Chat page container. Wraps content in providers. */
export function ChatPage() {
  const [eventBus] = useState(() => new EventBus<ChatEventMap>());

  return (
    <ChatEventBusProvider eventBus={eventBus}>
      <SessionConfigProvider>
        <ChatPageContent eventBus={eventBus} />
      </SessionConfigProvider>
    </ChatEventBusProvider>
  );
}

/** Inner content that uses contexts. */
function ChatPageContent({eventBus}: {eventBus: EventBus<ChatEventMap>}) {
  const {
    sessionId,
    createNewSessionIdError,
    createNewSessionId,
    clearSessionId,
    clearCreateNewSessionIdError,
  } = useSessionId();

  const [messageCount, setMessageCount] = useState(0);
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

  const onMessagesChange = useCallback((messages: readonly ChatMessage[]) => {
    setMessageCount(messages.length);
  }, []);

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
