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

describe('llm.thinkingLevel', () => {
  it('defaults to none for both llm and codingLlm', () => {
    const parsed = settingsSchema.parse({});
    expect(parsed.llm.thinkingLevel).toBe('none');
    expect(parsed.codingLlm.thinkingLevel).toBe('none');
  });

  it('accepts the widened union members', () => {
    const parsed = settingsSchema.parse({
      llm: {thinkingLevel: 'minimal'},
      codingLlm: {thinkingLevel: 'max'},
    });
    expect(parsed.llm.thinkingLevel).toBe('minimal');
    expect(parsed.codingLlm.thinkingLevel).toBe('max');
  });
});
