import {z} from 'zod';

import type {AnyToolDefinition} from '../tool/types.js';
import type {ToolResultBlock} from './tool-result-block.js';
import type {LlmMessage} from './types.js';

const CHARS_PER_TOKEN = 3;

/**
 * Bounded token cost of an image. Provider vision cost is a function of pixel
 * dimensions (images above ~1.15MP are downsampled), so it is capped regardless
 * of file size — and it is fully decoupled from the base64 byte length. Counting
 * the base64 as text would over-count a small image by ~100x and trigger spurious
 * compaction that drops the media before it reaches the model.
 */
const IMAGE_TOKEN_ESTIMATE = 1600;

/**
 * Rough token allowance for a PDF document. A PDF's true cost scales with page
 * count (each page ≈ its text plus a page image), which we cannot know cheaply
 * here without parsing. This flat heuristic self-corrects once the document is
 * sent and the provider reports real usage. Accurate page-count-based estimation
 * is tracked in https://github.com/Soulike/OmniCraft/issues/373.
 */
const DOCUMENT_TOKEN_ESTIMATE = 3000;

/** The parts of a request that contribute to the prompt token count. */
export interface PromptTokenInput {
  readonly messages: readonly LlmMessage[];
  readonly systemPrompt?: string;
  readonly tools?: readonly AnyToolDefinition[];
}

/**
 * Estimates a request's prompt token count. Text is approximated by character
 * length; media blocks are counted by a bounded per-type cost rather than their
 * base64 length (which is uncorrelated with the model's token cost).
 */
export function estimatePromptTokens(input: PromptTokenInput): number {
  let total = 0;
  if (input.systemPrompt) total += estimateText(input.systemPrompt);
  for (const message of input.messages) {
    total += estimateMessageTokens(message);
  }
  for (const tool of input.tools ?? []) {
    total += estimateToolTokens(tool);
  }
  return total;
}

function estimateText(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function estimateMessageTokens(message: LlmMessage): number {
  if (message.role === 'user') {
    return estimateText(message.content);
  }
  if (message.role === 'assistant') {
    let total = estimateText(message.content);
    for (const call of message.toolCalls) {
      total += estimateText(call.toolName) + estimateText(call.arguments);
    }
    for (const block of message.thinking) {
      total += estimateText(block.content.join(''));
    }
    return total;
  }
  return message.content.reduce(
    (sum, block) => sum + estimateBlockTokens(block),
    0,
  );
}

function estimateBlockTokens(block: ToolResultBlock): number {
  switch (block.type) {
    case 'text':
      return estimateText(block.text);
    case 'image':
      return IMAGE_TOKEN_ESTIMATE;
    case 'document':
      return DOCUMENT_TOKEN_ESTIMATE;
  }
}

function estimateToolTokens(tool: AnyToolDefinition): number {
  const schema =
    tool.kind === 'mcp'
      ? tool.inputJsonSchema
      : z.toJSONSchema(tool.parameters);
  return (
    estimateText(tool.name) +
    estimateText(tool.description) +
    estimateText(JSON.stringify(schema))
  );
}
