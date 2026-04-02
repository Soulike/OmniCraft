import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {formatWithLineNumbers, isBinaryFile, isSubPath} from './helpers.js';

describe('isSubPath', () => {
  it('returns true for a direct child', () => {
    expect(isSubPath('/home/user', '/home/user/file.txt')).toBe(true);
  });

  it('returns true for a nested child', () => {
    expect(isSubPath('/home/user', '/home/user/a/b/c.txt')).toBe(true);
  });

  it('returns false for the parent itself', () => {
    expect(isSubPath('/home/user', '/home/user')).toBe(false);
  });

  it('returns false for a sibling directory', () => {
    expect(isSubPath('/home/user', '/home/other/file.txt')).toBe(false);
  });

  it('returns false for path traversal', () => {
    expect(isSubPath('/home/user', '/home/user/../other/file.txt')).toBe(false);
  });

  it('returns false for prefix trick (userdata vs user)', () => {
    expect(isSubPath('/home/user', '/home/userdata/file.txt')).toBe(false);
  });
});

describe('isBinaryFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'bin-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('returns false for a text file', async () => {
    const filePath = path.join(tmpDir, 'text.txt');
    await fs.writeFile(filePath, 'hello world\n');
    expect(await isBinaryFile(filePath)).toBe(false);
  });

  it('returns true for a file with null bytes', async () => {
    const filePath = path.join(tmpDir, 'binary.bin');
    const buf = Buffer.from('hello\x00world');
    await fs.writeFile(filePath, buf);
    expect(await isBinaryFile(filePath)).toBe(true);
  });

  it('returns false for an empty file', async () => {
    const filePath = path.join(tmpDir, 'empty.txt');
    await fs.writeFile(filePath, '');
    expect(await isBinaryFile(filePath)).toBe(false);
  });
});

describe('formatWithLineNumbers', () => {
  it('formats lines with right-aligned line numbers', () => {
    const result = formatWithLineNumbers(['a', 'b', 'c'], 1, 3);
    expect(result).toBe('1\ta\n2\tb\n3\tc');
  });

  it('pads line numbers to match total line count width', () => {
    const result = formatWithLineNumbers(['x', 'y'], 1, 100);
    expect(result).toBe('  1\tx\n  2\ty');
  });

  it('uses correct line numbers for partial reads', () => {
    const result = formatWithLineNumbers(['d', 'e'], 4, 10);
    expect(result).toBe(' 4\td\n 5\te');
  });

  it('handles single line', () => {
    const result = formatWithLineNumbers(['only'], 1, 1);
    expect(result).toBe('1\tonly');
  });
});
