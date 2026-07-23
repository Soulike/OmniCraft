import {describe, expect, it} from 'vitest';

import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from './media-type-schemas.js';

describe('media-type-schemas', () => {
  it('accepts the four supported image types', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(imageMediaTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects unsupported image types', () => {
    expect(imageMediaTypeSchema.safeParse('image/svg+xml').success).toBe(false);
    expect(imageMediaTypeSchema.safeParse('image/tiff').success).toBe(false);
  });

  it('accepts only application/pdf as a document', () => {
    expect(documentMediaTypeSchema.safeParse('application/pdf').success).toBe(
      true,
    );
    expect(documentMediaTypeSchema.safeParse('text/plain').success).toBe(false);
  });
});
