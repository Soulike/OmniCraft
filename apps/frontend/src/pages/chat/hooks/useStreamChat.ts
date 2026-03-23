import {useCallback, useState} from 'react';

import {streamChatCompletion} from '@/api/chat/index.js';

import type {ChatMessage} from '../types.js';
import type {useMessages} from './useMessages.js';

type MessagesHook = ReturnType<typeof useMessages>;

interface UseStreamChatOptions {
  sessionId: string | null;
  addUserMessage: MessagesHook['addUserMessage'];
  appendToLastAssistantMessage: MessagesHook['appendToLastAssistantMessage'];
  removeLastAssistantMessageIfEmpty: MessagesHook['removeLastAssistantMessageIfEmpty'];
}

/** Orchestrates sending a message and consuming the SSE stream. */
export function useStreamChat({
  sessionId,
  addUserMessage,
  appendToLastAssistantMessage,
  removeLastAssistantMessageIfEmpty,
}: UseStreamChatOptions) {
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendMessage = useCallback(
    async (content: string) => {
      if (isStreaming || !sessionId) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setError(null);
      setIsStreaming(true);

      const userMessage: ChatMessage = {role: 'user', content: trimmed};
      addUserMessage(userMessage);

      try {
        const stream = streamChatCompletion(sessionId, trimmed);

        for await (const event of stream) {
          switch (event.type) {
            case 'text-delta':
              appendToLastAssistantMessage(event.content);
              break;
            case 'tool-call':
              // V1: tool calls are not rendered in the UI yet.
              break;
            case 'done':
              break;
            case 'error':
              removeLastAssistantMessageIfEmpty();
              setError(event.message);
              break;
          }
        }
      } catch (e) {
        console.error('Chat completion failed', e);
        removeLastAssistantMessageIfEmpty();
        const message =
          e instanceof Error ? e.message : 'An unexpected error occurred';
        setError(message);
      } finally {
        setIsStreaming(false);
      }
    },
    [
      isStreaming,
      sessionId,
      addUserMessage,
      appendToLastAssistantMessage,
      removeLastAssistantMessageIfEmpty,
    ],
  );

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  return {isStreaming, error, sendMessage, clearError};
}
