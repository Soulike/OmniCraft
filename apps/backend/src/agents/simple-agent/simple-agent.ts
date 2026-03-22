import type {LlmConfig} from '@/api/llm/index.js';

import type {AgentEventStream} from '../types.js';
import {Agent} from '../types.js';

/**
 * A simple agent that directly passes user messages to the LLM.
 * No tool execution — just forwards the LLM event stream.
 */
export class SimpleAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>, systemPrompt = '') {
    super(getConfig, systemPrompt);
  }

  async *handleUserMessage(userMessage: string): AgentEventStream {
    yield* this.getLlmSession().sendMessage(userMessage);
  }
}
