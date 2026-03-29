import {useMemo} from 'react';

import type {ChatMessage} from '../../../types.js';

export interface UserTextRenderItem {
  type: 'user-text';
  content: string;
}

export interface AssistantTextRenderItem {
  type: 'assistant-text';
  content: string;
}

export interface ToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem;

/** Converts a ChatMessage[] into renderable MessageRenderItem[]. */
export function transformMessages(
  messages: ChatMessage[],
): MessageRenderItem[] {
  // First pass: collect tool-execution-end events by callId
  const endEvents = new Map<string, {result: string; isError: boolean}>();
  for (const message of messages) {
    if (message.content.type === 'tool-execution-end') {
      endEvents.set(message.content.callId, {
        result: message.content.result,
        isError: message.content.isError,
      });
    }
  }

  // Second pass: build render items
  const items: MessageRenderItem[] = [];
  for (const message of messages) {
    const {content} = message;

    switch (content.type) {
      case 'text': {
        if (message.role === 'user') {
          items.push({type: 'user-text', content: content.content});
        } else {
          items.push({type: 'assistant-text', content: content.content});
        }
        break;
      }
      case 'tool-execution-start': {
        const endEvent = endEvents.get(content.callId);
        if (endEvent) {
          items.push({
            type: 'tool-execution',
            callId: content.callId,
            toolName: content.toolName,
            displayName: content.displayName,
            arguments: content.arguments,
            status: endEvent.isError ? 'error' : 'done',
            result: endEvent.result,
          });
        } else {
          items.push({
            type: 'tool-execution',
            callId: content.callId,
            toolName: content.toolName,
            displayName: content.displayName,
            arguments: content.arguments,
            status: 'running',
          });
        }
        break;
      }
      case 'tool-execution-end':
        // Already handled via the start event pairing above
        break;
    }
  }

  return items;
}

/**
 * View-model hook that transforms ChatMessage[] into MessageRenderItem[].
 */
export function useMessageList(messages: ChatMessage[]): MessageRenderItem[] {
  return useMemo(() => transformMessages(messages), [messages]);
}
