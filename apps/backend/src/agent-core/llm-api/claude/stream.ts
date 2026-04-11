import assert from 'node:assert';

import Anthropic from '@anthropic-ai/sdk';

import {modelCapacity} from '../../model-capacity/index.js';
import type {LlmCompletionOptions, LlmEventStream, LlmUsage} from '../types.js';
import {
  addCacheBreakpoint,
  toClaudeTool,
  toSdkMessage,
  toThinkingConfig,
} from './helpers.js';
import {ThinkingBlockAccumulator} from './thinking-block-accumulator.js';

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
  const maxTokens = await modelCapacity.getMaxOutputTokens(options.config);
  if (thinking?.type === 'enabled') {
    assert(
      thinking.budget_tokens < maxTokens,
      `Thinking budget (${thinking.budget_tokens.toString()}) must be less than max_tokens (${maxTokens.toString()})`,
    );
  }

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
  const thinkingAccumulator = new ThinkingBlockAccumulator();

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
          thinkingAccumulator.start(event.index);
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
          thinkingAccumulator.appendText(event.index, event.delta.thinking);
          yield {type: 'thinking-delta', content: event.delta.thinking};
        } else if (event.delta.type === 'signature_delta') {
          thinkingAccumulator.appendSignature(
            event.index,
            event.delta.signature,
          );
        }
        break;
      }
      case 'content_block_stop': {
        const callId = blockCallIds.get(event.index);
        if (callId) {
          yield {type: 'tool-call-end', callId};
          blockCallIds.delete(event.index);
        }
        if (thinkingAccumulator.has(event.index)) {
          const block = thinkingAccumulator.finish(event.index);
          yield {type: 'thinking-end', block};
        }
        break;
      }
    }
  }
}
