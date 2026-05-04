import {describe, expect, it} from 'vitest';
import {z} from 'zod';

import {llmSettingsSchema} from './llm/schema.js';
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

  it('accepts only supported LLM API formats', () => {
    expect(llmSettingsSchema.safeParse({apiFormat: 'claude'}).success).toBe(
      true,
    );
    expect(
      llmSettingsSchema.safeParse({apiFormat: 'openai-responses'}).success,
    ).toBe(true);
    expect(llmSettingsSchema.safeParse({apiFormat: 'openai'}).success).toBe(
      false,
    );
  });
});
