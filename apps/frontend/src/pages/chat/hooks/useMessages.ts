import {useCallback, useEffect, useState} from 'react';

import type {
  ChatMessage,
  ToolExecutionEndContent,
  ToolExecutionStartContent,
} from '../types.js';
import {useChatEventBus} from './useChatEventBus.js';

/**
 * Returns the message array without the trailing empty assistant text
 * placeholder, or unchanged if the last message is not one.
 */
function removeTrailingAssistantMessageIfEmpty(
  messages: ChatMessage[],
): ChatMessage[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  if (
    last.role === 'assistant' &&
    last.content.type === 'text' &&
    last.content.content.trim() === ''
  ) {
    return messages.slice(0, -1);
  }
  return messages;
}

function addUserMessage(prev: ChatMessage[], content: string): ChatMessage[] {
  return [
    ...prev,
    {role: 'user' as const, content: {type: 'text' as const, content}},
    {
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

function appendAssistantText(
  prev: ChatMessage[],
  token: string,
): ChatMessage[] {
  const last = prev[prev.length - 1];

  if (last.role === 'assistant' && last.content.type === 'text') {
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        content: {...last.content, content: last.content.content + token},
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
}

function pushToolStart(
  prev: ChatMessage[],
  content: ToolExecutionStartContent,
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [...base, {role: 'assistant' as const, content}];
}

function pushToolEnd(
  prev: ChatMessage[],
  content: ToolExecutionEndContent,
): ChatMessage[] {
  return [
    ...prev,
    {role: 'assistant', content},
    {
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

/** Manages the chat message history, subscribing to chat events. */
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const onUserMessageSent = (data: {content: string}) => {
      setMessages((prev) => addUserMessage(prev, data.content));
    };
    const onTextDelta = (data: {content: string}) => {
      setMessages((prev) => appendAssistantText(prev, data.content));
    };
    const onToolExecuteStart = (data: ToolExecutionStartContent) => {
      setMessages((prev) => pushToolStart(prev, data));
    };
    const onToolExecuteEnd = (data: ToolExecutionEndContent) => {
      setMessages((prev) => pushToolEnd(prev, data));
    };
    const onStreamEnd = () => {
      setMessages(removeTrailingAssistantMessageIfEmpty);
    };

    eventBus.on('user-message-sent', onUserMessageSent);
    eventBus.on('text-delta', onTextDelta);
    eventBus.on('tool-execute-start', onToolExecuteStart);
    eventBus.on('tool-execute-end', onToolExecuteEnd);
    eventBus.on('stream-end', onStreamEnd);

    return () => {
      eventBus.off('user-message-sent', onUserMessageSent);
      eventBus.off('text-delta', onTextDelta);
      eventBus.off('tool-execute-start', onToolExecuteStart);
      eventBus.off('tool-execute-end', onToolExecuteEnd);
      eventBus.off('stream-end', onStreamEnd);
    };
  }, [eventBus]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {messages, clearMessages};
}
