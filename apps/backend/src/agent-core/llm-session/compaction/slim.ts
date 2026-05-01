import type {LlmMessage, LlmToolCall} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {
  RECENT_CONTEXT_ENTRY_TRUNCATE_HEAD_CHARS,
  RECENT_CONTEXT_ENTRY_TRUNCATE_LIMIT_CHARS,
  RECENT_CONTEXT_ENTRY_TRUNCATE_TAIL_CHARS,
  RECENT_CONTEXT_SOURCE_MESSAGE_COUNT,
  SUMMARY_INPUT_CONTENT_TRUNCATE_HEAD_CHARS,
  SUMMARY_INPUT_CONTENT_TRUNCATE_LIMIT_CHARS,
  SUMMARY_INPUT_CONTENT_TRUNCATE_TAIL_CHARS,
} from './constants.js';

interface TruncationConfig {
  readonly limit: number;
  readonly head: number;
  readonly tail: number;
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

  return `${head}\n\n[Tool result truncated for compaction only. Original length: ${content.length.toString()} chars. Omitted ${omitted.toString()} chars.]\n\n${tail}`;
}

function slimMessages(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
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
          content: message.content,
          toolCalls: message.toolCalls,
        }),
      );
      continue;
    }

    if (message.role === 'tool') {
      const toolCall = toolCallsById.get(message.callId);
      const tool = toolCall ? toolsByName.get(toolCall.toolName) : undefined;
      const content = toolCall
        ? tool?.compactResult?.({
            content: message.content,
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
            content ?? truncateForCompaction(message.content, truncation),
        }),
      );
      continue;
    }

    result.push(
      JSON.stringify({
        role: 'user',
        content: truncateForCompaction(message.content, truncation),
      }),
    );
  }

  return result;
}

export function slimMessagesForSummary(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
): string[] {
  return slimMessages(messages, tools, SUMMARY_INPUT_TRUNCATION);
}

export function buildRecentContext(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
): string {
  const recentMessages = messages.slice(-RECENT_CONTEXT_SOURCE_MESSAGE_COUNT);
  if (recentMessages.length === 0) return 'No recent context.';

  return slimMessages(recentMessages, tools, RECENT_CONTEXT_TRUNCATION).join(
    '\n',
  );
}
