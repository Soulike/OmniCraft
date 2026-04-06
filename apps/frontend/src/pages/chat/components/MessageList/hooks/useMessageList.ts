import {useMemo} from 'react';

import type {ChatMessage} from '../../../types.js';

export interface UserTextRenderItem {
  type: 'user-text';
  id: string | null;
  content: string;
  createdAt: number | null;
}

export interface AssistantTextRenderItem {
  type: 'assistant-text';
  id: string | null;
  content: string;
  createdAt: number | null;
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
          items.push({
            type: 'user-text',
            id: message.id,
            content: content.content,
            createdAt: message.createdAt,
          });
        } else {
          items.push({
            type: 'assistant-text',
            id: message.id,
            content: content.content,
            createdAt: message.createdAt,
          });
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
