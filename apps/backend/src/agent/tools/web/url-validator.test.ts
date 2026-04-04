import {describe, expect, it} from 'vitest';

import {validateUrl} from './url-validator.js';

describe('validateUrl', () => {
  it('accepts http URLs', () => {
    expect(validateUrl('http://example.com')).toBeUndefined();
  });

  it('accepts https URLs', () => {
    expect(validateUrl('https://example.com/path?q=1')).toBeUndefined();
  });

  it('rejects ftp URLs', () => {
    const error = validateUrl('ftp://files.example.com/data');
    expect(error).toContain('ftp:');
  });

  it('rejects file URLs', () => {
    const error = validateUrl('file:///etc/passwd');
    expect(error).toContain('file:');
  });

  it('rejects data URIs', () => {
    const error = validateUrl('data:text/html,<h1>hi</h1>');
    expect(error).toContain('data:');
  });

  it('rejects invalid URLs', () => {
    const error = validateUrl('not-a-url');
    expect(error).toBeDefined();
  });
});
