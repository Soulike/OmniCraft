import type {ThinkingLevel} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {ToolDefinition} from '../tool/types.js';

// ---------------------------------------------------------------------------
// Persisted types — Zod schema is the source of truth
// ---------------------------------------------------------------------------

/** A tool call issued by the assistant. */
export const llmToolCallSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});

export type LlmToolCall = z.infer<typeof llmToolCallSchema>;

/** A thinking/reasoning block from the assistant, abstracted across providers. */
export const llmThinkingBlockSchema = z.object({
  /** The thinking/reasoning text, one element per "part". */
  content: z.array(z.string()),
  /** Opaque token for multi-turn continuity (Claude signature / OpenAI reasoning item id). */
  signature: z.string(),
});

export type LlmThinkingBlock = z.infer<typeof llmThinkingBlockSchema>;

const llmMessageBaseSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  content: z.string(),
});

/** A message from the user. */
export const llmUserMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('user'),
});

export type LlmUserMessage = z.infer<typeof llmUserMessageSchema>;

/** A message from the assistant, optionally containing tool calls. */
export const llmAssistantMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('assistant'),
  toolCalls: z.array(llmToolCallSchema),
  thinking: z.array(llmThinkingBlockSchema),
});

export type LlmAssistantMessage = z.infer<typeof llmAssistantMessageSchema>;

/** A tool execution result, linked to a specific tool call. */
export const llmToolResultMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('tool'),
  callId: z.string(),
  status: z.enum(['success', 'failure']),
});

export type LlmToolResultMessage = z.infer<typeof llmToolResultMessageSchema>;

/** A single message in the LLM conversation context. */
export const llmMessageSchema = z.discriminatedUnion('role', [
  llmUserMessageSchema,
  llmAssistantMessageSchema,
  llmToolResultMessageSchema,
]);

export type LlmMessage = z.infer<typeof llmMessageSchema>;

/** Configuration needed to call an LLM API. */
export interface LlmConfig {
  apiFormat: 'claude' | 'openai-responses';
  apiKey: string;
  baseUrl: string;
  model: string;
  readonly thinkingLevel: ThinkingLevel;
  maxContextTokens: number;
  maxOutputTokens: number;
}

/** Token usage statistics reported by a single provider call. */
export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}

/** The LLM response has started. */
export interface LlmMessageStartEvent {
  type: 'message-start';
  messageId: string;
}

/** The LLM response has ended. */
export interface LlmMessageEndEvent {
  type: 'message-end';
  stopReason: string;
  usage: LlmCallUsage;
}

/** A text content delta from the LLM. */
export interface LlmTextDeltaEvent {
  type: 'text-delta';
  content: string;
}

/** Thinking/reasoning has started. */
export interface LlmThinkingStartEvent {
  type: 'thinking-start';
}

/** A thinking/reasoning content delta from the LLM. */
export interface LlmThinkingDeltaEvent {
  type: 'thinking-delta';
  content: string;
}

/** A thinking/reasoning block has completed. Carries the full block for history. */
export interface LlmThinkingEndEvent {
  type: 'thinking-end';
  block: LlmThinkingBlock;
}

/** A tool call has started. */
export interface LlmToolCallStartEvent {
  type: 'tool-call-start';
  callId: string;
  toolName: string;
}

/** A delta of tool call arguments (incremental JSON string). */
export interface LlmToolCallDeltaEvent {
  type: 'tool-call-delta';
  callId: string;
  argumentsDelta: string;
}

/** A tool call has completed (arguments are fully received). */
export interface LlmToolCallEndEvent {
  type: 'tool-call-end';
  callId: string;
}

/** Union of all LLM streaming events. */
export type LlmEvent =
  | LlmMessageStartEvent
  | LlmMessageEndEvent
  | LlmTextDeltaEvent
  | LlmThinkingStartEvent
  | LlmThinkingDeltaEvent
  | LlmThinkingEndEvent
  | LlmToolCallStartEvent
  | LlmToolCallDeltaEvent
  | LlmToolCallEndEvent;

/** An async generator that yields LLM streaming events. */
export type LlmEventStream = AsyncGenerator<LlmEvent, void, undefined>;

/** Options for a streaming LLM completion request. */
export interface LlmCompletionOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly systemPrompt?: string;
  readonly tools: readonly ToolDefinition[];
  readonly signal?: AbortSignal;
}

export type LlmTokenCountOptions = Omit<LlmCompletionOptions, 'signal'>;
