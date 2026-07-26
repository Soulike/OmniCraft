import {describe, expect, it} from 'vitest';

import {llmUserMessageSchema, toolResultBlockSchema} from './types.js';

describe('toolResultBlockSchema', () => {
  it('accepts a text block', () => {
    expect(
      toolResultBlockSchema.safeParse({type: 'text', text: 'hi'}).success,
    ).toBe(true);
  });

  it('accepts an image block with a supported type', () => {
    const r = toolResultBlockSchema.safeParse({
      type: 'image',
      mediaType: 'image/png',
      data: 'AAAA',
      materializedByteSize: Buffer.from('AAAA', 'base64').byteLength,
    });
    expect(r.success).toBe(true);
  });

  it('rejects an image block with an unsupported type', () => {
    const r = toolResultBlockSchema.safeParse({
      type: 'image',
      mediaType: 'image/svg+xml',
      data: 'AAAA',
      materializedByteSize: Buffer.from('AAAA', 'base64').byteLength,
    });
    expect(r.success).toBe(false);
  });

  it('accepts a document block (pdf only, optional name)', () => {
    expect(
      toolResultBlockSchema.safeParse({
        type: 'document',
        mediaType: 'application/pdf',
        data: 'AAAA',
        materializedByteSize: Buffer.from('AAAA', 'base64').byteLength,
        name: 'a.pdf',
      }).success,
    ).toBe(true);
    expect(
      toolResultBlockSchema.safeParse({
        type: 'document',
        mediaType: 'text/plain',
        data: 'AAAA',
        materializedByteSize: Buffer.from('AAAA', 'base64').byteLength,
      }).success,
    ).toBe(false);
  });
});

describe('llmUserMessageSchema attachments', () => {
  it('defaults attachments to an empty list for pre-attachment snapshots', () => {
    const parsed = llmUserMessageSchema.parse({
      id: 'u1',
      createdAt: 1,
      role: 'user',
      content: 'hello',
    });
    expect(parsed.attachments).toEqual([]);
  });

  it('round-trips an image and a document attachment', () => {
    const parsed = llmUserMessageSchema.parse({
      id: 'u1',
      createdAt: 1,
      role: 'user',
      content: 'look',
      attachments: [
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          lastKnownByteSize: 812345,
        },
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          lastKnownByteSize: 235000,
        },
      ],
    });
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]?.fileName).toBe('shot.png');
    expect(parsed.attachments[1]?.mediaType).toBe('application/pdf');
  });

  it('rejects an attachment with an undeliverable media type', () => {
    expect(() =>
      llmUserMessageSchema.parse({
        id: 'u1',
        createdAt: 1,
        role: 'user',
        content: 'look',
        attachments: [
          {
            fileName: 'diagram.svg',
            mediaType: 'image/svg+xml',
            lastKnownByteSize: 10,
          },
        ],
      }),
    ).toThrow();
  });
});
