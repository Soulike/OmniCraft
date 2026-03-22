import assert from 'node:assert';

import OpenAI from 'openai';

import type {LlmConfig, LlmEventStream, LlmMessage} from './types.js';

/** Streams LLM events from an OpenAI-compatible API. */
export async function* streamOpenAI(
  config: LlmConfig,
  messages: LlmMessage[],
): LlmEventStream {
  const client = new OpenAI({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  const stream = await client.chat.completions.create({
    model: config.model,
    messages: messages.map((m) => ({role: m.role, content: m.content})),
    stream: true,
    stream_options: {include_usage: true},
  });

  // OpenAI streams tool calls incrementally per choice delta.
  // Track index → callId so we can emit tool-call-end with the correct callId.
  const callIdsByIndex = new Map<number, string>();
  let isFirstChunk = true;

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
          stopReason: '',
          usage: {
            inputTokens: chunk.usage.prompt_tokens,
            outputTokens: chunk.usage.completion_tokens,
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
          },
        };
      }
    }
  }
}
