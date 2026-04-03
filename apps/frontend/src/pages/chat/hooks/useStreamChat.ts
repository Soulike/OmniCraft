import {useCallback, useRef, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import type {useMessages} from './useMessages.js';
import type {useSession} from './useSession.js';

type MessagesHook = ReturnType<typeof useMessages>;
type SessionHook = ReturnType<typeof useSession>;

interface UseStreamChatOptions {
  sessionId: SessionHook['sessionId'];
  resetSession: SessionHook['resetSession'];
  addUserMessage: MessagesHook['addUserMessage'];
  appendAssistantText: MessagesHook['appendAssistantText'];
  pushToolExecutionStart: MessagesHook['pushToolExecutionStart'];
  pushToolExecutionEnd: MessagesHook['pushToolExecutionEnd'];
  removeLastAssistantMessageIfEmpty: MessagesHook['removeLastAssistantMessageIfEmpty'];
  onFirstComplete?: (
    sessionId: string,
    userMessage: string,
    assistantMessage: string,
  ) => void;
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  resetSession,
  addUserMessage,
  appendAssistantText,
  pushToolExecutionStart,
  pushToolExecutionEnd,
  removeLastAssistantMessageIfEmpty,
  onFirstComplete,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);
  const isFirstCompletionRef = useRef(true);

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

      addUserMessage(trimmed);

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
              appendAssistantText(event.content);
              break;
            case 'tool-execute-start':
              pushToolExecutionStart({
                type: 'tool-execution-start',
                callId: event.callId,
                toolName: event.toolName,
                displayName: event.displayName,
                arguments: event.arguments,
              });
              break;
            case 'tool-execute-end':
              pushToolExecutionEnd({
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
              removeLastAssistantMessageIfEmpty();
              if (
                isFirstCompletionRef.current &&
                assistantText &&
                onFirstComplete
              ) {
                isFirstCompletionRef.current = false;
                onFirstComplete(activeSessionId, trimmed, assistantText);
              }
              break;
            case 'error':
              removeLastAssistantMessageIfEmpty();
              setStreamError(event.message);
              break;
          }
        }
      } catch (e: unknown) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          // Intentional stop — not an error. Keep partial content.
        } else {
          console.error('Chat completion failed', e);
          removeLastAssistantMessageIfEmpty();
          const message =
            e instanceof Error ? e.message : 'An unexpected error occurred';
          setStreamError(message);
        }
      } finally {
        abortControllerRef.current = null;
        removeLastAssistantMessageIfEmpty();
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      resetSession,
      addUserMessage,
      appendAssistantText,
      pushToolExecutionStart,
      pushToolExecutionEnd,
      removeLastAssistantMessageIfEmpty,
      onFirstComplete,
    ],
  );

  const clearStreamError = useCallback(() => {
    setStreamError(null);
  }, []);

  const clearMaxRoundsReached = useCallback(() => {
    setMaxRoundsReached(false);
  }, []);

  const stopGeneration = useCallback(() => {
    abortControllerRef.current?.abort();
  }, []);

  return {
    isStreaming,
    streamError,
    maxRoundsReached,
    sendMessage,
    clearStreamError,
    clearMaxRoundsReached,
    stopGeneration,
  };
}
