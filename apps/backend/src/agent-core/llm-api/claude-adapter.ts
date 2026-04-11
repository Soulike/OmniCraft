import assert from 'node:assert';

import Anthropic from '@anthropic-ai/sdk';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {ToolDefinition} from '../tool/types.js';
import type {
  LlmCompletionOptions,
  LlmEventStream,
  LlmMessage,
  LlmThinkingBlock,
  LlmUsage,
} from './types.js';

type SdkMessageParam = Anthropic.MessageParam;

// Compile-time check: the content block types we cache-mark must accept cache_control.
// If the SDK removes or renames this field, these lines will fail to compile.
type AssertCacheControl<T extends {cache_control?: unknown}> = T;
type _CheckText = AssertCacheControl<Anthropic.TextBlockParam>;
type _CheckToolUse = AssertCacheControl<Anthropic.ToolUseBlockParam>;
type _CheckToolResult = AssertCacheControl<Anthropic.ToolResultBlockParam>;
type _CheckTool = AssertCacheControl<Anthropic.Tool>;

/** Converts our unified LlmMessage to the Anthropic SDK message format. */
function toSdkMessage(message: LlmMessage): SdkMessageParam {
  switch (message.role) {
    case 'user':
      return {role: 'user', content: message.content};
    case 'assistant': {
      const content: Anthropic.ContentBlockParam[] = [];
      // Thinking blocks must come before text/tool_use blocks.
      for (const block of message.thinking) {
        content.push({
          type: 'thinking',
          thinking: block.content[0] ?? '',
          signature: block.signature,
        });
      }
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

/**
 * Adds a cache_control breakpoint to the last content block of the given message.
 * Normalizes string content to array format when needed.
 */
export function addCacheBreakpoint(message: SdkMessageParam): SdkMessageParam {
  const cacheControl: Anthropic.CacheControlEphemeral = {type: 'ephemeral'};

  if (typeof message.content === 'string') {
    return {
      ...message,
      content: [
        {type: 'text', text: message.content, cache_control: cacheControl},
      ],
    };
  }

  if (Array.isArray(message.content) && message.content.length > 0) {
    const blocks = [...message.content];
    // Use Object.assign to avoid TypeScript union spread issues — all content
    // block param types accept cache_control but TS can't prove it via spread.
    blocks[blocks.length - 1] = Object.assign({}, blocks[blocks.length - 1], {
      cache_control: cacheControl,
    });
    return {...message, content: blocks};
  }

  return message;
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

/** Maps a ThinkingLevel to the Anthropic ThinkingConfigParam. */
function toThinkingConfig(
  level: ThinkingLevel,
): Anthropic.ThinkingConfigParam | undefined {
  switch (level) {
    case 'none':
      return undefined;
    case 'low':
      return {type: 'enabled', budget_tokens: 2048};
    case 'medium':
      return {type: 'enabled', budget_tokens: 8192};
    case 'high':
      return {type: 'enabled', budget_tokens: 32768};
  }
}

/** Streams LLM events from the Anthropic Claude API. */
export async function* streamClaude(
  options: LlmCompletionOptions,
): LlmEventStream {
  const {config, messages, systemPrompt} = options;
  const client = new Anthropic({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 20,
  });

  const claudeTools = options.tools.map(toClaudeTool);

  // Cache the tool list — it's static across all rounds in a session.
  if (claudeTools.length > 0) {
    claudeTools[claudeTools.length - 1] = {
      ...claudeTools[claudeTools.length - 1],
      cache_control: {type: 'ephemeral'},
    };
  }

  // Convert messages and add a cache breakpoint on the second-to-last message
  // so the API can cache the conversation prefix that won't change anymore.
  const sdkMessages = messages.map(toSdkMessage);
  if (sdkMessages.length >= 2) {
    sdkMessages[sdkMessages.length - 2] = addCacheBreakpoint(
      sdkMessages[sdkMessages.length - 2],
    );
  }

  const thinking = toThinkingConfig(options.thinkingLevel);
  // budget_tokens must be < max_tokens. Ensure max_tokens accommodates the
  // thinking budget plus room for the actual response.
  const maxTokens =
    thinking?.type === 'enabled' ? thinking.budget_tokens + 4096 : 4096;

  const stream = client.messages.stream(
    {
      model: config.model,
      max_tokens: maxTokens,
      // Cache the system prompt — it's static across all rounds in a session.
      system: systemPrompt
        ? [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: {type: 'ephemeral'},
            },
          ]
        : undefined,
      messages: sdkMessages,
      tools: claudeTools,
      ...(thinking ? {thinking} : {}),
    },
    {signal: options.signal},
  );

  // Claude uses content block indices; track index → callId mapping.
  const blockCallIds = new Map<number, string>();

  // Track thinking block indices and their accumulated data.
  const thinkingBlockIndices = new Set<number>();
  const thinkingTexts = new Map<number, string>();
  const thinkingSignatures = new Map<number, string>();
  const thinkingBlocks: LlmThinkingBlock[] = [];

  // Accumulate usage across events; Claude reports input in message_start
  // and output in message_delta.
  let usage: LlmUsage = {
    inputTokens: 0,
    outputTokens: 0,
    cacheReadInputTokens: 0,
  };
  let stopReason = '';

  for await (const event of stream) {
    switch (event.type) {
      case 'message_start': {
        // Claude's input_tokens only counts non-cached tokens. Add cache_read
        // and cache_creation to get the true total.
        // https://platform.claude.com/docs/en/build-with-claude/prompt-caching#tracking-cache-performance
        const messageUsage = event.message.usage;
        const cacheRead = messageUsage.cache_read_input_tokens ?? 0;
        const cacheCreation = messageUsage.cache_creation_input_tokens ?? 0;
        usage = {
          inputTokens: messageUsage.input_tokens + cacheRead + cacheCreation,
          outputTokens: messageUsage.output_tokens,
          cacheReadInputTokens: cacheRead,
        };
        yield {type: 'message-start', messageId: event.message.id};
        break;
      }
      case 'message_delta': {
        stopReason = event.delta.stop_reason ?? stopReason;
        usage = {
          ...usage,
          outputTokens: event.usage.output_tokens,
          cacheReadInputTokens:
            event.usage.cache_read_input_tokens ?? usage.cacheReadInputTokens,
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
        } else if (event.content_block.type === 'thinking') {
          thinkingBlockIndices.add(event.index);
          thinkingTexts.set(event.index, '');
          thinkingSignatures.set(event.index, '');
          yield {type: 'thinking-start'};
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
        } else if (event.delta.type === 'thinking_delta') {
          const prev = thinkingTexts.get(event.index) ?? '';
          thinkingTexts.set(event.index, prev + event.delta.thinking);
          yield {type: 'thinking-delta', content: event.delta.thinking};
        } else if (event.delta.type === 'signature_delta') {
          const prev = thinkingSignatures.get(event.index) ?? '';
          thinkingSignatures.set(event.index, prev + event.delta.signature);
        }
        break;
      }
      case 'content_block_stop': {
        const callId = blockCallIds.get(event.index);
        if (callId) {
          yield {type: 'tool-call-end', callId};
          blockCallIds.delete(event.index);
        }
        if (thinkingBlockIndices.has(event.index)) {
          const block: LlmThinkingBlock = {
            content: [thinkingTexts.get(event.index) ?? ''],
            signature: thinkingSignatures.get(event.index) ?? '',
          };
          thinkingBlocks.push(block);
          thinkingBlockIndices.delete(event.index);
          thinkingTexts.delete(event.index);
          thinkingSignatures.delete(event.index);
          yield {type: 'thinking-end', block};
        }
        break;
      }
    }
  }
}
