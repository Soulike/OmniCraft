import {describe, expect, it} from 'vitest';

import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  listCodingSessionsResponseSchema,
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

describe('listCodingSessionsResponseSchema', () => {
  it('accepts a sessions array with no total field', () => {
    const parsed = listCodingSessionsResponseSchema.parse({
      sessions: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Task',
          workingDirectory: '/tmp/ws',
        },
      ],
    });
    expect(parsed.sessions).toHaveLength(1);
  });

  it('rejects a payload missing the sessions field', () => {
    expect(() => listCodingSessionsResponseSchema.parse({})).toThrow();
  });
});
