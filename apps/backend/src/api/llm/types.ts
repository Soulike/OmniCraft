/** A tool call issued by the assistant. */
export interface LlmToolCall {
  callId: string;
  toolName: string;
  arguments: string;
}

/** A message from the user. */
export interface LlmUserMessage {
  role: 'user';
  content: string;
}

/** A message from the assistant, optionally containing tool calls. */
export interface LlmAssistantMessage {
  role: 'assistant';
  content: string;
  toolCalls: LlmToolCall[];
}

/** A tool execution result, linked to a specific tool call. */
export interface LlmToolResultMessage {
  role: 'tool';
  callId: string;
  content: string;
}

/** A single message in the LLM conversation context. */
export type LlmMessage =
  | LlmUserMessage
  | LlmAssistantMessage
  | LlmToolResultMessage;

/** Configuration needed to call an LLM API. */
export interface LlmConfig {
  apiFormat: 'claude' | 'openai';
  apiKey: string;
  baseUrl: string;
  model: string;
}

/** Token usage statistics. */
export interface LlmUsage {
  inputTokens: number;
  outputTokens: number;
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
  usage: LlmUsage;
}

/** A text content delta from the LLM. */
export interface LlmTextDeltaEvent {
  type: 'text-delta';
  content: string;
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
}
