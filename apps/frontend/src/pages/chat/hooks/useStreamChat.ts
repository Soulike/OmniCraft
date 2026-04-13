import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useRef, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';
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

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  createNewSessionId,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const subagentBusMapRef = useRef(new Map<string, EventBus<ChatEventMap>>());
  const eventBus = useChatEventBus();

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

      const abortController = new AbortController();
      abortControllerRef.current = abortController;

      eventBus.emit('user-message-sent', {content: trimmed});

      let assistantText = '';

      try {
        const stream = streamChatCompletion(
          activeSessionId,
          trimmed,
          thinkingLevel,
          abortController.signal,
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              assistantText += event.content;
              routeBaseEventToBus(event, eventBus);
              break;
            case 'done':
              if (event.reason === 'max_rounds_reached') {
                setMaxRoundsReached(true);
              }
              routeBaseEventToBus(event, eventBus);
              break;
            case 'message-start':
            case 'tool-execute-start':
            case 'tool-execute-end':
            case 'tool-execute-delta':
            case 'thinking-start':
            case 'thinking-delta':
            case 'thinking-end':
              routeBaseEventToBus(event, eventBus);
              break;
            case 'error':
              eventBus.emit('stream-error', {message: event.message});
              setStreamError(event.message);
              break;
            case 'subagent-dispatch': {
              const bus = new EventBus<ChatEventMap>();
              subagentBusMapRef.current.set(event.agentId, bus);
              eventBus.emit('subagent-dispatched', {
                agentId: event.agentId,
                task: event.task,
                eventBus: bus,
              });
              break;
            }
            case 'subagent-output': {
              const bus = subagentBusMapRef.current.get(event.agentId);
              if (bus) routeBaseEventToBus(event.event, bus);
              break;
            }
            case 'subagent-complete': {
              const bus = subagentBusMapRef.current.get(event.agentId);
              if (bus) bus.emit('stream-end');
              eventBus.emit('subagent-completed', {
                agentId: event.agentId,
                status: event.status,
              });
              subagentBusMapRef.current.delete(event.agentId);
              break;
            }
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // Intentional stop — not an error. Keep partial content.
        } else {
          console.error('Chat completion failed', e);
          const message =
            e instanceof Error ? e.message : 'An unexpected error occurred';
          eventBus.emit('stream-error', {message});
          setStreamError(message);
        }
      } finally {
        // Complete any subagents still running (e.g. after user stops generation).
        for (const [agentId, bus] of subagentBusMapRef.current) {
          bus.emit('stream-end');
          eventBus.emit('subagent-completed', {agentId, status: 'failure'});
        }
        subagentBusMapRef.current.clear();

        if (assistantText) {
          eventBus.emit('turn-done', {
            sessionId: activeSessionId,
            userMessage: trimmed,
            assistantMessage: assistantText,
          });
        }
        abortControllerRef.current = null;
        eventBus.emit('stream-end');
        setIsStreaming(false);
      }
    },
    [isStreaming, sessionId, createNewSessionId, eventBus],
  );

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

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
