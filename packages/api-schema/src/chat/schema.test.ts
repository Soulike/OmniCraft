import {describe, expect, it} from 'vitest';

import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  sessionMetadataSchema,
} from './schema.js';

// valid UUID (sessionIdSchema = z.uuid())
const ID = '11111111-1111-4111-8111-111111111111';

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

describe('sessionMetadataSchema', () => {
  it('preserves updatedAt when present', () => {
    const parsed = sessionMetadataSchema.parse({
      id: ID,
      title: 'T',
      updatedAt: 123,
    });
    expect(parsed.updatedAt).toBe(123);
  });

  it('parses without updatedAt (backward compatible)', () => {
    const parsed = sessionMetadataSchema.parse({id: ID, title: 'T'});
    expect(parsed.updatedAt).toBeUndefined();
  });

  it('preserves isRunning when present', () => {
    const parsed = sessionMetadataSchema.parse({
      id: ID,
      title: 'T',
      isRunning: true,
    });
    expect(parsed.isRunning).toBe(true);
  });

  it('parses without isRunning (backward compatible)', () => {
    const parsed = sessionMetadataSchema.parse({id: ID, title: 'T'});
    expect(parsed.isRunning).toBeUndefined();
  });
});
