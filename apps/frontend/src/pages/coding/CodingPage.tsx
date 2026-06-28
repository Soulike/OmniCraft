import {useCallback, useMemo} from 'react';

import * as codingApi from '@/api/coding/index.js';
import {getVscodeUrl} from '@/api/vscode/index.js';
import {useAutoScroll} from '@/hooks/useAutoScroll.js';
import {
  ChatEventBusProvider,
  ChatSessionApiContext,
  SessionConfigProvider,
  SessionIdProvider,
  useAskUserSubmit,
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
import {NewSessionModal} from './components/NewSessionModal/index.js';
import {useNewSessionModal} from './hooks/useNewSessionModal.js';

/** Coding page container. Wraps content in providers. */
export function CodingPage() {
  return (
    <ChatSessionApiContext value={codingApi}>
      <ChatEventBusProvider>
        <SessionConfigProvider>
          <SessionIdProvider
            buildSessionRoute={(id) => `${ROUTES.coding()}/${id}`}
            baseRoute={ROUTES.coding()}
          >
            <CodingPageContent />
          </SessionIdProvider>
        </SessionConfigProvider>
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
    clearCreateNewSessionIdError,
  } = useSessionId();

  const handleAskUserSubmit = useAskUserSubmit();

  const {onMessagesChange} = useMessageCount();
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

  const {
    isStreaming,
    isReconnecting,
    streamError,
    maxRoundsReached,
    sendMessage,
    sendMessageToNewSession,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({sessionId, createNewSessionId});

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const scrollAfterPaint = useCallback(() => {
    requestAnimationFrame(() => {
      scrollToBottom();
    });
  }, [scrollToBottom]);

  const handleSessionCreated = useCallback(
    (workspacePath: string) => {
      setSelectedWorkspace(workspacePath);
      scrollAfterPaint();
    },
    [setSelectedWorkspace, scrollAfterPaint],
  );

  const newSession = useNewSessionModal({
    sendMessageToNewSession,
    onCreated: handleSessionCreated,
  });

  const handleSend = useCallback(
    async (content: string) => {
      await sendMessage(content);
      scrollAfterPaint();
    },
    [sendMessage, scrollAfterPaint],
  );

  const displayError = createNewSessionIdError ?? streamError;

  const dismissError = useCallback(() => {
    clearCreateNewSessionIdError();
    clearStreamError();
  }, [clearCreateNewSessionIdError, clearStreamError]);

  return (
    <>
      <CodingPageView
        title={title}
        eventBus={eventBus}
        isStreaming={isStreaming}
        isReconnecting={isReconnecting}
        error={displayError}
        maxRoundsReached={maxRoundsReached}
        scrollRef={scrollRef}
        sessionId={sessionId}
        onAskUserSubmit={handleAskUserSubmit}
        onMessagesChange={onMessagesChange}
        onSend={handleSend}
        onStop={stopGeneration}
        onNewSession={newSession.open}
        vscodeUrl={vscodeUrl}
        onDismissError={dismissError}
        onDismissMaxRoundsReached={clearMaxRoundsReached}
      />
      <NewSessionModal
        workspace={newSession.workspace}
        onClose={newSession.close}
        onSubmit={newSession.submit}
      />
    </>
  );
}
