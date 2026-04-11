import type {ThinkingLevel} from '@omnicraft/api-schema';
import {useCallback, useRef, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

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
              eventBus.emit('text-delta', event);
              break;
            case 'tool-execute-start':
              eventBus.emit('tool-execute-start', event);
              break;
            case 'tool-execute-end':
              eventBus.emit('tool-execute-end', event);
              break;
            case 'message-start':
              eventBus.emit('message-start', event);
              break;
            case 'tool-execute-delta':
              eventBus.emit('tool-execute-delta', event);
              break;
            case 'thinking-start':
            case 'thinking-delta':
            case 'thinking-end':
              // Not consumed by the frontend yet.
              break;
            case 'done':
              if (event.reason === 'max_rounds_reached') {
                setMaxRoundsReached(true);
              }
              eventBus.emit('stream-done', {
                sessionId: activeSessionId,
                userMessage: trimmed,
                assistantMessage: assistantText,
                reason: event.reason,
                usage: event.usage,
              });
              break;
            case 'error':
              eventBus.emit('stream-error', {message: event.message});
              setStreamError(event.message);
              break;
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
