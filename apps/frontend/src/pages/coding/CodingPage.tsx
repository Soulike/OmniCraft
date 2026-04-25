import {useCallback, useMemo} from 'react';

import * as codingApi from '@/api/coding/index.js';
import {getVscodeUrl} from '@/api/vscode/index.js';
import {useAutoScroll} from '@/hooks/useAutoScroll.js';
import {
  ChatEventBusProvider,
  ChatSessionApiContext,
  SessionConfigProvider,
  SessionIdProvider,
  useChatEventBus,
  useMessageCount,
  useSessionConfig,
  useSessionId,
  useSessionTitle,
  useStreamChat,
  useVscodeStatus,
} from '@/modules/chat-session/index.js';
import {ROUTES} from '@/routes.js';

import {CodingPageView} from './CodingPageView.js';
import type {TaskDispatchValues} from './components/TaskDispatchCard/index.js';

/** Coding page container. Wraps content in providers. */
export function CodingPage() {
  return (
    <ChatSessionApiContext value={codingApi}>
      <ChatEventBusProvider>
        <SessionIdProvider
          buildSessionRoute={(id) => `${ROUTES.coding()}/${id}`}
          baseRoute={ROUTES.coding()}
        >
          <SessionConfigProvider>
            <CodingPageContent />
          </SessionConfigProvider>
        </SessionIdProvider>
      </ChatEventBusProvider>
    </ChatSessionApiContext>
  );
}

/** Inner content that uses contexts. */
function CodingPageContent() {
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

  const {selectedWorkspace, setSelectedWorkspace} = useSessionConfig();

  const {
    available: vscodeAvailable,
    port: vscodePort,
    connectionToken: vscodeToken,
  } = useVscodeStatus();

  const vscodeUrl = useMemo(() => {
    if (
      sessionId === null ||
      !vscodeAvailable ||
      selectedWorkspace === undefined
    ) {
      return null;
    }
    return getVscodeUrl(vscodePort, vscodeToken, selectedWorkspace);
  }, [sessionId, vscodeAvailable, vscodePort, vscodeToken, selectedWorkspace]);

  const createNewSessionIdWithConfig = useCallback(
    async (config?: {workspace?: string}) => {
      const workspace = config?.workspace ?? selectedWorkspace;
      if (workspace === undefined) {
        throw new Error('Please select a workspace before starting a session.');
      }
      return createNewSessionId({workspace});
    },
    [createNewSessionId, selectedWorkspace],
  );

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
    createNewSessionId: createNewSessionIdWithConfig,
  });

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const startTask = useCallback(
    async ({workspace, task, thinkingLevel}: TaskDispatchValues) => {
      setSelectedWorkspace(workspace);
      await sendMessage(task, thinkingLevel, {workspace});
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    },
    [sendMessage, scrollToBottom, setSelectedWorkspace],
  );

  const displayError = createNewSessionIdError ?? streamError;

  const dismissError = useCallback(() => {
    clearCreateNewSessionIdError();
    clearStreamError();
  }, [clearCreateNewSessionIdError, clearStreamError]);

  const isEmpty = messageCount === 0;
  const newSessionDisabled = (sessionId === null && isEmpty) || isStreaming;

  return (
    <CodingPageView
      title={title}
      eventBus={eventBus}
      isStreaming={isStreaming}
      isReconnecting={isReconnecting}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      sessionId={sessionId}
      onMessagesChange={onMessagesChange}
      onStartTask={startTask}
      onSend={(content, thinkingLevel) => {
        void sendMessage(content, thinkingLevel);
        requestAnimationFrame(() => {
          scrollToBottom();
        });
      }}
      onStop={stopGeneration}
      onNewSession={clearSessionId}
      newSessionDisabled={newSessionDisabled}
      vscodeUrl={vscodeUrl}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
