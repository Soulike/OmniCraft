import {mkdtempSync, rmSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterAll, describe, expect, it} from 'vitest';

import {guardMedia, MAX_INLINE_MEDIA_BYTES} from './media-guard.js';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'media-guard-'));

afterAll(() => {
  rmSync(scratch, {recursive: true, force: true});
});

describe('guardMedia', () => {
  it('inlines media under the cap as a media block', async () => {
    const data = Buffer.from('small png bytes').toString('base64');
    const block = await guardMedia({
      data,
      mediaType: 'image/png',
      scratchDirectory: scratch,
    });
    expect(block).toEqual({type: 'image', mediaType: 'image/png', data});
  });

  it('spills oversize media to a scratch file and returns a text block with the path', async () => {
    const big = Buffer.alloc(MAX_INLINE_MEDIA_BYTES + 1, 1);
    const data = big.toString('base64');
    const block = await guardMedia({
      data,
      mediaType: 'image/png',
      name: 'huge.png',
      scratchDirectory: scratch,
    });
    expect(block.type).toBe('text');
    if (block.type !== 'text') throw new Error('expected text block');
    expect(block.text).toContain('too large');
    const match = /saved to (.+)]/.exec(block.text);
    expect(match).not.toBeNull();
    if (match) {
      const spilled = await readFile(match[1]);
      expect(spilled.equals(big)).toBe(true);
    }
  });
});
