import type {LlmConfig} from '@/api/llm/index.js';
import {LlmSession} from '@/models/llm-session/index.js';

import type {Agent, AgentEventStream} from '../types.js';

/**
 * A simple agent that directly passes user messages to the LLM.
 * No tool execution — just forwards the LLM event stream.
 */
export class SimpleAgent implements Agent {
  private readonly llmSession: LlmSession;

  constructor(getConfig: () => Promise<LlmConfig>, systemPrompt = '') {
    this.llmSession = new LlmSession(getConfig, systemPrompt);
  }

  async *handleUserMessage(userMessage: string): AgentEventStream {
    yield* this.llmSession.sendMessage(userMessage);
  }
}
