import assert from 'node:assert';

import Anthropic from '@anthropic-ai/sdk';
import {z} from 'zod';

import type {ToolDefinition} from '@/tools/types.js';

import type {
  LlmCompletionOptions,
  LlmEventStream,
  LlmMessage,
  LlmUsage,
} from './types.js';

type SdkMessageParam = Anthropic.MessageParam;

/** Converts our unified LlmMessage to the Anthropic SDK message format. */
function toSdkMessage(message: LlmMessage): SdkMessageParam {
  switch (message.role) {
    case 'user':
      return {role: 'user', content: message.content};
    case 'assistant': {
      const content: Anthropic.ContentBlockParam[] = [];
      if (message.content) {
        content.push({type: 'text', text: message.content});
      }
      for (const tc of message.toolCalls) {
        let input: Record<string, unknown>;
        try {
          input = JSON.parse(tc.arguments) as Record<string, unknown>;
        } catch {
          throw new Error(
            `Malformed tool call arguments for call ${tc.callId}: ${tc.arguments}`,
          );
        }
        content.push({
          type: 'tool_use',
          id: tc.callId,
          name: tc.toolName,
          input,
        });
      }
      return {role: 'assistant', content};
    }
    case 'tool':
      return {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: message.callId,
            content: message.content,
          },
        ],
      };
  }
}

/** Converts a ToolDefinition to the Anthropic tool format. */
function toClaudeTool(tool: ToolDefinition): Anthropic.Tool {
  const jsonSchema = z.toJSONSchema(tool.parameters);
  assert(
    'type' in jsonSchema && jsonSchema.type === 'object',
    `Tool "${tool.name}" parameters must produce a JSON Schema with type: "object"`,
  );
  return {
    name: tool.name,
    description: tool.description,
    input_schema: jsonSchema as Anthropic.Tool.InputSchema,
  };
}

/** Streams LLM events from the Anthropic Claude API. */
export async function* streamClaude(
  options: LlmCompletionOptions,
): LlmEventStream {
  const {config, messages, systemPrompt} = options;
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  const claudeTools = options.tools.map(toClaudeTool);

  const stream = client.messages.stream({
    model: config.model,
    max_tokens: 4096,
    system: systemPrompt,
    messages: messages.map(toSdkMessage),
    tools: claudeTools,
  });

  // Claude uses content block indices; track index → callId mapping.
  const blockCallIds = new Map<number, string>();

  // Accumulate usage across events; Claude reports input in message_start
  // and output in message_delta.
  let usage: LlmUsage = {inputTokens: 0, outputTokens: 0};
  let stopReason = '';

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start': {
        usage = {
          inputTokens: event.message.usage.input_tokens,
          outputTokens: event.message.usage.output_tokens,
        };
        yield {type: 'message-start', messageId: event.message.id};
        break;
      }
      case 'message_delta': {
        stopReason = event.delta.stop_reason ?? stopReason;
        usage = {
          ...usage,
          outputTokens: event.usage.output_tokens,
        };
        break;
      }
      case 'message_stop': {
        yield {type: 'message-end', stopReason, usage};
        break;
      }
      case 'content_block_start': {
        if (event.content_block.type === 'tool_use') {
          blockCallIds.set(event.index, event.content_block.id);
          yield {
            type: 'tool-call-start',
            callId: event.content_block.id,
            toolName: event.content_block.name,
          };
        }
        break;
      }
      case 'content_block_delta': {
        if (event.delta.type === 'text_delta') {
          yield {type: 'text-delta', content: event.delta.text};
        } else if (event.delta.type === 'input_json_delta') {
          const callId = blockCallIds.get(event.index);
          assert(
            callId,
            `Missing callId for content block index ${event.index.toString()}`,
          );
          yield {
            type: 'tool-call-delta',
            callId,
            argumentsDelta: event.delta.partial_json,
          };
        }
        break;
      }
      case 'content_block_stop': {
        const callId = blockCallIds.get(event.index);
        if (callId) {
          yield {type: 'tool-call-end', callId};
          blockCallIds.delete(event.index);
        }
        break;
      }
    }
  }
}
