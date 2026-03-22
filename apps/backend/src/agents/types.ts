import type {LlmSessionEvent} from '@/models/llm-session/index.js';

/**
 * Agent event stream. Currently identical to LlmSessionEvent.
 * Will diverge as agents add higher-level events (e.g., thinking, sub-agent delegation).
 */
export type AgentEvent = LlmSessionEvent;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

/**
 * Agent interface for processing user messages.
 * Implementations can range from a simple LLM passthrough (SimpleAgent)
 * to complex agents with tool calling, multi-step reasoning, and sub-agents.
 */
export interface Agent {
  /** Handles a user message and streams back response events for one turn. */
  handleUserMessage(userMessage: string): AgentEventStream;
}
