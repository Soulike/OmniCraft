import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {useCallback, useEffect, useRef, useState} from 'react';

import {
  abortCompletion,
  sendMessage as apiSendMessage,
  subscribeEvents,
} from '@/api/chat/index.js';
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

/** Orchestrates the persistent SSE connection and message sending. */
export function useStreamChat({
  sessionId,
  createNewSessionId,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const subagentBusMapRef = useRef(new Map<string, EventBus<ChatEventMap>>());
  const eventBus = useChatEventBus();

  // Persistent SSE connection — connects when sessionId is set.
  useEffect(() => {
    if (!sessionId) return;

    const controller = new AbortController();
    let lastUserMessage = '';
    let assistantText = '';

    const subagentBusMap = subagentBusMapRef.current;

    eventBus.emit('reset');

    void (async () => {
      try {
        for await (const event of subscribeEvents(
          sessionId,
          0,
          controller.signal,
        )) {
          routeEvent(
            event,
            eventBus,
            subagentBusMap,
            setIsStreaming,
            setStreamError,
            setMaxRoundsReached,
          );

          // Track turn context for title generation
          if (event.type === 'message-start' && event.role === 'user') {
            lastUserMessage = event.content;
            assistantText = '';
          }
          if (event.type === 'text-delta') {
            assistantText += event.content;
          }
          if (event.type === 'done') {
            if (assistantText) {
              eventBus.emit('turn-done', {
                sessionId,
                userMessage: lastUserMessage,
                assistantMessage: assistantText,
              });
            }
            lastUserMessage = '';
            assistantText = '';
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        console.error('SSE connection failed', e);
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setStreamError(message);
      }
    })();

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
    streamError,
    maxRoundsReached,
    sendMessage,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  };
}

// ---------------------------------------------------------------------------
// Event routing — extracted to keep the hook body readable
// ---------------------------------------------------------------------------

function routeEvent(
  event: SseEvent,
  eventBus: EventBus<ChatEventMap>,
  subagentBusMap: Map<string, EventBus<ChatEventMap>>,
  setIsStreaming: (v: boolean) => void,
  setStreamError: (v: string | null) => void,
  setMaxRoundsReached: (v: boolean) => void,
): void {
  switch (event.type) {
    case 'text-delta':
    case 'tool-execute-start':
    case 'tool-execute-end':
    case 'tool-execute-delta':
    case 'message-start':
    case 'thinking-start':
    case 'thinking-delta':
    case 'thinking-end':
      if (event.type === 'message-start' && event.role === 'assistant') {
        setIsStreaming(true);
      }
      routeBaseEventToBus(event, eventBus);
      break;
    case 'done':
      if (event.reason === 'max_rounds_reached') {
        setMaxRoundsReached(true);
      }
      routeBaseEventToBus(event, eventBus);
      setIsStreaming(false);
      break;
    case 'error':
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
}
