import {describe, expect, it} from 'vitest';

import {parseAttachmentFileName} from './attachment-name.js';

const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(0x7f);

describe('parseAttachmentFileName', () => {
  it('accepts a bare file name, including spaces and non-ASCII', () => {
    expect(parseAttachmentFileName('shot.png')).toBe('shot.png');
    expect(parseAttachmentFileName('invoice (2).pdf')).toBe('invoice (2).pdf');
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['dot', '.'],
    ['dot-dot', '..'],
    ['a traversal segment', '../snapshot.json'],
    ['a nested path', 'sub/shot.png'],
    ['a backslash path', 'sub\\shot.png'],
    ['an absolute path', '/etc/passwd'],
    ['a NUL byte', `shot${NUL}.png`],
    ['a DEL byte', `shot${DEL}.png`],
    ['a newline', 'shot\n.png'],
  ])('rejects %s', (_label, raw) => {
    expect(parseAttachmentFileName(raw)).toBeNull();
  });
});
