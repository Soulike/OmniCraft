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

describe('model tiers', () => {
  it('defaults defaultTier to powerful with a concrete anchor model', () => {
    const parsed = settingsSchema.parse({});
    expect(parsed.llm.defaultTier).toBe('powerful');
    expect(parsed.llm.powerful.model).toBe('claude-sonnet-4-20250514');
    expect(parsed.llm.versatile.model).toBe('');
    expect(parsed.llm.lightweight.model).toBe('');
    expect(parsed.codingLlm.defaultTier).toBe('powerful');
  });

  it('rejects a blank model on the selected default tier', () => {
    const result = settingsSchema.safeParse({
      llm: {defaultTier: 'versatile', versatile: {model: ''}},
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual([
      'llm',
      'versatile',
      'model',
    ]);
  });

  it('allows blank non-anchor tiers', () => {
    const result = settingsSchema.safeParse({
      llm: {powerful: {model: 'opus'}, versatile: {model: ''}},
    });
    expect(result.success).toBe(true);
  });
});
