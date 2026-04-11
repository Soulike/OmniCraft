import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {SseUsage} from '@omnicraft/sse-events';

import type {ToolDefinition} from '../tool/types.js';

/** A tool call issued by the assistant. */
export interface LlmToolCall {
  callId: string;
  toolName: string;
  arguments: string;
}

/** A thinking/reasoning block from the assistant, abstracted across providers. */
export interface LlmThinkingBlock {
  /** The thinking/reasoning text, one element per "part". */
  content: string[];
  /** Opaque token for multi-turn continuity (Claude signature / OpenAI reasoning item id). */
  signature: string;
}

/** Common fields shared by all LLM messages. */
interface LlmMessageBase {
  id: string;
  createdAt: number;
  content: string;
}

/** A message from the user. */
export interface LlmUserMessage extends LlmMessageBase {
  role: 'user';
}

/** A message from the assistant, optionally containing tool calls. */
export interface LlmAssistantMessage extends LlmMessageBase {
  role: 'assistant';
  toolCalls: LlmToolCall[];
  thinking: LlmThinkingBlock[];
}

/** A tool execution result, linked to a specific tool call. */
export interface LlmToolResultMessage extends LlmMessageBase {
  role: 'tool';
  callId: string;
}

/** A single message in the LLM conversation context. */
export type LlmMessage =
  | LlmUserMessage
  | LlmAssistantMessage
  | LlmToolResultMessage;

/** Configuration needed to call an LLM API. */
export interface LlmConfig {
  apiFormat: 'claude' | 'openai' | 'openai-responses';
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Token usage statistics. Re-exported from the shared SSE events package. */
export type LlmUsage = SseUsage;

/** The LLM response has started. */
export interface LlmMessageStartEvent {
  type: 'message-start';
  messageId: string;
}

/** The LLM response has ended. */
export interface LlmMessageEndEvent {
  type: 'message-end';
  stopReason: string;
  usage: LlmUsage;
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
  readonly thinkingLevel: ThinkingLevel;
  readonly signal?: AbortSignal;
}
