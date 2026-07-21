import {type LlmSettings, llmSettingsSchema} from '@omnicraft/settings-schema';
import {describe, expect, it} from 'vitest';

import {resolveModelConfig} from './resolve-model-config.js';

function build(overrides: Record<string, unknown>): LlmSettings {
  return llmSettingsSchema.parse({
    apiFormat: 'claude',
    apiKey: 'k',
    baseUrl: 'https://api.anthropic.com',
    ...overrides,
  });
}

describe('resolveModelConfig', () => {
  it('returns each tier when all are configured', () => {
    const s = build({
      powerful: {model: 'opus'},
      versatile: {model: 'sonnet'},
      lightweight: {model: 'haiku'},
    });
    expect(resolveModelConfig(s, 'powerful').model).toBe('opus');
    expect(resolveModelConfig(s, 'versatile').model).toBe('sonnet');
    expect(resolveModelConfig(s, 'lightweight').model).toBe('haiku');
  });

  it('falls a blank lightweight up to versatile when set', () => {
    const s = build({powerful: {model: 'opus'}, versatile: {model: 'sonnet'}});
    expect(resolveModelConfig(s, 'lightweight').model).toBe('sonnet');
  });

  it('falls blank tiers up to the powerful anchor', () => {
    const s = build({powerful: {model: 'opus'}});
    expect(resolveModelConfig(s, 'lightweight').model).toBe('opus');
    expect(resolveModelConfig(s, 'versatile').model).toBe('opus');
  });

  it('inherits the full config of the resolved tier', () => {
    const s = build({
      powerful: {
        model: 'opus',
        thinkingLevel: 'high',
        maxContextTokens: 300_000,
        maxOutputTokens: 50_000,
      },
    });
    const resolved = resolveModelConfig(s, 'lightweight');
    expect(resolved.thinkingLevel).toBe('high');
    expect(resolved.maxContextTokens).toBe(300_000);
    expect(resolved.maxOutputTokens).toBe(50_000);
  });

  it('carries the shared connection fields', () => {
    const s = build({powerful: {model: 'opus'}});
    const resolved = resolveModelConfig(s, 'versatile');
    expect(resolved.apiKey).toBe('k');
    expect(resolved.baseUrl).toBe('https://api.anthropic.com');
    expect(resolved.apiFormat).toBe('claude');
  });

  it('walks toward a non-powerful anchor', () => {
    const s = build({
      defaultTier: 'lightweight',
      lightweight: {model: 'haiku'},
      versatile: {model: ''},
      powerful: {model: ''},
    });
    expect(resolveModelConfig(s, 'powerful').model).toBe('haiku');
    expect(resolveModelConfig(s, 'versatile').model).toBe('haiku');
  });

  it('respects an explicit powerful model even when it equals the schema default and is not the anchor', () => {
    const s = build({
      defaultTier: 'lightweight',
      lightweight: {model: 'haiku'},
      powerful: {model: 'claude-sonnet-4-20250514'},
    });
    expect(resolveModelConfig(s, 'powerful').model).toBe(
      'claude-sonnet-4-20250514',
    );
  });
});
