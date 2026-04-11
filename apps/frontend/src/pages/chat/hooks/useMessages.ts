import type {
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';
import {useCallback, useEffect, useState} from 'react';

import type {ChatMessage} from '../types.js';
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
    {
      id: null,
      createdAt: Date.now(),
      role: 'user' as const,
      content: {type: 'text' as const, content},
    },
    {
      id: null,
      createdAt: null,
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
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: token},
    },
  ];
}

function pushToolStart(
  prev: ChatMessage[],
  content: SseToolExecuteStartEvent,
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {id: null, createdAt: null, role: 'assistant' as const, content},
  ];
}

function pushToolEnd(
  prev: ChatMessage[],
  content: SseToolExecuteEndEvent,
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {id: null, createdAt: null, role: 'assistant', content},
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

function applyUserMessageStart(
  prev: ChatMessage[],
  messageId: string,
): ChatMessage[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user') {
      const updated = [...prev];
      updated[i] = {...updated[i], id: messageId};
      return updated;
    }
  }
  throw new Error('message-start(user) received but no user message found');
}

function applyAssistantMessageStart(
  prev: ChatMessage[],
  messageId: string,
  createdAt: number,
): ChatMessage[] {
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'assistant') {
      const updated = [...prev];
      updated[i] = {...updated[i], id: messageId, createdAt};
      return updated;
    }
  }
  throw new Error(
    'message-start(assistant) received but no assistant message found',
  );
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
    const onToolExecuteStart = (data: SseToolExecuteStartEvent) => {
      setMessages((prev) => pushToolStart(prev, data));
    };
    const onToolExecuteEnd = (data: SseToolExecuteEndEvent) => {
      setMessages((prev) => pushToolEnd(prev, data));
    };
    const onStreamEnd = () => {
      setMessages(removeTrailingAssistantMessageIfEmpty);
    };
    const onMessageStart = (data: {
      role: 'user' | 'assistant';
      messageId: string;
      createdAt: number;
    }) => {
      if (data.role === 'user') {
        setMessages((prev) => applyUserMessageStart(prev, data.messageId));
      } else {
        setMessages((prev) =>
          applyAssistantMessageStart(prev, data.messageId, data.createdAt),
        );
      }
    };

    eventBus.on('user-message-sent', onUserMessageSent);
    eventBus.on('text-delta', onTextDelta);
    eventBus.on('tool-execute-start', onToolExecuteStart);
    eventBus.on('tool-execute-end', onToolExecuteEnd);
    eventBus.on('stream-end', onStreamEnd);
    eventBus.on('message-start', onMessageStart);

    return () => {
      eventBus.off('user-message-sent', onUserMessageSent);
      eventBus.off('text-delta', onTextDelta);
      eventBus.off('tool-execute-start', onToolExecuteStart);
      eventBus.off('tool-execute-end', onToolExecuteEnd);
      eventBus.off('stream-end', onStreamEnd);
      eventBus.off('message-start', onMessageStart);
    };
  }, [eventBus]);

  const clearMessages = useCallback(() => {
    setMessages([]);
  }, []);

  return {messages, clearMessages};
}
