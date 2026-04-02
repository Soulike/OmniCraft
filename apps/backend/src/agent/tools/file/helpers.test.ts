import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  countLines,
  formatWithLineNumbers,
  isBinaryFile,
  isSubPath,
  readLineRange,
  ReadSizeLimitError,
} from './helpers.js';

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

  it('returns false when null byte is beyond 8KB detection range', async () => {
    const textPart = 'a'.repeat(8_192);
    const nullPart = Buffer.from([0x00]);
    const filePath = path.join(tmpDir, 'late-null.bin');
    await fs.writeFile(
      filePath,
      Buffer.concat([Buffer.from(textPart), nullPart]),
    );
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

describe('countLines', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'cl-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('counts lines in a multi-line file', async () => {
    const filePath = path.join(tmpDir, 'lines.txt');
    await fs.writeFile(filePath, 'a\nb\nc\nd\ne\n');
    expect(await countLines(filePath)).toBe(5);
  });

  it('counts lines in a file without trailing newline', async () => {
    const filePath = path.join(tmpDir, 'no-newline.txt');
    await fs.writeFile(filePath, 'a\nb\nc');
    expect(await countLines(filePath)).toBe(3);
  });

  it('returns 1 for a single-line file', async () => {
    const filePath = path.join(tmpDir, 'single.txt');
    await fs.writeFile(filePath, 'only line\n');
    expect(await countLines(filePath)).toBe(1);
  });

  it('counts lines from a Buffer', async () => {
    const buf = Buffer.from('a\nb\nc\n');
    expect(await countLines(buf)).toBe(3);
  });

  it('counts lines with CRLF line endings', async () => {
    const filePath = path.join(tmpDir, 'crlf.txt');
    await fs.writeFile(filePath, 'a\r\nb\r\nc\r\n');
    expect(await countLines(filePath)).toBe(3);
  });

  it('counts lines from a Buffer with CRLF line endings', async () => {
    const buf = Buffer.from('a\r\nb\r\nc\r\n');
    expect(await countLines(buf)).toBe(3);
  });
});

describe('readLineRange', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rlr-test-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  const MAX_BYTES = 1_048_576; // 1MB — generous limit for basic tests

  it('reads all lines when no lineCount is given', async () => {
    const filePath = path.join(tmpDir, 'all.txt');
    await fs.writeFile(filePath, 'a\nb\nc\n');
    const lines = await readLineRange(filePath, 1, undefined, MAX_BYTES);
    expect(lines).toEqual(['a', 'b', 'c']);
  });

  it('reads a specific range from the middle', async () => {
    const filePath = path.join(tmpDir, 'range.txt');
    await fs.writeFile(filePath, 'a\nb\nc\nd\ne\n');
    const lines = await readLineRange(filePath, 2, 3, MAX_BYTES);
    expect(lines).toEqual(['b', 'c', 'd']);
  });

  it('returns empty array when startLine exceeds total lines', async () => {
    const filePath = path.join(tmpDir, 'short.txt');
    await fs.writeFile(filePath, 'a\nb\n');
    const lines = await readLineRange(filePath, 100, undefined, MAX_BYTES);
    expect(lines).toEqual([]);
  });

  it('stops at end of file when lineCount extends beyond', async () => {
    const filePath = path.join(tmpDir, 'end.txt');
    await fs.writeFile(filePath, 'a\nb\nc\n');
    const lines = await readLineRange(filePath, 2, 100, MAX_BYTES);
    expect(lines).toEqual(['b', 'c']);
  });

  it('throws ReadSizeLimitError when result exceeds maxBytes', async () => {
    const filePath = path.join(tmpDir, 'big.txt');
    await fs.writeFile(
      filePath,
      'a'.repeat(100) + '\n' + 'b'.repeat(100) + '\n',
    );
    await expect(readLineRange(filePath, 1, undefined, 50)).rejects.toThrow(
      ReadSizeLimitError,
    );
  });

  it('reads lines from a Buffer', async () => {
    const buf = Buffer.from('a\nb\nc\nd\ne\n');
    const lines = await readLineRange(buf, 2, 3, MAX_BYTES);
    expect(lines).toEqual(['b', 'c', 'd']);
  });

  it('handles CRLF line endings from file', async () => {
    const filePath = path.join(tmpDir, 'crlf.txt');
    await fs.writeFile(filePath, 'a\r\nb\r\nc\r\n');
    const lines = await readLineRange(filePath, 1, undefined, MAX_BYTES);
    expect(lines).toEqual(['a', 'b', 'c']);
  });

  it('handles CRLF line endings from Buffer', async () => {
    const buf = Buffer.from('a\r\nb\r\nc\r\n');
    const lines = await readLineRange(buf, 1, undefined, MAX_BYTES);
    expect(lines).toEqual(['a', 'b', 'c']);
  });
});
