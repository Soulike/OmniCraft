import {describe, expect, it} from 'vitest';

import type {LlmConfig} from '../llm-api/types.js';
import {modelCapacity} from './model-capacity.js';

function makeConfig(
  overrides: Partial<LlmConfig> & Pick<LlmConfig, 'apiFormat' | 'model'>,
): LlmConfig {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com',
    ...overrides,
  };
}

describe('modelCapacity', () => {
  describe('getMaxOutputTokens', () => {
    it('returns known output limit for a known OpenAI model', async () => {
      const config = makeConfig({apiFormat: 'openai', model: 'gpt-5.4'});
      const result = await modelCapacity.getMaxOutputTokens(config);
      expect(result).toBe(128_000);
    });

    it('returns known output limit via openai-responses format', async () => {
      const config = makeConfig({
        apiFormat: 'openai-responses',
        model: 'gpt-5.2-codex',
      });
      const result = await modelCapacity.getMaxOutputTokens(config);
      expect(result).toBe(128_000);
    });

    it('returns default for an unknown OpenAI model', async () => {
      const config = makeConfig({
        apiFormat: 'openai',
        model: 'unknown-model-xyz',
      });
      const result = await modelCapacity.getMaxOutputTokens(config);
      expect(result).toBe(16_384);
    });

    it('returns known output limit for a Gemini model', async () => {
      const config = makeConfig({
        apiFormat: 'openai',
        model: 'gemini-2.5-pro',
      });
      const result = await modelCapacity.getMaxOutputTokens(config);
      expect(result).toBe(64_000);
    });
  });

  describe('getMaxInputTokens', () => {
    it('returns known input limit for a known OpenAI model', async () => {
      const config = makeConfig({apiFormat: 'openai', model: 'gpt-5.2'});
      const result = await modelCapacity.getMaxInputTokens(config);
      expect(result).toBe(400_000);
    });

    it('returns default for an unknown OpenAI model', async () => {
      const config = makeConfig({
        apiFormat: 'openai',
        model: 'unknown-model-xyz',
      });
      const result = await modelCapacity.getMaxInputTokens(config);
      expect(result).toBe(128_000);
    });

    it('returns known input limit for a Gemini model', async () => {
      const config = makeConfig({
        apiFormat: 'openai-responses',
        model: 'gemini-3.1-pro-preview',
      });
      const result = await modelCapacity.getMaxInputTokens(config);
      expect(result).toBe(200_000);
    });
  });
});
