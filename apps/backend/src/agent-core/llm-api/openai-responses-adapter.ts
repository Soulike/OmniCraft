import type OpenAI from 'openai';
import OpenAIClient from 'openai';
import {z} from 'zod';

import type {ToolDefinition} from '../tool/types.js';
import type {
  LlmCompletionOptions,
  LlmEventStream,
  LlmMessage,
} from './types.js';

type ResponseInputItem = OpenAI.Responses.ResponseInputItem;

/** Converts our unified LlmMessage(s) to OpenAI Responses API input items. */
function toInputItems(messages: readonly LlmMessage[]): ResponseInputItem[] {
  const items: ResponseInputItem[] = [];

  for (const message of messages) {
    switch (message.role) {
      case 'user':
        items.push({type: 'message', role: 'user', content: message.content});
        break;
      case 'assistant': {
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
function toFunctionTool(tool: ToolDefinition): OpenAI.Responses.FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters: z.toJSONSchema(tool.parameters),
    strict: false,
  };
}

/** Streams LLM events from the OpenAI Responses API. */
export async function* streamOpenAIResponses(
  options: LlmCompletionOptions,
): LlmEventStream {
  const {config, messages, systemPrompt} = options;
  const client = new OpenAIClient({
    apiKey: config.apiKey,
    baseURL: config.baseUrl,
  });

  const input = toInputItems(messages);
  const tools = options.tools.map(toFunctionTool);

  const stream = await client.responses.create(
    {
      model: config.model,
      input,
      stream: true,
      ...(systemPrompt ? {instructions: systemPrompt} : {}),
      ...(tools.length > 0 ? {tools} : {}),
    },
    {signal: options.signal},
  );

  // Track active function calls by item_id to emit tool-call-end correctly.
  const activeToolCalls = new Map<string, string>();

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
          activeToolCalls.set(
            event.item.id ?? event.item.call_id,
            event.item.call_id,
          );
          yield {
            type: 'tool-call-start',
            callId: event.item.call_id,
            toolName: event.item.name,
          };
        }
        break;

      case 'response.function_call_arguments.delta':
        yield {
          type: 'tool-call-delta',
          callId: activeToolCalls.get(event.item_id) ?? event.item_id,
          argumentsDelta: event.delta,
        };
        break;

      case 'response.output_item.done':
        if (event.item.type === 'function_call') {
          const callId =
            activeToolCalls.get(event.item.id ?? event.item.call_id) ??
            event.item.call_id;
          yield {type: 'tool-call-end', callId};
          activeToolCalls.delete(event.item.id ?? event.item.call_id);
        }
        break;

      case 'response.completed': {
        const usage = event.response.usage;
        yield {
          type: 'message-end',
          stopReason: event.response.status ?? 'completed',
          usage: {
            inputTokens: usage?.input_tokens ?? 0,
            outputTokens: usage?.output_tokens ?? 0,
          },
        };
        break;
      }

      // Events below are not relevant for our streaming protocol.
      // They cover built-in tools, audio, reasoning, and lifecycle
      // states that the unified LlmEvent model does not represent.
      case 'response.queued':
      case 'response.in_progress':
      case 'response.failed':
      case 'response.incomplete':
      case 'error':
      case 'response.output_text.done':
      case 'response.output_text.annotation.added':
      case 'response.content_part.added':
      case 'response.content_part.done':
      case 'response.refusal.delta':
      case 'response.refusal.done':
      case 'response.function_call_arguments.done':
      case 'response.audio.delta':
      case 'response.audio.done':
      case 'response.audio.transcript.delta':
      case 'response.audio.transcript.done':
      case 'response.reasoning_text.delta':
      case 'response.reasoning_text.done':
      case 'response.reasoning_summary_text.delta':
      case 'response.reasoning_summary_text.done':
      case 'response.reasoning_summary_part.added':
      case 'response.reasoning_summary_part.done':
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
