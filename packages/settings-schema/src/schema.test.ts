import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {settingsSchema} from './schema.js';

describe('settingsSchema', () => {
  it('can be converted to JSON Schema', () => {
    const jsonSchema = z.toJSONSchema(settingsSchema);
    expect(jsonSchema).toBeDefined();
    expect(typeof jsonSchema).toBe('object');
  });

  it('produces valid JSON when serialized', () => {
    const jsonSchema = z.toJSONSchema(settingsSchema);
    const serialized = JSON.stringify(jsonSchema);
    expect(() => JSON.parse(serialized) as unknown).not.toThrow();
  });
});

describe('llm.main / llm.light defaults', () => {
  it('fills nested main/light defaults for both llm and codingLlm', () => {
    const parsed = settingsSchema.parse({});
    expect(parsed.llm.main.thinkingLevel).toBe('none');
    expect(parsed.llm.main.model).toBe('claude-sonnet-4-20250514');
    expect(parsed.llm.main.maxContextTokens).toBe(200_000);
    expect(parsed.llm.main.maxOutputTokens).toBe(32_000);
    expect(parsed.llm.light.model).toBe('');
    expect(parsed.codingLlm.light.thinkingLevel).toBe('none');
  });

  it('accepts per-model thinking levels', () => {
    const parsed = settingsSchema.parse({
      llm: {main: {thinkingLevel: 'minimal'}},
      codingLlm: {light: {thinkingLevel: 'max'}},
    });
    expect(parsed.llm.main.thinkingLevel).toBe('minimal');
    expect(parsed.codingLlm.light.thinkingLevel).toBe('max');
  });

  it('rejects a model whose output is not less than its context', () => {
    const result = settingsSchema.safeParse({
      llm: {main: {maxContextTokens: 100_000, maxOutputTokens: 100_000}},
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual([
      'llm',
      'main',
      'maxOutputTokens',
    ]);
  });
});
