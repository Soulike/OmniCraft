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
