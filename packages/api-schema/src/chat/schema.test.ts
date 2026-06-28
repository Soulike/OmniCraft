import {describe, expect, it} from 'vitest';

import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
} from './schema.js';

describe('chat API schemas', () => {
  it('rejects per-message thinking level in completion requests', () => {
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: 'Hello',
        thinkingLevel: 'high',
      }),
    ).toThrow();
  });

  it('rejects unknown chat session creation fields', () => {
    expect(() =>
      createSessionRequestSchema.parse({
        thinkingLevel: 'none',
        workspace: '/tmp/project',
      }),
    ).toThrow();
  });

  it('rejects unknown coding session creation fields', () => {
    expect(() =>
      createCodingSessionRequestSchema.parse({
        workspace: '/tmp/project',
        thinkingLevel: 'medium',
        message: 'Run tests',
      }),
    ).toThrow();
  });
});
