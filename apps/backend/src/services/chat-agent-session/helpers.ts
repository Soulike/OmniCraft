import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the main LLM configuration for chat sessions from settings. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, main} = settings.llm;
  return {
    apiFormat,
    apiKey,
    baseUrl,
    model: main.model,
    thinkingLevel: main.thinkingLevel,
    maxContextTokens: main.maxContextTokens,
    maxOutputTokens: main.maxOutputTokens,
  };
}
