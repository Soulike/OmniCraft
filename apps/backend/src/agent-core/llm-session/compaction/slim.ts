import type {LlmMessage, LlmToolCall} from '../../llm-api/index.js';
import type {ToolDefinition} from '../../tool/types.js';
import {
  DEFAULT_TRUNCATE_HEAD,
  DEFAULT_TRUNCATE_LIMIT,
  DEFAULT_TRUNCATE_TAIL,
} from './constants.js';

export function truncateForCompaction(content: string): string {
  if (content.length <= DEFAULT_TRUNCATE_LIMIT) return content;

  const head = content.slice(0, DEFAULT_TRUNCATE_HEAD);
  const tail = content.slice(-DEFAULT_TRUNCATE_TAIL);
  const omitted = content.length - head.length - tail.length;

  return `${head}\n\n[Tool result truncated for compaction only. Original length: ${content.length.toString()} chars. Omitted ${omitted.toString()} chars.]\n\n${tail}`;
}

export function slimMessagesForSummary(
  messages: readonly LlmMessage[],
  tools: readonly ToolDefinition[],
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
          content: content ?? truncateForCompaction(message.content),
        }),
      );
      continue;
    }

    result.push(
      JSON.stringify({
        role: 'user',
        content: truncateForCompaction(message.content),
      }),
    );
  }

  return result;
}
