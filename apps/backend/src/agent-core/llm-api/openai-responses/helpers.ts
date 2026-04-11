import type {ThinkingLevel} from '@omnicraft/api-schema';
import type OpenAI from 'openai';
import {z} from 'zod';

import type {ToolDefinition} from '../../tool/types.js';
import type {LlmMessage} from '../types.js';

type ResponseInputItem = OpenAI.Responses.ResponseInputItem;

/** Converts our unified LlmMessage(s) to OpenAI Responses API input items. */
export function toInputItems(
  messages: readonly LlmMessage[],
): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'user':
        items.push({type: 'message', role: 'user', content: message.content});
        break;
      case 'assistant': {
        // Reasoning items must come before the assistant message.
        for (const block of message.thinking) {
          items.push({
            type: 'reasoning',
            id: block.signature,
            summary: block.content.map((text) => ({
              type: 'summary_text' as const,
              text,
            })),
          });
        }
        if (message.content) {
          items.push({role: 'assistant', content: message.content});
        }
        for (const tc of message.toolCalls) {
          items.push({
            type: 'function_call',
            call_id: tc.callId,
            name: tc.toolName,
            arguments: tc.arguments,
          });
        }
        break;
      }
      case 'tool':
        items.push({
          type: 'function_call_output',
          call_id: message.callId,
          output: message.content,
        });
        break;
    }
  }

  return items;
}

/** Converts a ToolDefinition to the OpenAI Responses API function tool format. */
export function toFunctionTool(
  tool: ToolDefinition,
): OpenAI.Responses.FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters),
    strict: false,
  };
}

/** Maps a ThinkingLevel to the OpenAI Reasoning config. */
export function toReasoning(
  level: ThinkingLevel,
): {effort: 'low' | 'medium' | 'high'; summary: 'auto'} | undefined {
  if (level === 'none') return undefined;
  return {effort: level, summary: 'auto'};
}
