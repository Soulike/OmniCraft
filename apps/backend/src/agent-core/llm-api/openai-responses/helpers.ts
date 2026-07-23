import type {ThinkingLevel} from '@omnicraft/api-schema';
import type OpenAI from 'openai';
import {z} from 'zod';

import type {AnyToolDefinition} from '../../tool/types.js';
import type {ToolResultBlock} from '../tool-result-block.js';
import {toolResultBlocksToText} from '../tool-result-block.js';
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
          output: toOpenAIToolResultOutput(message.content),
        });
        break;
    }
  }

  return items;
}

/**
 * Maps neutral tool-result blocks to an OpenAI function_call_output `output`.
 * All-text results stay a plain string (matches prior behavior); media results
 * become a content-item array.
 */
export function toOpenAIToolResultOutput(
  blocks: readonly ToolResultBlock[],
): string | OpenAI.Responses.ResponseFunctionCallOutputItemList {
  if (blocks.every((block) => block.type === 'text')) {
    return toolResultBlocksToText(blocks);
  }
  return blocks.map((block) => {
    switch (block.type) {
      case 'text':
        return {type: 'input_text', text: block.text};
      case 'image':
        return {
          type: 'input_image',
          detail: 'auto',
          image_url: `data:${block.mediaType};base64,${block.data}`,
        };
      case 'document':
        // OpenAI's Responses API takes an inline file as `file_data` (a base64
        // data URL) plus a `filename` — see the input_file reference and the
        // official SDK examples. `filename` is always set so the model can
        // infer the file type.
        return {
          type: 'input_file',
          filename: block.name ?? 'document.pdf',
          file_data: `data:${block.mediaType};base64,${block.data}`,
        };
    }
  });
}

/** Converts an AnyToolDefinition to the OpenAI Responses API function tool format. */
export function toFunctionTool(
  tool: AnyToolDefinition,
): OpenAI.Responses.FunctionTool {
  return {
    type: 'function',
    name: tool.name,
    description: tool.description,
    parameters:
      tool.kind === 'mcp'
        ? tool.inputJsonSchema
        : z.toJSONSchema(tool.parameters),
    strict: false,
  };
}

/** Maps a ThinkingLevel to the OpenAI Reasoning config. */
export function toReasoning(
  level: ThinkingLevel,
):
  | {effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'; summary: 'auto'}
  | undefined {
  if (level === 'none') return undefined;
  if (level === 'max') return {effort: 'xhigh', summary: 'auto'};
  return {effort: level, summary: 'auto'};
}
