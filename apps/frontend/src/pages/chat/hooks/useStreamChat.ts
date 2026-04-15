import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useEffect, useRef, useState} from 'react';

import {
  abortCompletion,
  sendMessage as apiSendMessage,
  subscribeEvents,
} from '@/api/chat/index.js';
import {HttpError} from '@/api/helpers/http-error.js';
import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventMap} from '../components/StreamingMessageDisplay/index.js';
import {routeBaseEventToBus} from '../helpers/route-base-event-to-bus.js';
import {useChatEventBus} from './useChatEventBus.js';
import type {useSessionId} from './useSessionId.js';

type SessionIdHook = ReturnType<typeof useSessionId>;

interface UseStreamChatOptions {
  sessionId: SessionIdHook['sessionId'];
  createNewSessionId: SessionIdHook['createNewSessionId'];
}

/** Exponential-backoff constants for SSE reconnection. */
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 30_000;
const MAX_RETRIES = 5;

/** Orchestrates the persistent SSE connection and message sending. */
export function useStreamChat({
  sessionId,
  createNewSessionId,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const subagentBusMapRef = useRef(new Map<string, EventBus<ChatEventMap>>());
  const eventBus = useChatEventBus();

  // Persistent SSE connection — connects when sessionId is set.
  useEffect(() => {
    if (!sessionId) return;

    const activeSessionId = sessionId;
    const controller = new AbortController();
    const subagentBusMap = subagentBusMapRef.current;

    async function consume(): Promise<void> {
      let lastUserMessage = '';
      let assistantText = '';
      let lastIndex = 0;
      let consecutiveFailures = 0;

      while (!controller.signal.aborted) {
        try {
          const eventStream = subscribeEvents(
            activeSessionId,
            lastIndex,
            controller.signal,
          );
          let receivedTerminalEvent = false;

          for await (const event of eventStream) {
            if (consecutiveFailures > 0) {
              consecutiveFailures = 0;
              setIsReconnecting(false);
            }

            switch (event.type) {
              case 'message-start':
                if (event.role === 'user') {
                  lastUserMessage = event.content;
                  assistantText = '';
                } else {
                  setIsStreaming(true);
                }
                routeBaseEventToBus(event, eventBus);
                break;
              case 'text-delta':
                assistantText += event.content;
                routeBaseEventToBus(event, eventBus);
                break;
              case 'tool-execute-start':
              case 'tool-execute-end':
              case 'tool-execute-delta':
              case 'thinking-start':
              case 'thinking-delta':
              case 'thinking-end':
                routeBaseEventToBus(event, eventBus);
                break;
              case 'done':
                receivedTerminalEvent = true;
                if (event.reason === 'max_rounds_reached') {
                  setMaxRoundsReached(true);
                }
                routeBaseEventToBus(event, eventBus);
                setIsStreaming(false);
                if (assistantText) {
                  eventBus.emit('turn-done', {
                    sessionId: activeSessionId,
                    userMessage: lastUserMessage,
                    assistantMessage: assistantText,
                  });
                }
                lastUserMessage = '';
                assistantText = '';
                break;
              case 'error':
                receivedTerminalEvent = true;
                eventBus.emit('stream-error', {message: event.message});
                setStreamError(event.message);
                setIsStreaming(false);
                break;
              case 'subagent-dispatch': {
                const bus = new EventBus<ChatEventMap>();
                subagentBusMap.set(event.agentId, bus);
                eventBus.emit('subagent-dispatched', {
                  agentId: event.agentId,
                  task: event.task,
                  agentType: event.agentType,
                  thinkingLevel: event.thinkingLevel,
                  workingDirectory: event.workingDirectory,
                  eventBus: bus,
                });
                break;
              }
              case 'subagent-output': {
                const bus = subagentBusMap.get(event.agentId);
                if (bus) routeBaseEventToBus(event.event, bus);
                break;
              }
              case 'subagent-complete': {
                eventBus.emit('subagent-completed', {
                  agentId: event.agentId,
                  status: event.status,
                });
                subagentBusMap.delete(event.agentId);
                break;
              }
            }
            lastIndex++;
          }

          if (receivedTerminalEvent) return;
          // Stream ended without a terminal event → unexpected disconnect.
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === 'AbortError') return;

          if (!isRetriableError(e)) {
            const message =
              e instanceof Error ? e.message : 'An unexpected error occurred';
            setStreamError(message);
            return;
          }
          // Retriable (network error / 5xx) → fall through to retry.
        }

        consecutiveFailures++;
        if (consecutiveFailures > MAX_RETRIES) {
          setStreamError('Connection lost. Please refresh the page.');
          return;
        }

        setIsReconnecting(true);
        const delay = Math.min(
          INITIAL_DELAY_MS * 2 ** (consecutiveFailures - 1),
          MAX_DELAY_MS,
        );
        const sleptFully = await abortableSleep(delay, controller.signal);
        if (!sleptFully) return;
      }
    }

    void consume();

    return () => {
      controller.abort();
      subagentBusMap.clear();
    };
  }, [sessionId, eventBus]);

  const sendMessage = useCallback(
    async (content: string, thinkingLevel: ThinkingLevel) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const activeSessionId = sessionId ?? (await createNewSessionId());
      if (!activeSessionId) return;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      eventBus.emit('user-message-sent', {content: trimmed});

      try {
        await apiSendMessage(activeSessionId, trimmed, thinkingLevel);
      } catch (e: unknown) {
        console.error('Failed to send message', e);
        const message =
          e instanceof Error ? e.message : 'Failed to send message';
        eventBus.emit('stream-error', {message});
        setStreamError(message);
        setIsStreaming(false);
      }
    },
    [isStreaming, sessionId, createNewSessionId, eventBus],
  );

  const stopGeneration = useCallback(() => {
    if (!sessionId) return;
    void abortCompletion(sessionId);
  }, [sessionId]);

  const clearStreamError = useCallback(() => {
    setStreamError(null);
  }, []);

  const clearMaxRoundsReached = useCallback(() => {
    setMaxRoundsReached(false);
  }, []);

  return {
    isStreaming,
    isReconnecting,
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Whether the error is a transient network/server issue worth retrying. */
function isRetriableError(e: unknown): boolean {
  if (e instanceof TypeError) return true;
  if (e instanceof HttpError && e.status >= 500) return true;
  return false;
}

/**
 * Returns a promise that resolves to `true` after {@link ms} milliseconds,
 * or `false` if the {@link signal} is aborted before the timer fires.
 */
function abortableSleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const timer = setTimeout(() => {
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener('abort', onAbort, {once: true});
  });
}
