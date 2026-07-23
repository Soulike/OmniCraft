import {describe, expect, it} from 'vitest';

import {guardMedia, MAX_INLINE_MEDIA_BYTES} from './media-guard.js';

describe('guardMedia', () => {
  it('inlines an image under the cap as an image block', () => {
    const data = Buffer.from('small png bytes').toString('base64');
    expect(guardMedia({data, mediaType: 'image/png'})).toEqual({
      type: 'image',
      mediaType: 'image/png',
      data,
    });
  });

  it('inlines a document under the cap as a document block with its name', () => {
    const data = Buffer.from('small pdf bytes').toString('base64');
    expect(
      guardMedia({data, mediaType: 'application/pdf', name: 'r.pdf'}),
    ).toEqual({
      type: 'document',
      mediaType: 'application/pdf',
      data,
      name: 'r.pdf',
    });
  });

  it('rejects oversize media as a placeholder without spilling to disk', () => {
    const data = Buffer.alloc(MAX_INLINE_MEDIA_BYTES + 1, 1).toString('base64');
    const block = guardMedia({data, mediaType: 'image/png', name: 'huge.png'});

    expect(block.type).toBe('text');
    if (block.type !== 'text') throw new Error('expected text block');
    expect(block.text).toContain('too large');
    expect(block.text).toContain('not delivered');
    expect(block.text).not.toContain('saved to');
  });
});
