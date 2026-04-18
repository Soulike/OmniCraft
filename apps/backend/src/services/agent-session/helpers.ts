import {AgentType} from '@omnicraft/api-schema';

import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the LLM configuration for the given agent type from settings. */
export async function getLlmConfig(agentType: AgentType): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const llmSettings =
    agentType === AgentType.CODING ? settings.codingLlm : settings.llm;
  const {apiFormat, apiKey, baseUrl, model} = llmSettings;
  return {apiFormat, apiKey, baseUrl, model};
}
