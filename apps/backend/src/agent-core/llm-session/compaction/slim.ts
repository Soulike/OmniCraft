import type {LlmMessage, LlmToolCall} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {
  DEFAULT_TRUNCATE_HEAD,
  DEFAULT_TRUNCATE_LIMIT,
  DEFAULT_TRUNCATE_TAIL,
  RECENT_CONTEXT_MESSAGE_COUNT,
  RECENT_CONTEXT_TRUNCATE_HEAD,
  RECENT_CONTEXT_TRUNCATE_LIMIT,
  RECENT_CONTEXT_TRUNCATE_TAIL,
} from './constants.js';

export interface TruncateForCompactionOptions {
  readonly limit?: number;
  readonly head?: number;
  readonly tail?: number;
}

export interface SlimMessagesOptions {
  readonly truncate?: TruncateForCompactionOptions;
}

export function truncateForCompaction(
  content: string,
  options: TruncateForCompactionOptions = {},
): string {
  const limit = options.limit ?? DEFAULT_TRUNCATE_LIMIT;
  if (content.length <= limit) return content;

  const head = content.slice(0, options.head ?? DEFAULT_TRUNCATE_HEAD);
  const tail = content.slice(-(options.tail ?? DEFAULT_TRUNCATE_TAIL));
  const omitted = content.length - head.length - tail.length;

  return `${head}\n\n[Tool result truncated for compaction only. Original length: ${content.length.toString()} chars. Omitted ${omitted.toString()} chars.]\n\n${tail}`;
}

export function slimMessagesForSummary(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
  options: SlimMessagesOptions = {},
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
            content ?? truncateForCompaction(message.content, options.truncate),
        }),
      );
      continue;
    }

    result.push(
      JSON.stringify({
        role: 'user',
        content: truncateForCompaction(message.content, options.truncate),
      }),
    );
  }

  return result;
}

export function buildRecentContext(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
): string {
  const recentMessages = messages.slice(-RECENT_CONTEXT_MESSAGE_COUNT);
  if (recentMessages.length === 0) return 'No recent context.';

  return slimMessagesForSummary(recentMessages, tools, {
    truncate: {
      limit: RECENT_CONTEXT_TRUNCATE_LIMIT,
      head: RECENT_CONTEXT_TRUNCATE_HEAD,
      tail: RECENT_CONTEXT_TRUNCATE_TAIL,
    },
  }).join('\n');
}
