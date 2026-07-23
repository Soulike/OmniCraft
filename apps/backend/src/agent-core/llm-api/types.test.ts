import {describe, expect, it} from 'vitest';

import {toolResultBlockSchema} from './types.js';

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
    });
    expect(r.success).toBe(true);
  });

  it('rejects an image block with an unsupported type', () => {
    const r = toolResultBlockSchema.safeParse({
      type: 'image',
      mediaType: 'image/svg+xml',
      data: 'AAAA',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a document block (pdf only, optional name)', () => {
    expect(
      toolResultBlockSchema.safeParse({
        type: 'document',
        mediaType: 'application/pdf',
        data: 'AAAA',
        name: 'a.pdf',
      }).success,
    ).toBe(true);
    expect(
      toolResultBlockSchema.safeParse({
        type: 'document',
        mediaType: 'text/plain',
        data: 'AAAA',
      }).success,
    ).toBe(false);
  });
});
