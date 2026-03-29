import {useCallback, useState} from 'react';

import type {
  ChatMessage,
  ToolExecutionEndContent,
  ToolExecutionStartContent,
} from '../types.js';

/** Manages the chat message history in React state. */
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);

  /**
   * Adds a user message with text content and prepares an empty assistant
   * message for streaming. Both are added in a single state update.
   */
  const addUserMessage = useCallback((content: string) => {
    setMessages((prev) => [
      ...prev,
      {role: 'user' as const, content: [{type: 'text' as const, content}]},
      {role: 'assistant' as const, content: []},
    ]);
  }, []);

  /**
   * Appends a text token to the last assistant message.
   * If the last entry in the assistant's content array is a TextContent,
   * the token is appended to it. Otherwise a new TextContent is pushed.
   */
  const appendTextToLastAssistant = useCallback((token: string) => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role !== 'assistant') {
        throw new Error(
          'Cannot append: last message is not an assistant message',
        );
      }

      const contentArray = [...last.content];
      const lastIndex = contentArray.length - 1;

      if (lastIndex >= 0 && contentArray[lastIndex].type === 'text') {
        const lastEntry = contentArray[lastIndex];
        contentArray[lastIndex] = {
          ...lastEntry,
          content: lastEntry.content + token,
        };
      } else {
        contentArray.push({type: 'text', content: token});
      }

      return [...prev.slice(0, -1), {...last, content: contentArray}];
    });
  }, []);

  /**
   * Pushes a tool execution start or end entry to the last assistant message's
   * content array.
   */
  const pushContentToLastAssistant = useCallback(
    (item: ToolExecutionStartContent | ToolExecutionEndContent) => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last.role !== 'assistant') {
          throw new Error(
            'Cannot push content: last message is not an assistant message',
          );
        }

        return [
          ...prev.slice(0, -1),
          {...last, content: [...last.content, item]},
        ];
      });
    },
    [],
  );

  /**
   * Removes the last assistant message if its content array is empty
   * (unused placeholder).
   */
  const removeLastAssistantMessageIfEmpty = useCallback(() => {
    setMessages((prev) => {
      const last = prev[prev.length - 1];
      if (last.role === 'assistant' && last.content.length === 0) {
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
    pushContentToLastAssistant,
    removeLastAssistantMessageIfEmpty,
    clearMessages,
  };
}
