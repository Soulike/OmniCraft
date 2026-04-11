import type {ThinkingLevel} from '@omnicraft/api-schema';
import type OpenAI from 'openai';
import {z} from 'zod';

import type {ToolDefinition} from '../../tool/types.js';
import type {LlmMessage} from '../types.js';

type SdkMessageParam = OpenAI.ChatCompletionMessageParam;

/** Converts our unified LlmMessage to the OpenAI SDK message format. */
export function toSdkMessage(message: LlmMessage): SdkMessageParam {
  switch (message.role) {
    case 'user':
      return {role: 'user', content: message.content};
    case 'assistant': {
      const toolCalls =
        message.toolCalls.length > 0
          ? message.toolCalls.map((tc) => ({
              id: tc.callId,
              type: 'function' as const,
              function: {name: tc.toolName, arguments: tc.arguments},
            }))
          : undefined;
      return {
        role: 'assistant',
        content: message.content,
        tool_calls: toolCalls,
      };
    }
    case 'tool':
      return {
        role: 'tool',
        tool_call_id: message.callId,
        content: message.content,
      };
  }
}

/** Converts a ToolDefinition to the OpenAI tool format. */
export function toOpenAITool(tool: ToolDefinition): OpenAI.ChatCompletionTool {
  return {
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: z.toJSONSchema(tool.parameters),
    },
  };
}

/** Maps a ThinkingLevel to the OpenAI reasoning_effort value. */
export function toReasoningEffort(
  level: ThinkingLevel,
): 'low' | 'medium' | 'high' | undefined {
  if (level === 'none') return undefined;
  return level;
}
