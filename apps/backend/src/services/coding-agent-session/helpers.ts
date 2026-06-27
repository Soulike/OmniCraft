import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the LLM configuration for coding sessions from settings. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model, thinkingLevel} = settings.codingLlm;
  return {apiFormat, apiKey, baseUrl, model, thinkingLevel};
}
