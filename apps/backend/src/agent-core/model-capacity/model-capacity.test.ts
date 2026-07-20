import {describe, expect, it} from 'vitest';

import type {LlmConfig} from '../llm-api/types.js';
import {modelCapacity} from './model-capacity.js';

function makeConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    apiFormat: 'claude',
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com',
    model: 'test-model',
    thinkingLevel: 'none',
    maxContextTokens: 200_000,
    maxOutputTokens: 32_000,
    ...overrides,
  };
}

describe('modelCapacity', () => {
  it('returns the configured max output tokens', () => {
    expect(
      modelCapacity.getMaxOutputTokens(makeConfig({maxOutputTokens: 64_000})),
    ).toBe(64_000);
  });

  it('derives max prompt tokens as context minus output', () => {
    expect(
      modelCapacity.getMaxPromptTokens(
        makeConfig({maxContextTokens: 200_000, maxOutputTokens: 32_000}),
      ),
    ).toBe(168_000);
  });

  it('clamps max prompt tokens to at least 1 when output >= context', () => {
    expect(
      modelCapacity.getMaxPromptTokens(
        makeConfig({maxContextTokens: 10_000, maxOutputTokens: 10_000}),
      ),
    ).toBe(1);
  });
});
