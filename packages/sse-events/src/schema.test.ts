import {describe, expect, it} from 'vitest';

import {sseDoneEventSchema} from './schema.js';

describe('SSE event schemas', () => {
  it('accepts the explicit session usage fields on done events', () => {
    const event = {
      type: 'done',
      reason: 'complete',
      usage: {
        model: 'gpt-4.1',
        contextWindowTokens: 128000,
        currentContextInputTokens: 4200,
        sessionInputTokens: 10000,
        sessionOutputTokens: 3000,
        sessionCacheReadInputTokens: 2500,
        thinkingLevel: 'none',
      },
    };

    expect(sseDoneEventSchema.parse(event)).toEqual(event);
  });

  it('rejects done events missing the explicit session usage fields', () => {
    const result = sseDoneEventSchema.safeParse({
      type: 'done',
      reason: 'complete',
      usage: {
        model: 'gpt-4.1',
        contextWindowTokens: 128000,
        inputTokens: 10000,
        outputTokens: 3000,
        cacheReadInputTokens: 2500,
        thinkingLevel: 'none',
      },
    });

    expect(result.success).toBe(false);
  });
});
