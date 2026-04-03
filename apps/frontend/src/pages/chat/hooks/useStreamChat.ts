import {useCallback, useRef, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import {useChatEventBus} from './useChatEventBus.js';
import type {useSession} from './useSession.js';

type SessionHook = ReturnType<typeof useSession>;

interface UseStreamChatOptions {
  sessionId: SessionHook['sessionId'];
  resetSession: SessionHook['resetSession'];
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({sessionId, resetSession}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const eventBus = useChatEventBus();

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      const activeSessionId = sessionId ?? (await resetSession());
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
          abortController.signal,
        );

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              assistantText += event.content;
              eventBus.emit('text-delta', {content: event.content});
              break;
            case 'tool-execute-start':
              eventBus.emit('tool-execute-start', {
                type: 'tool-execution-start',
                callId: event.callId,
                toolName: event.toolName,
                displayName: event.displayName,
                arguments: event.arguments,
              });
              break;
            case 'tool-execute-end':
              eventBus.emit('tool-execute-end', {
                type: 'tool-execution-end',
                callId: event.callId,
                result: event.result,
                isError: event.isError,
              });
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
    [isStreaming, sessionId, resetSession, eventBus],
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
