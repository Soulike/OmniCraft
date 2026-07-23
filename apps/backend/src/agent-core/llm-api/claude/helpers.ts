import assert from 'node:assert';

import Anthropic from '@anthropic-ai/sdk';
import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {ImageMediaType} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {AnyToolDefinition} from '../../tool/types.js';
import type {ToolResultBlock} from '../tool-result-block.js';
import type {LlmMessage} from '../types.js';

type SdkMessageParam = Anthropic.MessageParam;

// Compile-time check: the content block types we cache-mark must accept cache_control.
// If the SDK removes or renames this field, these lines will fail to compile.
type AssertCacheControl<T extends {cache_control?: unknown}> = T;
type _CheckText = AssertCacheControl<Anthropic.TextBlockParam>;
type _CheckToolUse = AssertCacheControl<Anthropic.ToolUseBlockParam>;
type _CheckToolResult = AssertCacheControl<Anthropic.ToolResultBlockParam>;
type _CheckTool = AssertCacheControl<Anthropic.Tool>;

// Compile-time check: our image media types stay a subset of what the SDK accepts.
// If the SDK narrows the set, this alias fails to compile.
type AssertAssignable<T extends U, U> = T;
type _CheckImageMediaType = AssertAssignable<
  ImageMediaType,
  Anthropic.Base64ImageSource['media_type']
>;

/** Converts our unified LlmMessage to the Anthropic SDK message format. */
export function toSdkMessage(message: LlmMessage): SdkMessageParam {
  switch (message.role) {
    case 'user':
      return {role: 'user', content: message.content};
    case 'assistant': {
      const content: Anthropic.ContentBlockParam[] = [];
      // Thinking blocks must come before text/tool_use blocks.
      for (const block of message.thinking) {
        content.push({
          type: 'thinking',
          thinking: block.content[0],
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
            content: toClaudeToolResultContent(message.content),
          },
        ],
      };
  }
}

/** Maps neutral tool-result blocks to Anthropic tool_result content. */
export function toClaudeToolResultContent(
  blocks: readonly ToolResultBlock[],
): Anthropic.ToolResultBlockParam['content'] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'text':
        return {type: 'text', text: block.text};
      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.mediaType,
            data: block.data,
          },
        };
      case 'document':
        return {
          type: 'document',
          source: {
            type: 'base64',
            media_type: block.mediaType,
            data: block.data,
          },
          ...(block.name === undefined ? {} : {title: block.name}),
        };
    }
  });
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

/** Converts an AnyToolDefinition to the Anthropic tool format. */
export function toClaudeTool(tool: AnyToolDefinition): Anthropic.Tool {
  const jsonSchema =
    tool.kind === 'mcp'
      ? tool.inputJsonSchema
      : z.toJSONSchema(tool.parameters);
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
export function toThinkingConfig(
  level: ThinkingLevel,
): Anthropic.ThinkingConfigParam {
  if (level === 'none') {
    return {type: 'disabled'};
  }
  return {type: 'adaptive'};
}

/**
 * Maps a ThinkingLevel to the Anthropic OutputConfig for adaptive effort.
 * Returns `undefined` when thinking is disabled (no effort needed).
 */
export function toOutputConfig(
  level: ThinkingLevel,
): Anthropic.OutputConfig | undefined {
  if (level === 'none') return undefined;
  if (level === 'minimal') return {effort: 'low'};
  return {effort: level};
}
