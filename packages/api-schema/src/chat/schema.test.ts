import {describe, expect, it} from 'vitest';

import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  listSessionsResponseSchema,
  sessionMetadataSchema,
  uploadAttachmentQuerySchema,
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

  it('preserves isWaitingForInput when present', () => {
    const parsed = sessionMetadataSchema.parse({
      id: ID,
      title: 'T',
      isWaitingForInput: true,
    });
    expect(parsed.isWaitingForInput).toBe(true);
  });

  it('parses without isWaitingForInput (backward compatible)', () => {
    const parsed = sessionMetadataSchema.parse({id: ID, title: 'T'});
    expect(parsed.isWaitingForInput).toBeUndefined();
  });

  it('round-trips isWaitingForInput through listSessionsResponseSchema', () => {
    const parsed = listSessionsResponseSchema.parse({
      sessions: [{id: ID, title: 'T', isWaitingForInput: true}],
      total: 1,
    });
    expect(parsed.sessions[0].isWaitingForInput).toBe(true);
  });
});

describe('chatCompletionsRequestSchema attachments', () => {
  // Nothing downstream collapses a repeat: one descriptor per occurrence, one
  // materialization each, charged against both budgets and sent to the model
  // twice. Rejected at the boundary rather than silently deduplicated.
  it('rejects a repeated attachment name', () => {
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: 'hi',
        attachmentFileNames: ['shot.png', 'other.png', 'shot.png'],
      }),
    ).toThrow(/duplicates/);
  });

  it('accepts distinct names that differ only in case', () => {
    expect(
      chatCompletionsRequestSchema.parse({
        message: 'hi',
        attachmentFileNames: ['shot.png', 'SHOT.png'],
      }).attachmentFileNames,
    ).toEqual(['shot.png', 'SHOT.png']);
  });

  it('defaults attachmentFileNames to an empty list', () => {
    const parsed = chatCompletionsRequestSchema.parse({message: 'hello'});
    expect(parsed.attachmentFileNames).toEqual([]);
  });

  it('accepts a list of file names', () => {
    const parsed = chatCompletionsRequestSchema.parse({
      message: 'look',
      attachmentFileNames: ['shot.png', 'invoice.pdf'],
    });
    expect(parsed.attachmentFileNames).toEqual(['shot.png', 'invoice.pdf']);
  });

  it('still requires a non-empty message even with attachments', () => {
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: '',
        attachmentFileNames: ['shot.png'],
      }),
    ).toThrow();
  });

  it('rejects an empty file name', () => {
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: 'look',
        attachmentFileNames: [''],
      }),
    ).toThrow();
  });

  it('rejects more than ten attachment file names', () => {
    const names = Array.from({length: 11}, (_, i) => `f${i.toString()}.png`);
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: 'x',
        attachmentFileNames: names,
      }),
    ).toThrow();
  });

  it('accepts exactly ten', () => {
    const names = Array.from({length: 10}, (_, i) => `f${i.toString()}.png`);
    expect(
      chatCompletionsRequestSchema.parse({
        message: 'x',
        attachmentFileNames: names,
      }).attachmentFileNames,
    ).toHaveLength(10);
  });
});

describe('uploadAttachmentQuerySchema', () => {
  it('requires a non-empty name', () => {
    expect(uploadAttachmentQuerySchema.parse({name: 'a.png'}).name).toBe(
      'a.png',
    );
    expect(() => uploadAttachmentQuerySchema.parse({})).toThrow();
    expect(() => uploadAttachmentQuerySchema.parse({name: ''})).toThrow();
  });
});
