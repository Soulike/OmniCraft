import {useMemo} from 'react';

import type {ChatMessage, MessageContent} from '../../../types.js';

/** Render model for a text segment within an assistant message. */
export interface TextRenderSegment {
  type: 'text';
  content: string;
  isStreaming: boolean;
}

/** Render model for a tool execution within an assistant message. */
export interface ToolExecutionRenderSegment {
  type: 'tool-execution';
  callId: string;
  toolName: string;
  arguments: string;
  status: 'running' | 'done' | 'error';
  result?: string;
}

export type AssistantSegment = TextRenderSegment | ToolExecutionRenderSegment;

export interface UserMessageRenderItem {
  type: 'user';
  text: string;
}

export interface AssistantMessageRenderItem {
  type: 'assistant';
  segments: AssistantSegment[];
}

export type MessageRenderItem =
  | UserMessageRenderItem
  | AssistantMessageRenderItem;

/**
 * Determines whether a text segment is actively streaming.
 *
 * A text segment is streaming only when the message is the last one in the
 * conversation (the one currently being received), the text entry is the last
 * entry in the content array, and it contains text. Once the stream moves on
 * to a tool call or finishes, the text is no longer the last entry and is
 * considered complete.
 */
function isTextStreaming(
  contentArray: readonly MessageContent[],
  index: number,
  isLastMessage: boolean,
): boolean {
  return isLastMessage && index === contentArray.length - 1;
}

/** Converts a ChatMessage[] into renderable MessageRenderItem[]. */
function transformMessages(messages: ChatMessage[]): MessageRenderItem[] {
  return messages.map((message, messageIndex): MessageRenderItem => {
    if (message.role === 'user') {
      const textEntry = message.content.find((c) => c.type === 'text');
      return {
        type: 'user',
        text: textEntry ? textEntry.content : '',
      };
    }

    const isLastMessage = messageIndex === messages.length - 1;

    // Assistant message: build segments from content array
    const segments: AssistantSegment[] = [];
    const endEvents = new Map<string, {result: string; isError: boolean}>();

    // First pass: collect all tool-execution-end events by callId
    for (const entry of message.content) {
      if (entry.type === 'tool-execution-end') {
        endEvents.set(entry.callId, {
          result: entry.result,
          isError: entry.isError,
        });
      }
    }

    // Second pass: build segments in order
    for (let i = 0; i < message.content.length; i++) {
      const entry = message.content[i];

      switch (entry.type) {
        case 'text': {
          segments.push({
            type: 'text',
            content: entry.content,
            isStreaming: isTextStreaming(message.content, i, isLastMessage),
          });
          break;
        }
        case 'tool-execution-start': {
          const endEvent = endEvents.get(entry.callId);
          if (endEvent) {
            segments.push({
              type: 'tool-execution',
              callId: entry.callId,
              toolName: entry.toolName,
              arguments: entry.arguments,
              status: endEvent.isError ? 'error' : 'done',
              result: endEvent.result,
            });
          } else {
            segments.push({
              type: 'tool-execution',
              callId: entry.callId,
              toolName: entry.toolName,
              arguments: entry.arguments,
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

    return {type: 'assistant', segments};
  });
}

/**
 * View-model hook that transforms ChatMessage[] into MessageRenderItem[].
 * Memoized on the messages array reference.
 */
export function useMessageList(messages: ChatMessage[]): MessageRenderItem[] {
  return useMemo(() => transformMessages(messages), [messages]);
}
