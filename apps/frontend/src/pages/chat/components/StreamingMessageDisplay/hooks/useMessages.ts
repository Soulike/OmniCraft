import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseMessageStartEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import type {ChatEventBus, ChatMessage} from '../types.js';
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

function pushThinkingStart(prev: ChatMessage[]): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'thinking' as const, content: '', done: false},
    },
  ];
}

function appendThinkingDelta(
  prev: ChatMessage[],
  token: string,
): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last.role === 'assistant' && last.content.type === 'thinking') {
    return [
      ...prev.slice(0, -1),
      {
        ...last,
        content: {...last.content, content: last.content.content + token},
      },
    ];
  }
  return prev;
}

function finishThinking(prev: ChatMessage[]): ChatMessage[] {
  const last = prev[prev.length - 1];
  if (last.role === 'assistant' && last.content.type === 'thinking') {
    return [
      ...prev.slice(0, -1),
      {...last, content: {...last.content, done: true}},
      {
        id: null,
        createdAt: null,
        role: 'assistant' as const,
        content: {type: 'text' as const, content: ''},
      },
    ];
  }
  return prev;
}

function applyUserMessageStart(
  prev: ChatMessage[],
  event: SseMessageStartEvent,
): ChatMessage[] {
  // Look for a user message without an ID (created by user-message-sent)
  for (let i = prev.length - 1; i >= 0; i--) {
    if (prev[i].role === 'user' && prev[i].id === null) {
      const updated = [...prev];
      updated[i] = {...updated[i], id: event.messageId};
      return updated;
    }
  }
  // Replay: no user-message-sent was fired. Create from event content.
  return [
    ...prev,
    {
      id: event.messageId,
      createdAt: event.createdAt,
      role: 'user' as const,
      content: {type: 'text' as const, content: event.content},
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
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
  // No assistant message yet (e.g. subagent stream). Create a placeholder.
  return [
    ...prev,
    {
      id: messageId,
      createdAt,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

function pushSubagentStart(
  prev: ChatMessage[],
  data: {
    agentId: string;
    task: string;
    agentType: string;
    thinkingLevel: ThinkingLevel;
    workingDirectory: string;
    eventBus: ChatEventBus;
  },
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {
        type: 'subagent' as const,
        agentId: data.agentId,
        task: data.task,
        agentType: data.agentType,
        thinkingLevel: data.thinkingLevel,
        workingDirectory: data.workingDirectory,
        status: 'running' as const,
        eventBus: data.eventBus,
      },
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

function updateSubagentStatus(
  prev: ChatMessage[],
  data: {agentId: string; status: 'success' | 'failure'},
): ChatMessage[] {
  return prev.map((msg) => {
    if (
      msg.content.type === 'subagent' &&
      msg.content.agentId === data.agentId
    ) {
      return {
        ...msg,
        content: {
          ...msg.content,
          status:
            data.status === 'success'
              ? ('complete' as const)
              : ('error' as const),
        },
      };
    }
    return msg;
  });
}

/** Manages the chat message history, subscribing to chat events. */
export function useMessages() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const onUserMessageSent = (data: {content: string}) => {
      setMessages((prev) => addUserMessage(prev, data.content));
    };
    const onTextDelta = (data: SseTextDeltaEvent) => {
      setMessages((prev) => appendAssistantText(prev, data.content));
    };
    const onToolExecuteStart = (data: SseToolExecuteStartEvent) => {
      setMessages((prev) => pushToolStart(prev, data));
    };
    const onToolExecuteEnd = (data: SseToolExecuteEndEvent) => {
      setMessages((prev) => pushToolEnd(prev, data));
    };
    const onDone = () => {
      setMessages(removeTrailingAssistantMessageIfEmpty);
    };
    const onMessageStart = (data: SseMessageStartEvent) => {
      if (data.role === 'user') {
        setMessages((prev) => applyUserMessageStart(prev, data));
      } else {
        setMessages((prev) =>
          applyAssistantMessageStart(prev, data.messageId, data.createdAt),
        );
      }
    };
    const onThinkingStart = () => {
      setMessages(pushThinkingStart);
    };
    const onThinkingDelta = (data: SseThinkingDeltaEvent) => {
      setMessages((prev) => appendThinkingDelta(prev, data.content));
    };
    const onThinkingEnd = () => {
      setMessages(finishThinking);
    };
    const onReset = () => {
      setMessages([]);
    };
    const onSubagentDispatched = (data: {
      agentId: string;
      task: string;
      agentType: string;
      thinkingLevel: ThinkingLevel;
      workingDirectory: string;
      eventBus: ChatEventBus;
    }) => {
      setMessages((prev) => pushSubagentStart(prev, data));
    };
    const onSubagentCompleted = (data: {
      agentId: string;
      status: 'success' | 'failure';
    }) => {
      setMessages((prev) => updateSubagentStatus(prev, data));
    };

    eventBus.on('user-message-sent', onUserMessageSent);
    eventBus.on('text-delta', onTextDelta);
    eventBus.on('tool-execute-start', onToolExecuteStart);
    eventBus.on('tool-execute-end', onToolExecuteEnd);
    eventBus.on('done', onDone);
    eventBus.on('message-start', onMessageStart);
    eventBus.on('thinking-start', onThinkingStart);
    eventBus.on('thinking-delta', onThinkingDelta);
    eventBus.on('thinking-end', onThinkingEnd);
    eventBus.on('reset', onReset);
    eventBus.on('subagent-dispatched', onSubagentDispatched);
    eventBus.on('subagent-completed', onSubagentCompleted);

    return () => {
      eventBus.off('user-message-sent', onUserMessageSent);
      eventBus.off('text-delta', onTextDelta);
      eventBus.off('tool-execute-start', onToolExecuteStart);
      eventBus.off('tool-execute-end', onToolExecuteEnd);
      eventBus.off('done', onDone);
      eventBus.off('message-start', onMessageStart);
      eventBus.off('thinking-start', onThinkingStart);
      eventBus.off('thinking-delta', onThinkingDelta);
      eventBus.off('thinking-end', onThinkingEnd);
      eventBus.off('reset', onReset);
      eventBus.off('subagent-dispatched', onSubagentDispatched);
      eventBus.off('subagent-completed', onSubagentCompleted);
    };
  }, [eventBus]);

  return {messages};
}
