import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {resolveInside} from './resolve-inside.js';

// A literal NUL is written via fromCharCode so this file stays copy/paste-safe.
const NUL = String.fromCharCode(0);
const directory = '/scratch/attachments';

describe('resolveInside', () => {
  it('joins a name that sanitizes to itself onto the directory', () => {
    expect(resolveInside(directory, 'shot.png')).toBe(
      path.join(directory, 'shot.png'),
    );
  });

  it.each([
    ['a traversal segment', '../snapshot.json'],
    ['a nested path', 'sub/shot.png'],
    ['a backslash path', 'sub\\shot.png'],
    ['an absolute path', '/etc/passwd'],
    ['a dot name', '.'],
    ['a dot-dot name', '..'],
    ['an empty name', ''],
    ['a name with a control character', `sh${NUL}ot.png`],
  ])('rejects %s', (_label, fileName) => {
    expect(resolveInside(directory, fileName)).toBeNull();
  });

  // The one intended behavior change (see the design doc, section 3): a name
  // is now compared byte-for-byte against its own sanitized form, so trailing
  // whitespace — silently accepted by the pre-refactor checks — is rejected.
  it('rejects a name with trailing whitespace', () => {
    expect(resolveInside(directory, 'shot.png ')).toBeNull();
  });

  it('rejects an all-whitespace name', () => {
    expect(resolveInside(directory, '   ')).toBeNull();
  });

  // Documents the boundary: only *trailing* whitespace is newly rejected.
  // `sanitize-filename` never strips a leading space, so a purely-leading-
  // whitespace name is still its own fixed point and is still accepted here,
  // same as before the refactor.
  it('does not reject a name with only leading whitespace', () => {
    expect(resolveInside(directory, '  shot.png')).toBe(
      path.join(directory, '  shot.png'),
    );
  });

  it('rejects a Windows-reserved name', () => {
    expect(resolveInside(directory, 'CON')).toBeNull();
  });

  // The now-deleted dispatcher-level `parseAttachmentFileName` also rejected a
  // raw DEL byte (0x7f), which `sanitize-filename`'s control-character sweep
  // (`\x00-\x1f`, `\x80-\x9f`) misses. Rather than loosen the read path to
  // match, `sanitizeFileName` now strips DEL on the write side too — so no
  // stored name can contain one, and this rejection is the read path staying
  // consistent with what `save()` can produce.
  it('rejects a name containing a DEL (0x7f) byte', () => {
    const DEL = String.fromCharCode(0x7f);
    expect(resolveInside(directory, `sh${DEL}ot.png`)).toBeNull();
  });
});
