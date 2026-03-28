import crypto from 'node:crypto';

import type {LlmConfig} from '@/api/llm/index.js';
import {eventBus} from '@/events/index.js';
import type {LlmSessionEvent} from '@/models/llm-session/index.js';
import {LlmSession} from '@/models/llm-session/index.js';
import {LlmSessionStore} from '@/models/llm-session-store/index.js';

/**
 * Agent event stream. Currently identical to LlmSessionEvent.
 * Will diverge as agents add higher-level events (e.g., thinking, sub-agent delegation).
 */
export type AgentEvent = LlmSessionEvent;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

/**
 * Base class for all agents.
 * Implementations can range from a simple LLM passthrough (SimpleAgent)
 * to complex agents with tool calling, multi-step reasoning, and sub-agents.
 */
export abstract class Agent {
  /** Unique identifier for this agent session. */
  readonly id: string;

  /** The id of the LLM session used by this agent. */
  readonly llmSessionId: string;

  /** Cached LLM session instance, lazily resolved from the store. */
  private cachedLlmSession: LlmSession | null = null;

  constructor(getConfig: () => Promise<LlmConfig>) {
    this.id = crypto.randomUUID();
    const llmSession = new LlmSession(getConfig);
    this.llmSessionId = llmSession.id;
    eventBus.emit('agent-created', this);
  }

  /** Resolves the LLM session from the store, caching the result. */
  protected getLlmSession(): LlmSession {
    if (!this.cachedLlmSession) {
      const session = LlmSessionStore.getInstance().get(this.llmSessionId);
      if (!session) {
        throw new Error(`LLM session not found: ${this.llmSessionId}`);
      }
      this.cachedLlmSession = session;
    }
    return this.cachedLlmSession;
  }

  /** Handles a user message and streams back response events for one turn. */
  abstract handleUserMessage(userMessage: string): AgentEventStream;
}
