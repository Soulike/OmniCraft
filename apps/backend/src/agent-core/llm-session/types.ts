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

/** A fully assembled tool call from the LLM. */
export interface LlmSessionToolCallEvent {
  type: 'tool-call';
  toolCall: LlmToolCall;
}

/** Events yielded by LlmSession.sendMessage(). */
export type LlmSessionEvent =
  | LlmSessionTextDeltaEvent
  | LlmSessionToolCallEvent;

/** An async generator that yields LlmSession events. */
export type LlmSessionEventStream = AsyncGenerator<
  LlmSessionEvent,
  void,
  undefined
>;
