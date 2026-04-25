import {afterEach, describe, expect, it, vi} from 'vitest';

import type {LlmConfig} from '../llm-api/types.js';

const mockRetrieve = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: class {
    models = {retrieve: mockRetrieve};
  },
}));

// Dynamic import so the mock is in place before the module loads.
const {modelCapacity} = await import('./model-capacity.js');

function makeConfig(
  overrides: Partial<LlmConfig> & Pick<LlmConfig, 'apiFormat' | 'model'>,
): LlmConfig {
  return {
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com',
    ...overrides,
  };
}

afterEach(() => {
  mockRetrieve.mockReset();
});

describe('modelCapacity', () => {
  describe('OpenAI path', () => {
    it('returns known output limit for a known model', async () => {
      const config = makeConfig({apiFormat: 'openai', model: 'gpt-5.4'});
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(128_000);
    });

    it('returns known limits for GPT-5.5', async () => {
      const config = makeConfig({apiFormat: 'openai', model: 'gpt-5.5'});
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(128_000);
      expect(await modelCapacity.getMaxInputTokens(config)).toBe(400_000);
    });

    it('returns known output limit via openai-responses format', async () => {
      const config = makeConfig({
        apiFormat: 'openai-responses',
        model: 'gpt-5.2-codex',
      });
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(128_000);
    });

    it('returns default for an unknown model', async () => {
      const config = makeConfig({
        apiFormat: 'openai',
        model: 'unknown-model-xyz',
      });
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(16_384);
      expect(await modelCapacity.getMaxInputTokens(config)).toBe(128_000);
    });

    it('returns known limits for a Gemini model', async () => {
      const config = makeConfig({
        apiFormat: 'openai',
        model: 'gemini-2.5-pro',
      });
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(64_000);
      expect(await modelCapacity.getMaxInputTokens(config)).toBe(128_000);
    });
  });

  describe('Claude path', () => {
    it('returns known limits for a Copilot Claude model', async () => {
      const config = makeConfig({
        apiFormat: 'claude',
        model: 'claude-opus-4.7',
      });
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(32_000);
      expect(await modelCapacity.getMaxInputTokens(config)).toBe(200_000);
      expect(mockRetrieve).not.toHaveBeenCalled();
    });

    it('returns limits from the Anthropic Models API', async () => {
      mockRetrieve.mockResolvedValue({
        max_tokens: 128_000,
        max_input_tokens: 1_000_000,
      });
      const config = makeConfig({
        apiFormat: 'claude',
        model: 'claude-opus-4-6',
      });

      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(128_000);
      expect(await modelCapacity.getMaxInputTokens(config)).toBe(1_000_000);
      expect(mockRetrieve).toHaveBeenCalledWith('claude-opus-4-6');
    });

    it('caches the result for subsequent calls', async () => {
      mockRetrieve.mockResolvedValue({
        max_tokens: 64_000,
        max_input_tokens: 200_000,
      });
      const config = makeConfig({
        apiFormat: 'claude',
        model: 'claude-sonnet-4-6',
      });

      await modelCapacity.getMaxOutputTokens(config);
      await modelCapacity.getMaxInputTokens(config);

      // Only one API call despite two queries.
      expect(mockRetrieve).toHaveBeenCalledTimes(1);
    });

    it('falls back to defaults when the API call fails', async () => {
      mockRetrieve.mockRejectedValue(new Error('Not Found'));
      const config = makeConfig({
        apiFormat: 'claude',
        model: 'claude-unknown',
      });

      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(16_384);
      expect(await modelCapacity.getMaxInputTokens(config)).toBe(200_000);
    });

    it('retries the API call after a transient failure', async () => {
      mockRetrieve
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValueOnce({
          max_tokens: 64_000,
          max_input_tokens: 200_000,
        });
      const config = makeConfig({
        apiFormat: 'claude',
        model: 'claude-retry-test',
      });

      // First call fails → defaults.
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(16_384);
      // Second call succeeds → real values.
      expect(await modelCapacity.getMaxOutputTokens(config)).toBe(64_000);
      expect(mockRetrieve).toHaveBeenCalledTimes(2);
    });
  });
});
