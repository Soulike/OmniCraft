import type {SseUsage, SseUsageUpdateEvent} from '@omnicraft/sse-events';

import type {LlmConfig} from '../llm-api/index.js';
import type {LlmSession} from '../llm-session/index.js';
import {modelCapacity} from '../model-capacity/index.js';

export interface BuildAgentUsageInput {
  readonly getConfig: () => Promise<LlmConfig>;
  readonly llmSession: Pick<LlmSession, 'getUsage'>;
}

export class AgentUsageReporter {
  async buildUsage(input: BuildAgentUsageInput): Promise<SseUsage> {
    const config = await input.getConfig();
    const contextWindowTokens = modelCapacity.getMaxPromptTokens(config);
    const usage = input.llmSession.getUsage();
    return {
      model: config.model,
      contextWindowTokens,
      ...usage,
      thinkingLevel: config.thinkingLevel,
    };
  }

  async buildUsageUpdateEvent(
    input: BuildAgentUsageInput,
  ): Promise<SseUsageUpdateEvent> {
    return {
      type: 'usage-update',
      usage: await this.buildUsage(input),
    };
  }
}

export const agentUsageReporter = new AgentUsageReporter();
