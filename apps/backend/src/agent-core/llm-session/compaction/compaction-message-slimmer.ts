import type {
  LlmMessage,
  LlmToolCall,
  LlmUserMessage,
} from '../../llm-api/index.js';
import {
  formatAttachmentSize,
  toolResultBlocksToText,
} from '../../llm-api/index.js';
import type {AnyToolDefinition} from '../../tool/types.js';
import {
  RECENT_CONTEXT_ENTRY_TRUNCATE_HEAD_CHARS,
  RECENT_CONTEXT_ENTRY_TRUNCATE_LIMIT_CHARS,
  RECENT_CONTEXT_ENTRY_TRUNCATE_TAIL_CHARS,
  RECENT_CONTEXT_SOURCE_MESSAGE_COUNT,
  SUMMARY_INPUT_CONTENT_TRUNCATE_HEAD_CHARS,
  SUMMARY_INPUT_CONTENT_TRUNCATE_LIMIT_CHARS,
  SUMMARY_INPUT_CONTENT_TRUNCATE_TAIL_CHARS,
} from './compaction-constants.js';

interface TruncationConfig {
  readonly limit: number;
  readonly head: number;
  readonly tail: number;
}

export interface RecentContext {
  readonly content: string;
  readonly sourceMessageCount: number;
}

const SUMMARY_INPUT_TRUNCATION: TruncationConfig = {
  limit: SUMMARY_INPUT_CONTENT_TRUNCATE_LIMIT_CHARS,
  head: SUMMARY_INPUT_CONTENT_TRUNCATE_HEAD_CHARS,
  tail: SUMMARY_INPUT_CONTENT_TRUNCATE_TAIL_CHARS,
};

const RECENT_CONTEXT_TRUNCATION: TruncationConfig = {
  limit: RECENT_CONTEXT_ENTRY_TRUNCATE_LIMIT_CHARS,
  head: RECENT_CONTEXT_ENTRY_TRUNCATE_HEAD_CHARS,
  tail: RECENT_CONTEXT_ENTRY_TRUNCATE_TAIL_CHARS,
};

function truncateForCompaction(
  content: string,
  truncation: TruncationConfig,
): string {
  if (content.length <= truncation.limit) return content;

  const head = content.slice(0, truncation.head);
  const tail = content.slice(-truncation.tail);
  const omitted = content.length - head.length - tail.length;

  return `${head}\n\n[Content truncated for compaction only. Original length: ${content.length.toString()} chars. Omitted ${omitted.toString()} chars.]\n\n${tail}`;
}

function projectUserContent(message: LlmUserMessage): string {
  if (message.attachments.length === 0) return message.content;
  const placeholders = message.attachments.map(
    (attachment) =>
      `[attachment: ${attachment.fileName} (${attachment.mediaType}, ${formatAttachmentSize(attachment.lastKnownByteSize)})]`,
  );
  return [message.content, ...placeholders].join('\n');
}

function slimToolCallsForCompaction(
  toolCalls: readonly LlmToolCall[],
  truncation: TruncationConfig,
): LlmToolCall[] {
  return toolCalls.map((toolCall) => ({
    ...toolCall,
    arguments: truncateForCompaction(toolCall.arguments, truncation),
  }));
}

function slimMessages(
  messages: readonly LlmMessage[],
  tools: readonly AnyToolDefinition[],
  truncation: TruncationConfig,
): string[] {
  const toolsByName = new Map(tools.map((tool) => [tool.name, tool]));
  const toolCallsById = new Map<string, LlmToolCall>();
  const result: string[] = [];

  for (const message of messages) {
    if (message.role === 'assistant') {
      for (const toolCall of message.toolCalls) {
        toolCallsById.set(toolCall.callId, toolCall);
      }
      result.push(
        JSON.stringify({
          role: 'assistant',
          content: truncateForCompaction(message.content, truncation),
          toolCalls: slimToolCallsForCompaction(message.toolCalls, truncation),
        }),
      );
      continue;
    }

    if (message.role === 'tool') {
      const toolCall = toolCallsById.get(message.callId);
      const tool = toolCall ? toolsByName.get(toolCall.toolName) : undefined;
      // Project blocks to text (media → placeholder) before any compaction work.
      const projected = toolResultBlocksToText(message.content);
      const content = toolCall
        ? tool?.compactResult?.({
            content: projected,
            status: message.status,
            toolCall,
            message,
          })
        : undefined;

      if (content === null) continue;

      result.push(
        JSON.stringify({
          role: 'tool',
          callId: message.callId,
          status: message.status,
          content:
            content === undefined
              ? truncateForCompaction(projected, truncation)
              : truncateForCompaction(content, truncation),
        }),
      );
      continue;
    }

    result.push(
      JSON.stringify({
        role: 'user',
        content: truncateForCompaction(projectUserContent(message), truncation),
      }),
    );
  }

  return result;
}

export class CompactionMessageSlimmer {
  slimMessagesForSummary(
    messages: readonly LlmMessage[],
    tools: readonly AnyToolDefinition[],
  ): string[] {
    return slimMessages(messages, tools, SUMMARY_INPUT_TRUNCATION);
  }

  buildRecentContext(
    messages: readonly LlmMessage[],
    tools: readonly AnyToolDefinition[],
  ): RecentContext {
    const recentMessages = messages.slice(-RECENT_CONTEXT_SOURCE_MESSAGE_COUNT);
    if (recentMessages.length === 0) {
      return {content: 'No recent context.', sourceMessageCount: 0};
    }

    return {
      content: slimMessages(
        recentMessages,
        tools,
        RECENT_CONTEXT_TRUNCATION,
      ).join('\n'),
      sourceMessageCount: recentMessages.length,
    };
  }
}

export const compactionMessageSlimmer = new CompactionMessageSlimmer();
