import assert from 'node:assert';

import type OpenAI from 'openai';
import OpenAIClient from 'openai';

import {modelCapacity} from '../../model-capacity/index.js';
import type {LlmCompletionOptions, LlmEventStream} from '../types.js';
import {toOpenAITool, toReasoningEffort, toSdkMessage} from './helpers.js';

/** Streams LLM events from an OpenAI-compatible API. */
export async function* streamOpenAI(
  options: LlmCompletionOptions,
): LlmEventStream {
  const {config, messages, systemPrompt} = options;
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 20,
  });

  const sdkMessages: OpenAI.ChatCompletionMessageParam[] = [];
  if (systemPrompt) {
    sdkMessages.push({role: 'system', content: systemPrompt});
  }
  sdkMessages.push(...messages.map(toSdkMessage));

  const openaiTools = options.tools.map(toOpenAITool);
  const reasoningEffort = toReasoningEffort(options.thinkingLevel);
  const maxOutputTokens = await modelCapacity.getMaxOutputTokens(
    options.config,
  );

  const stream = await client.chat.completions.create(
    {
      model: config.model,
      max_completion_tokens: maxOutputTokens,
      messages: sdkMessages,
      stream: true,
      stream_options: {include_usage: true},
      ...(openaiTools.length > 0 ? {tools: openaiTools} : {}),
      ...(reasoningEffort ? {reasoning_effort: reasoningEffort} : {}),
    },
    {signal: options.signal},
  );

  // OpenAI streams tool calls incrementally per choice delta.
  // Track index -> callId so we can emit tool-call-end with the correct callId.
  const callIdsByIndex = new Map<number, string>();
  let isFirstChunk = true;
  let lastFinishReason = '';

  for await (const chunk of stream) {
    // Emit message-start on the first chunk (OpenAI has no explicit start event).
    if (isFirstChunk) {
      isFirstChunk = false;
      yield {type: 'message-start', messageId: chunk.id};
    }

    // We don't set the `n` parameter, so choices always has a single element.
    const choice = chunk.choices[0] as (typeof chunk.choices)[0] | undefined;

    // The final chunk with usage has no choices (just the usage object).
    if (!choice) {
      if (chunk.usage) {
        yield {
          type: 'message-end',
          stopReason: lastFinishReason,
          usage: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            cacheReadInputTokens:
              chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          },
        };
      }
      continue;
    }

    const delta = choice.delta;

    if (delta.content) {
      yield {type: 'text-delta', content: delta.content};
    }

    if (delta.tool_calls) {
      for (const toolCall of delta.tool_calls) {
        // First chunk for a tool call carries the id; subsequent deltas don't.
        const callId = toolCall.id ?? callIdsByIndex.get(toolCall.index);
        assert(
          callId,
          `Missing callId for tool call index ${toolCall.index.toString()}`,
        );

        if (!callIdsByIndex.has(toolCall.index)) {
          callIdsByIndex.set(toolCall.index, callId);
          yield {
            type: 'tool-call-start',
            callId,
            toolName: toolCall.function?.name ?? '',
          };
        }

        if (toolCall.function?.arguments) {
          yield {
            type: 'tool-call-delta',
            callId,
            argumentsDelta: toolCall.function.arguments,
          };
        }
      }
    }

    // OpenAI signals completion via finish_reason.
    if (choice.finish_reason) {
      lastFinishReason = choice.finish_reason;
      // Emit tool-call-end for any open tool calls.
      for (const callId of callIdsByIndex.values()) {
        yield {type: 'tool-call-end', callId};
      }
      callIdsByIndex.clear();

      // If usage is in this chunk (no stream_options), emit message-end here.
      // Otherwise, the final usage-only chunk above handles it.
      if (chunk.usage) {
        yield {
          type: 'message-end',
          stopReason: choice.finish_reason,
          usage: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
            cacheReadInputTokens:
              chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
          },
        };
      }
    }
  }
}
