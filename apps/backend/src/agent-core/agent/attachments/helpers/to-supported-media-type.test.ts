import {describe, expect, it} from 'vitest';

import {toSupportedMediaType} from './to-supported-media-type.js';

describe('toSupportedMediaType', () => {
  it('returns null when no mime type was sniffed', () => {
    expect(toSupportedMediaType(undefined)).toBeNull();
  });

  it.each([['image/png'], ['image/jpeg'], ['image/gif'], ['image/webp']])(
    'accepts the image type %s',
    (mime) => {
      expect(toSupportedMediaType(mime)).toBe(mime);
    },
  );

  it('accepts application/pdf', () => {
    expect(toSupportedMediaType('application/pdf')).toBe('application/pdf');
  });

  it.each([['text/plain'], ['application/json'], ['video/mp4']])(
    'rejects the unsupported type %s',
    (mime) => {
      expect(toSupportedMediaType(mime)).toBeNull();
    },
  );
});
