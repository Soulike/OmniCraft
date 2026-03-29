import {useCallback, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import type {useMessages} from './useMessages.js';

type MessagesHook = ReturnType<typeof useMessages>;

interface UseStreamChatOptions {
  sessionId: string | null;
  addUserMessage: MessagesHook['addUserMessage'];
  appendAssistantText: MessagesHook['appendAssistantText'];
  pushToolExecutionStart: MessagesHook['pushToolExecutionStart'];
  pushToolExecutionEnd: MessagesHook['pushToolExecutionEnd'];
  removeLastAssistantMessageIfEmpty: MessagesHook['removeLastAssistantMessageIfEmpty'];
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  addUserMessage,
  appendAssistantText,
  pushToolExecutionStart,
  pushToolExecutionEnd,
  removeLastAssistantMessageIfEmpty,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamError, setStreamError] = useState<string | null>(null);
  const [maxRoundsReached, setMaxRoundsReached] = useState(false);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || !sessionId) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setStreamError(null);
      setMaxRoundsReached(false);
      setIsStreaming(true);

      addUserMessage(trimmed);

      try {
        const stream = streamChatCompletion(sessionId, trimmed);

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              appendAssistantText(event.content);
              break;
            case 'tool-execute-start':
              pushToolExecutionStart({
                type: 'tool-execution-start',
                callId: event.callId,
                toolName: event.toolName,
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
              break;
            case 'error':
              removeLastAssistantMessageIfEmpty();
              setStreamError(event.message);
              break;
          }
        }
      } catch (e: unknown) {
        console.error('Chat completion failed', e);
        removeLastAssistantMessageIfEmpty();
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setStreamError(message);
      } finally {
        removeLastAssistantMessageIfEmpty();
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      addUserMessage,
      appendAssistantText,
      pushToolExecutionStart,
      pushToolExecutionEnd,
      removeLastAssistantMessageIfEmpty,
    ],
  );

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
    clearStreamError,
    clearMaxRoundsReached,
  };
}
