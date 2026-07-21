import {resolveModelConfig} from '@/agent/model-tier/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the default-tier LLM configuration for coding sessions from settings. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  return resolveModelConfig(settings.codingLlm, settings.codingLlm.defaultTier);
}
