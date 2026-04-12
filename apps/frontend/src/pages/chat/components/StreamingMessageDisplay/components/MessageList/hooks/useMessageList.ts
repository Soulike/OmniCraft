import type {
  AnyToolResultData,
  ToolFailureData,
  ToolName,
  ToolResultData,
} from '@omnicraft/tool-schemas';
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

interface RunningToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'running';
}

interface FailedToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: ToolName;
  displayName: string;
  arguments: string;
  status: 'failure' | 'error';
  result: string;
  data: ToolFailureData;
}

type DoneToolExecutionRenderItem = {
  [K in ToolName]: {
    type: 'tool-execution';
    callId: string;
    toolName: K;
    displayName: string;
    arguments: string;
    status: 'done';
    result: string;
    data: ToolResultData<K>;
  };
}[ToolName];

export type ToolExecutionRenderItem =
  | RunningToolExecutionRenderItem
  | FailedToolExecutionRenderItem
  | DoneToolExecutionRenderItem;

export interface ThinkingRenderItem {
  type: 'thinking';
  content: string;
  done: boolean;
}

export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem
  | ThinkingRenderItem;

/** Converts a ChatMessage[] into renderable MessageRenderItem[]. */
export function transformMessages(
  messages: ChatMessage[],
): MessageRenderItem[] {
  // First pass: collect tool-execute-end events by callId
  const endEvents = new Map<
    string,
    {
      result: string;
      status: 'success' | 'failure' | 'error';
      data: AnyToolResultData;
    }
  >();
  for (const message of messages) {
    if (message.content.type === 'tool-execute-end') {
      endEvents.set(message.content.callId, {
        result: message.content.result,
        status: message.content.status,
        data: message.content.data,
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
      case 'tool-execute-start': {
        const endEvent = endEvents.get(content.callId);
        if (endEvent) {
          items.push({
            type: 'tool-execution',
            callId: content.callId,
            toolName: content.toolName,
            displayName: content.displayName,
            arguments: content.arguments,
            status:
              endEvent.status === 'success'
                ? 'done'
                : endEvent.status === 'failure'
                  ? 'failure'
                  : 'error',
            result: endEvent.result,
            data: endEvent.data,
          } as ToolExecutionRenderItem);
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
      case 'tool-execute-end':
        // Already handled via the start event pairing above
        break;
      case 'thinking': {
        if (content.done && content.content.trim() === '') break;
        items.push({
          type: 'thinking',
          content: content.content,
          done: content.done,
        });
        break;
      }
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
