import {useCallback, useState} from 'react';

import type {ChatMessage} from '../types.js';

/** Manages the chat message history in React state. */
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /**
   * Adds a user message and prepares an empty assistant message for streaming.
   * Both are added in a single state update to avoid batching issues.
   */
  const addUserMessage = useCallback((userMessage: ChatMessage) => {
    setMessages((prev) => [
      ...prev,
      userMessage,
      {role: 'assistant' as const, content: ''},
    ]);
  }, []);

  /** Appends a token to the last assistant message. Throws if the last message is not from assistant. */
  const appendToLastAssistantMessage = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') {
        throw new Error(
          'Cannot append: last message is not an assistant message',
        );
      }
      return [...prev.slice(0, -1), {...last, content: last.content + token}];
    });
  }, []);

  /** Removes the last assistant message if it has no content (empty placeholder). */
  const removeLastAssistantMessageIfEmpty = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role === 'assistant' && last.content === '') {
        return prev.slice(0, -1);
      }
      return prev;
    });
  }, []);

  /** Clears all messages. */
  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {
    messages,
    addUserMessage,
    appendToLastAssistantMessage,
    removeLastAssistantMessageIfEmpty,
    clearMessages,
  };
}
