import {toast} from '@heroui/react';
import type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';
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
  useChatSessionApi,
  useMessageCount,
  useSessionConfig,
  useSessionId,
  useSessionTitle,
  useStreamChat,
  useVscodeStatus,
} from '@/modules/chat-session/index.js';
import {ROUTES} from '@/routes.js';

import {CodingPageView} from './CodingPageView.js';

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
    clearSessionId,
    clearCreateNewSessionIdError,
  } = useSessionId();

  const {submitToolResponse} = useChatSessionApi();

  const handleAskUserSubmit = useCallback(
    (callId: string, result: AskUserBridgeResponse) => {
      if (sessionId === null) return;
      submitToolResponse(sessionId, callId, result).catch(() => {
        toast.danger('Failed to submit response. Please try again.');
      });
    },
    [sessionId, submitToolResponse],
  );

  const {messageCount, onMessagesChange} = useMessageCount();
  const {title} = useSessionTitle();

  const {selectedWorkspace} = useSessionConfig();

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
  } = useStreamChat({
    sessionId,
    createNewSessionId,
  });

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const handleStartTask = useCallback(
    async (content: string) => {
      if (selectedWorkspace === undefined) {
        throw new Error('Please select a workspace before starting a session.');
      }
      await sendMessageToNewSession(content, {
        workspace: selectedWorkspace,
      });
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    },
    [sendMessageToNewSession, scrollToBottom, selectedWorkspace],
  );

  const handleSend = useCallback(
    async (content: string) => {
      await sendMessage(content);
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    },
    [sendMessage, scrollToBottom],
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
      onAskUserSubmit={handleAskUserSubmit}
      onMessagesChange={onMessagesChange}
      onStartTask={handleStartTask}
      onSend={handleSend}
      onStop={stopGeneration}
      onNewSession={clearSessionId}
      newSessionDisabled={newSessionDisabled}
      vscodeUrl={vscodeUrl}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
