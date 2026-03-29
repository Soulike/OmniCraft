import {useMemo} from 'react';

import type {ChatMessage} from '../../../types.js';

export interface UserTextRenderItem {
  type: 'user-text';
  content: string;
}

export interface AssistantTextRenderItem {
  type: 'assistant-text';
  content: string;
  isStreaming: boolean;
}

export interface ToolExecutionRenderItem {
  type: 'tool-execution';
  callId: string;
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem;

/**
 * Determines whether an assistant text message is actively streaming.
 *
 * True only when the stream is actively running and this is the last message
 * in the conversation.
 */
function isTextStreaming(
  messageIndex: number,
  messageCount: number,
  isActivelyStreaming: boolean,
): boolean {
  return isActivelyStreaming && messageIndex === messageCount - 1;
}

/** Converts a ChatMessage[] into renderable MessageRenderItem[]. */
export function transformMessages(
  messages: ChatMessage[],
  isStreaming: boolean,
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
  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    const {content} = message;

    switch (content.type) {
      case 'text': {
        if (message.role === 'user') {
          items.push({type: 'user-text', content: content.content});
        } else {
          items.push({
            type: 'assistant-text',
            content: content.content,
            isStreaming: isTextStreaming(i, messages.length, isStreaming),
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
            arguments: content.arguments,
            status: endEvent.isError ? 'error' : 'done',
            result: endEvent.result,
          });
        } else {
          items.push({
            type: 'tool-execution',
            callId: content.callId,
            toolName: content.toolName,
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
 * @param messages - The raw chat messages.
 * @param isStreaming - Whether the stream is actively running.
 */
export function useMessageList(
  messages: ChatMessage[],
  isStreaming: boolean,
): MessageRenderItem[] {
  return useMemo(
    () => transformMessages(messages, isStreaming),
    [messages, isStreaming],
  );
}
