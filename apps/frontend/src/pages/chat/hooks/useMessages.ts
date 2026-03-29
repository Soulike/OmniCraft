import {useCallback, useState} from 'react';

import type {ChatMessage} from '../types.js';

/** Manages the chat message history in React state. */
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /**
   * Adds a user message with text content and prepares an empty assistant
   * text message for streaming. Both are added in a single state update.
   */
  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {role: 'user' as const, content: {type: 'text' as const, content}},
      {
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ]);
  }, []);

  /**
   * Appends a text token to the last assistant message.
   * If the last message is an assistant text message, the token is appended.
   * Otherwise a new assistant text message is pushed.
   */
  const appendTextToLastAssistant = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];

      if (last.role === 'assistant' && last.content.type === 'text') {
        return [
          ...prev.slice(0, -1),
          {
            ...last,
            content: {
              ...last.content,
              content: last.content.content + token,
            },
          },
        ];
      }

      return [
        ...prev,
        {
          role: 'assistant' as const,
          content: {type: 'text' as const, content: token},
        },
      ];
    });
  }, []);

  /** Pushes a new message to the end of the message list. */
  const pushMessage = useCallback((message: ChatMessage) => {
    setMessages((prev) => [...prev, message]);
  }, []);

  /**
   * Removes the last assistant message if it is an empty text placeholder
   * (unused streaming slot).
   */
  const removeLastAssistantMessageIfEmpty = useCallback(() => {
    setMessages((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      if (
        last.role === 'assistant' &&
        last.content.type === 'text' &&
        last.content.content === ''
      ) {
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
    appendTextToLastAssistant,
    pushMessage,
    removeLastAssistantMessageIfEmpty,
    clearMessages,
  };
}
