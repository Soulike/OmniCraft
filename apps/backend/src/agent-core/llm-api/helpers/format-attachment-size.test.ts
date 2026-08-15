import {describe, expect, it} from 'vitest';

import {formatAttachmentSize} from './format-attachment-size.js';

describe('formatAttachmentSize', () => {
  it('renders sub-kilobyte sizes in bytes', () => {
    expect(formatAttachmentSize(0)).toBe('0 B');
    expect(formatAttachmentSize(1023)).toBe('1023 B');
  });

  it('renders kilobyte-range sizes rounded to the nearest KB', () => {
    expect(formatAttachmentSize(1024)).toBe('1 KB');
    expect(formatAttachmentSize(240_640)).toBe('235 KB');
    expect(formatAttachmentSize(1024 * 1024 - 1)).toBe('1024 KB');
  });

  it('renders megabyte-range sizes to one decimal place', () => {
    expect(formatAttachmentSize(1024 * 1024)).toBe('1.0 MB');
    expect(formatAttachmentSize(12_910_182)).toBe('12.3 MB');
  });
});
