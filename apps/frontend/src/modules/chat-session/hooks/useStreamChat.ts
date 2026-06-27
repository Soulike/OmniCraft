import type {SseEventCursorEntry} from '@omnicraft/sse-events';
import {useCallback, useEffect, useEffectEvent, useRef, useState} from 'react';

import {HttpError} from '@/api/helpers/http-error.js';
import {abortableSleep} from '@/helpers/abortable-sleep.js';
import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {routeBaseEventToBus} from '../helpers/route-base-event-to-bus.js';
import {SubagentEventBus} from '../helpers/subagent-event-bus.js';
import {useChatEventBus} from './useChatEventBus.js';
import {useChatSessionApi} from './useChatSessionApi.js';
import type {useSessionId} from './useSessionId.js';

type SessionIdHook = ReturnType<typeof useSessionId>;
type CreateNewSessionOptions = Parameters<
  SessionIdHook['createNewSessionId']
>[0];

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
  const subagentBusMapRef = useRef(new Map<string, ChatEventBus>());
  const eventBus = useChatEventBus();
  const {
    sendMessage: apiSendMessage,
    subscribeEvents,
    abortCompletion,
  } = useChatSessionApi();

  // Reset transient state when session changes.
  useEffect(() => {
    const onReset = () => {
      setIsStreaming(false);
      setIsReconnecting(false);
      setStreamError(null);
      setMaxRoundsReached(false);
    };
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus]);

  // Opens the event stream using the latest subscribeEvents. Reading it here
  // (instead of as an Effect dependency) keeps the connection keyed on
  // sessionId only.
  const openEventStream = useEffectEvent(
    (activeSessionId: string, from: number, signal: AbortSignal) =>
      subscribeEvents(activeSessionId, from, signal),
  );

  // Dispatches a single stream event onto the latest eventBus. Returns true
  // when the event terminates the current round (done / error).
  const dispatchStreamEvent = useEffectEvent(
    (event: SseEventCursorEntry['event']): boolean => {
      const subagentBusMap = subagentBusMapRef.current;
      switch (event.type) {
        case 'message-start':
          if (event.role === 'assistant') {
            setIsStreaming(true);
          }
          routeBaseEventToBus(event, eventBus);
          break;
        case 'text-delta':
        case 'tool-execute-start':
        case 'tool-execute-end':
        case 'tool-execute-delta':
        case 'thinking-start':
        case 'thinking-delta':
        case 'thinking-end':
        case 'context-compaction-start':
        case 'context-compaction-end':
        case 'context-compaction-error':
          routeBaseEventToBus(event, eventBus);
          break;
        case 'todo-update':
          eventBus.emit('todo-update', event);
          break;
        case 'usage-update':
          routeBaseEventToBus(event, eventBus);
          break;
        case 'done':
          if (event.reason === 'max_rounds_reached') {
            setMaxRoundsReached(true);
          }
          routeBaseEventToBus(event, eventBus);
          setIsStreaming(false);
          return true;
        case 'session-title':
          eventBus.emit('session-title', event);
          break;
        case 'stop-check-reminder':
          // Hidden reminder: not routed to the UI. It remains in
          // sse-events.jsonl for debugging.
          break;
        case 'error':
          eventBus.emit('stream-error', {message: event.message});
          setStreamError(event.message);
          setIsStreaming(false);
          return true;
        case 'subagent-dispatch':
        case 'subagent-resume': {
          const bus = new SubagentEventBus();
          subagentBusMap.set(event.agentId, bus);
          eventBus.emit('subagent-dispatched', {
            mode: event.type === 'subagent-dispatch' ? 'dispatch' : 'resume',
            agentId: event.agentId,
            nickname: event.nickname,
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
      return false;
    },
  );

  // Persistent SSE connection — connects when sessionId is set.
  useEffect(() => {
    if (!sessionId) return;

    const activeSessionId = sessionId;
    const controller = new AbortController();
    const subagentBusMap = subagentBusMapRef.current;

    async function consume(): Promise<void> {
      let lastIndex = 0;
      let consecutiveFailures = 0;

      while (!controller.signal.aborted) {
        try {
          const eventStream = openEventStream(
            activeSessionId,
            lastIndex,
            controller.signal,
          );
          let receivedTerminalEvent = false;

          for await (const streamEvent of eventStream) {
            const {event, nextIndex} = streamEvent;
            if (consecutiveFailures > 0) {
              consecutiveFailures = 0;
              setIsReconnecting(false);
            }

            if (dispatchStreamEvent(event)) {
              receivedTerminalEvent = true;
            }
            lastIndex = nextIndex;
          }

          if (receivedTerminalEvent) return;
          // Stream ended without a terminal event → unexpected disconnect.
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === 'AbortError') return;

          if (!isRetriableError(e)) {
            const message =
              e instanceof Error ? e.message : 'An unexpected error occurred';
            setIsReconnecting(false);
            setStreamError(message);
            return;
          }
          // Retriable (network error / 5xx) → fall through to retry.
        }

        consecutiveFailures++;
        if (consecutiveFailures > MAX_RETRIES) {
          setIsReconnecting(false);
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
  }, [sessionId]);

  const sendMessageToSession = useCallback(
    async (targetSessionId: string, content: string) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      eventBus.emit('user-message-sent', {content: trimmed});

      try {
        await apiSendMessage(targetSessionId, trimmed);
      } catch (e: unknown) {
        console.error('Failed to send message', e);
        const message =
          e instanceof Error ? e.message : 'Failed to send message';
        eventBus.emit('stream-error', {message});
        setStreamError(message);
        setIsStreaming(false);
      }
    },
    [isStreaming, eventBus, apiSendMessage],
  );

  const sendMessageToNewSession = useCallback(
    async (content: string, createSessionOptions?: CreateNewSessionOptions) => {
      if (isStreaming) return null;

      const trimmed = content.trim();
      if (!trimmed) return null;

      const newSessionId = await createNewSessionId(createSessionOptions);
      if (!newSessionId) return null;

      await sendMessageToSession(newSessionId, trimmed);
      return newSessionId;
    },
    [isStreaming, createNewSessionId, sendMessageToSession],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      if (sessionId === null) {
        throw new Error('Cannot send a follow-up message without a session.');
      }

      await sendMessageToSession(sessionId, content);
    },
    [sessionId, sendMessageToSession],
  );

  const stopGeneration = useCallback(() => {
    if (!sessionId) return;
    void abortCompletion(sessionId);
  }, [sessionId, abortCompletion]);

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
    sendMessageToNewSession,
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
