import assert from 'node:assert';

import OpenAIClient from 'openai';

import {modelCapacity} from '../../model-capacity/index.js';
import type {
  LlmCompletionOptions,
  LlmEventStream,
  LlmThinkingBlock,
} from '../types.js';
import {toFunctionTool, toInputItems, toReasoning} from './helpers.js';

/** Streams LLM events from the OpenAI Responses API. */
export async function* streamOpenAIResponses(
  options: LlmCompletionOptions,
): LlmEventStream {
  const {config, messages, systemPrompt} = options;
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
    maxRetries: 20,
  });

  const input = toInputItems(messages);
  const tools = options.tools.map(toFunctionTool);
  const reasoning = toReasoning(options.config.thinkingLevel);
  const maxOutputTokens = modelCapacity.getMaxOutputTokens(options.config);

  const stream = await client.responses.create(
    {
      model: config.model,
      max_output_tokens: maxOutputTokens,
      input,
      stream: true,
      store: false,
      ...(systemPrompt ? {instructions: systemPrompt} : {}),
      ...(tools.length > 0 ? {tools} : {}),
      ...(reasoning ? {reasoning} : {}),
    },
    {signal: options.signal},
  );

  // Map item ID -> call ID. Delta events reference items by item_id,
  // but our unified protocol uses call_id. The two are different identifiers.
  const callIdByItemId = new Map<string, string>();

  // Track reasoning summary parts for each reasoning item.
  const reasoningSummaryParts = new Map<string, string[]>();

  for await (const event of stream) {
    switch (event.type) {
      case 'response.created':
        yield {type: 'message-start', messageId: event.response.id};
        break;

      case 'response.output_text.delta':
        yield {type: 'text-delta', content: event.delta};
        break;

      case 'response.output_item.added':
        if (event.item.type === 'function_call') {
          assert(
            event.item.id,
            'Expected item.id on function_call output item',
          );
          callIdByItemId.set(event.item.id, event.item.call_id);
          yield {
            type: 'tool-call-start',
            callId: event.item.call_id,
            toolName: event.item.name,
          };
        } else if (event.item.type === 'reasoning') {
          yield {type: 'thinking-start'};
        }
        break;

      case 'response.function_call_arguments.delta': {
        const callId = callIdByItemId.get(event.item_id);
        assert(callId, `Missing call_id for item ${event.item_id}`);
        yield {type: 'tool-call-delta', callId, argumentsDelta: event.delta};
        break;
      }

      case 'response.completed':
      case 'response.incomplete': {
        const usage = event.response.usage;
        yield {
          type: 'message-end',
          stopReason: event.response.status ?? 'unknown',
          usage: {
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
            cacheReadInputTokens:
              usage?.input_tokens_details.cached_tokens ?? 0,
          },
        };
        break;
      }

      // Throw on stream errors so LlmSession can roll back messages.
      case 'error':
        throw new Error(`OpenAI Responses stream error: ${event.message}`);

      case 'response.failed': {
        const errorMessage = event.response.error?.message ?? 'unknown error';
        throw new Error(`OpenAI Responses request failed: ${errorMessage}`);
      }

      // Surface refusal text as normal text so the user sees why the model declined.
      case 'response.refusal.delta':
        yield {type: 'text-delta', content: event.delta};
        break;

      // Reasoning events — stream thinking content and collect for history.
      case 'response.reasoning_summary_part.added':
        break;
      case 'response.reasoning_summary_text.delta':
        yield {type: 'thinking-delta', content: event.delta};
        break;
      case 'response.reasoning_summary_part.done': {
        const parts = reasoningSummaryParts.get(event.item_id) ?? [];
        parts.push(event.part.text);
        reasoningSummaryParts.set(event.item_id, parts);
        break;
      }
      case 'response.reasoning_summary_text.done':
        break;
      case 'response.output_item.done':
        if (event.item.type === 'reasoning') {
          const parts = reasoningSummaryParts.get(event.item.id) ?? [];
          const block: LlmThinkingBlock = {
            content: parts,
            signature: event.item.id,
          };
          reasoningSummaryParts.delete(event.item.id);
          yield {type: 'thinking-end', block};
        }
        if (event.item.type === 'function_call') {
          assert(
            event.item.id,
            'Expected item.id on function_call output item',
          );
          const callId = callIdByItemId.get(event.item.id);
          assert(callId, `Missing call_id for item ${event.item.id}`);
          yield {type: 'tool-call-end', callId};
          callIdByItemId.delete(event.item.id);
        }
        break;

      case 'response.reasoning_text.delta':
      case 'response.reasoning_text.done':
        break;

      // Events below are not relevant for our streaming protocol.
      // They cover lifecycle confirmations, built-in tools, and audio.
      case 'response.queued':
      case 'response.in_progress':
      case 'response.output_text.done':
      case 'response.output_text.annotation.added':
      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'response.refusal.done':
      case 'response.function_call_arguments.done':
      case 'response.audio.delta':
      case 'response.audio.done':
      case 'response.audio.transcript.delta':
      case 'response.audio.transcript.done':
      case 'response.web_search_call.in_progress':
      case 'response.web_search_call.searching':
      case 'response.web_search_call.completed':
      case 'response.file_search_call.in_progress':
      case 'response.file_search_call.searching':
      case 'response.file_search_call.completed':
      case 'response.code_interpreter_call.in_progress':
      case 'response.code_interpreter_call.interpreting':
      case 'response.code_interpreter_call.completed':
      case 'response.code_interpreter_call_code.delta':
      case 'response.code_interpreter_call_code.done':
      case 'response.image_generation_call.in_progress':
      case 'response.image_generation_call.generating':
      case 'response.image_generation_call.partial_image':
      case 'response.image_generation_call.completed':
      case 'response.mcp_call.in_progress':
      case 'response.mcp_call_arguments.delta':
      case 'response.mcp_call_arguments.done':
      case 'response.mcp_call.completed':
      case 'response.mcp_call.failed':
      case 'response.mcp_list_tools.in_progress':
      case 'response.mcp_list_tools.completed':
      case 'response.mcp_list_tools.failed':
      case 'response.custom_tool_call_input.delta':
      case 'response.custom_tool_call_input.done':
        break;
    }
  }
}
