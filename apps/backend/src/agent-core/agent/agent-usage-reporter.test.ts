import {afterEach, describe, expect, it, vi} from 'vitest';

import type {LlmConfig} from '../llm-api/index.js';
import type {LlmSession} from '../llm-session/index.js';
import {modelCapacity} from '../model-capacity/index.js';
import {agentUsageReporter} from './agent-usage-reporter.js';

const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
  thinkingLevel: 'high',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};

describe('AgentUsageReporter', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds usage-update events from config, model capacity, and session usage', async () => {
    vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(200_000);
    const llmSession = {
      getUsage: () => ({
        currentContextInputTokens: 40,
        latestCallOutputTokens: 8,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
      }),
    } satisfies Pick<LlmSession, 'getUsage'>;

    const event = await agentUsageReporter.buildUsageUpdateEvent({
      getConfig: () => Promise.resolve(MAIN_CONFIG),
      llmSession,
    });

    expect(event).toEqual({
      type: 'usage-update',
      usage: {
        model: 'main-model',
        contextWindowTokens: 200_000,
        currentContextInputTokens: 40,
        latestCallOutputTokens: 8,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
        thinkingLevel: 'high',
      },
    });
  });
});
