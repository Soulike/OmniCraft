import {describe, expect, it} from 'vitest';

import {
  capFor,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_MESSAGE_ATTACHMENT_BYTES,
} from './cap-for.js';

describe('capFor', () => {
  it('returns the document cap for a PDF', () => {
    expect(capFor('application/pdf')).toBe(MAX_DOCUMENT_ATTACHMENT_BYTES);
  });

  it.each([
    ['image/png'],
    ['image/jpeg'],
    ['image/gif'],
    ['image/webp'],
  ] as const)('returns the image cap for %s', (mediaType) => {
    expect(capFor(mediaType)).toBe(MAX_IMAGE_ATTACHMENT_BYTES);
  });

  it('holds the document cap well under the provider request-size limit', () => {
    expect(MAX_DOCUMENT_ATTACHMENT_BYTES).toBeGreaterThan(
      MAX_IMAGE_ATTACHMENT_BYTES,
    );
    expect(MAX_IMAGE_ATTACHMENT_BYTES).toBe(5 * 1024 * 1024);
    expect(MAX_DOCUMENT_ATTACHMENT_BYTES).toBe(10 * 1024 * 1024);
  });

  it('holds the per-message cap at or above every per-file cap', () => {
    expect(MAX_MESSAGE_ATTACHMENT_BYTES).toBeGreaterThanOrEqual(
      Math.max(MAX_DOCUMENT_ATTACHMENT_BYTES, MAX_IMAGE_ATTACHMENT_BYTES),
    );
  });
});
