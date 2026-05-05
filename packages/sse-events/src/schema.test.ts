import {describe, expect, it} from 'vitest';

import {
  sseBaseEventSchema,
  sseContextCompactionEndEventSchema,
  sseContextCompactionErrorEventSchema,
  sseContextCompactionStartEventSchema,
  sseEventSchema,
} from './schema.js';

describe('context-compaction-start schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-start',
      compactionId: 'abc',
      reason: 'before-llm-call',
      beforeTokens: 1000,
      messageCount: 12,
    };
    expect(sseContextCompactionStartEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });

  it('rejects missing compactionId', () => {
    expect(() =>
      sseContextCompactionStartEventSchema.parse({
        type: 'context-compaction-start',
        reason: 'before-llm-call',
        beforeTokens: 1000,
        messageCount: 12,
      }),
    ).toThrow();
  });

  it('rejects an unknown reason', () => {
    expect(() =>
      sseContextCompactionStartEventSchema.parse({
        type: 'context-compaction-start',
        compactionId: 'abc',
        reason: 'unknown',
        beforeTokens: 1000,
        messageCount: 12,
      }),
    ).toThrow();
  });
});

describe('context-compaction-end schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-end',
      compactionId: 'abc',
      summary: 'A short summary.',
      beforeTokens: 1000,
      afterTokens: 200,
      messageCount: 12,
      durationMs: 4321,
    };
    expect(sseContextCompactionEndEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });
});

describe('context-compaction-error schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-error',
      compactionId: 'abc',
      reason: 'after-turn',
      message: 'Aborted',
      beforeTokens: 1000,
      messageCount: 12,
    };
    expect(sseContextCompactionErrorEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });
});
