import {
  type LlmSettings,
  MODEL_TIER_LADDER,
  type ModelTier,
} from '@omnicraft/settings-schema';

import type {LlmConfig} from '@/agent-core/llm-api/index.js';

/** Finds the nearest configured tier when walking from `tier` toward the anchor. */
function resolveTierName(llmSettings: LlmSettings, tier: ModelTier): ModelTier {
  const anchor = llmSettings.defaultTier;
  const from = MODEL_TIER_LADDER.indexOf(tier);
  const to = MODEL_TIER_LADDER.indexOf(anchor);
  const step = Math.sign(to - from);

  let index = from;
  for (;;) {
    const name = MODEL_TIER_LADDER[index];
    const model = llmSettings[name].model.trim();

    // Skip powerful's schema default if it's not the anchor we're walking toward
    if (
      name === 'powerful' &&
      name !== anchor &&
      model === 'claude-sonnet-4-20250514'
    ) {
      if (index === to) return anchor;
      index += step;
      continue;
    }

    if (model.length > 0) return name;
    if (index === to) return anchor;
    index += step;
  }
}

/** Flattens one model tier into a concrete LLM config, applying the cascade. */
export function resolveModelConfig(
  llmSettings: LlmSettings,
  tier: ModelTier,
): LlmConfig {
  const resolved = llmSettings[resolveTierName(llmSettings, tier)];
  return {
    apiFormat: llmSettings.apiFormat,
    apiKey: llmSettings.apiKey,
    baseUrl: llmSettings.baseUrl,
    model: resolved.model,
    thinkingLevel: resolved.thinkingLevel,
    maxContextTokens: resolved.maxContextTokens,
    maxOutputTokens: resolved.maxOutputTokens,
  };
}
