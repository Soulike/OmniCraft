import type {LlmMessage, LlmToolCall} from '../llm-api/index.js';

/** Serializable snapshot of an LlmSession, used for persistence. */
export interface LlmSessionSnapshot {
  id: string;
  messages: LlmMessage[];
}

/** A tool execution result to submit back to the LLM. */
export interface ToolResult {
  callId: string;
  content: string;
}

/** A text content delta from the LLM. */
export interface LlmSessionTextDeltaEvent {
  type: 'text-delta';
  content: string;
}

/** Thinking/reasoning has started. */
export interface LlmSessionThinkingStartEvent {
  type: 'thinking-start';
}

/** A thinking/reasoning content delta from the LLM. */
export interface LlmSessionThinkingDeltaEvent {
  type: 'thinking-delta';
  content: string;
}

/** Thinking/reasoning has ended. */
export interface LlmSessionThinkingEndEvent {
  type: 'thinking-end';
}

/** A fully assembled tool call from the LLM. */
export interface LlmSessionToolCallEvent {
  type: 'tool-call';
  toolCall: LlmToolCall;
}

/** The LLM has started producing a new assistant message. */
export interface LlmSessionMessageStartEvent {
  type: 'message-start';
  messageId: string;
  createdAt: number;
}

/** Events yielded by LlmSession.sendMessage(). */
export type LlmSessionEvent =
  | LlmSessionTextDeltaEvent
  | LlmSessionThinkingStartEvent
  | LlmSessionThinkingDeltaEvent
  | LlmSessionThinkingEndEvent
  | LlmSessionToolCallEvent
  | LlmSessionMessageStartEvent;

/** An async generator that yields LlmSession events. */
export type LlmSessionEventStream = AsyncGenerator<
  LlmSessionEvent,
  void,
  undefined
>;

/** Return value of LlmSession.sendUserMessage(). */
export interface SendUserMessageResult {
  stream: LlmSessionEventStream;
  messageId: string;
  createdAt: number;
}
