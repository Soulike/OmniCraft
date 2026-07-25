import {describe, expect, it} from 'vitest';

import {llmAttachmentSchema} from './attachment-schemas.js';

describe('llmAttachmentSchema', () => {
  it('accepts every deliverable image type and PDF', () => {
    for (const mediaType of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
    ]) {
      const parsed = llmAttachmentSchema.parse({
        fileName: 'file',
        mediaType,
        byteSize: 1,
      });
      expect(parsed.mediaType).toBe(mediaType);
    }
  });

  it('rejects a media type outside the deliverable set', () => {
    expect(() =>
      llmAttachmentSchema.parse({
        fileName: 'diagram.svg',
        mediaType: 'image/svg+xml',
        byteSize: 1,
      }),
    ).toThrow();
  });

  it('rejects an empty file name', () => {
    expect(() =>
      llmAttachmentSchema.parse({
        fileName: '',
        mediaType: 'image/png',
        byteSize: 1,
      }),
    ).toThrow();
  });

  it('rejects a negative or fractional byte size', () => {
    const base = {fileName: 'a.png', mediaType: 'image/png'};
    expect(() => llmAttachmentSchema.parse({...base, byteSize: -1})).toThrow();
    expect(() => llmAttachmentSchema.parse({...base, byteSize: 1.5})).toThrow();
  });
});
