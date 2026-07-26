import fs, {lstat} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {isFileExistsError, statRegularFile, writeToTempFile} from './fs.js';

// Defaults to the real implementation — only the test exercising a genuine
// (non-ENOENT) lstat failure below overrides a single call.
vi.mock('node:fs/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs/promises')>();
  return {...actual, lstat: vi.fn(actual.lstat)};
});

describe('writeToTempFile', () => {
  let filePath: string;

  afterEach(async () => {
    if (filePath) {
      await fs.rm(filePath, {force: true});
    }
  });

  it('writes content and returns a path under os.tmpdir()', async () => {
    filePath = await writeToTempFile('hello world', '.md');
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('hello world');
    expect(filePath.startsWith(os.tmpdir())).toBe(true);
  });

  it('uses the given extension', async () => {
    filePath = await writeToTempFile('test', '.txt');
    expect(path.extname(filePath)).toBe('.txt');
  });

  it('writes under a provided directory when given one', async () => {
    const dir = await fs.realpath(
      await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-dir-')),
    );
    filePath = await writeToTempFile('scoped', '.md', dir);
    expect(path.dirname(filePath)).toBe(dir);
    const content = await fs.readFile(filePath, 'utf-8');
    expect(content).toBe('scoped');
    await fs.rm(dir, {recursive: true, force: true});
  });
});

describe('isFileExistsError', () => {
  let filePath: string;

  afterEach(async () => {
    if (filePath) {
      await fs.rm(filePath, {force: true});
    }
  });

  it('is true for a real EEXIST error', async () => {
    filePath = await writeToTempFile('existing', '.txt');

    let caught: unknown;
    try {
      await fs.writeFile(filePath, 'again', {flag: 'wx'});
    } catch (error) {
      caught = error;
    }

    expect(isFileExistsError(caught)).toBe(true);
  });

  it('is false for an unrelated error', () => {
    expect(isFileExistsError(new Error('boom'))).toBe(false);
  });

  it('is false for a non-error value', () => {
    expect(isFileExistsError('EEXIST')).toBe(false);
    expect(isFileExistsError(undefined)).toBe(false);
  });
});

describe('statRegularFile', () => {
  let scratchDirectory: string;

  beforeEach(async () => {
    scratchDirectory = await fs.mkdtemp(
      path.join(os.tmpdir(), 'stat-regular-file-'),
    );
  });

  afterEach(async () => {
    await fs.rm(scratchDirectory, {recursive: true, force: true});
    vi.restoreAllMocks();
  });

  it('returns stats for a regular file', async () => {
    const filePath = path.join(scratchDirectory, 'file.txt');
    await fs.writeFile(filePath, 'hello');

    const stats = await statRegularFile(filePath);
    expect(stats).not.toBeNull();
    expect(stats?.isFile()).toBe(true);
    expect(stats?.size).toBe(5);
  });

  it('returns null for a missing file', async () => {
    expect(
      await statRegularFile(path.join(scratchDirectory, 'nope.txt')),
    ).toBeNull();
  });

  it('returns null for a directory', async () => {
    const dirPath = path.join(scratchDirectory, 'sub');
    await fs.mkdir(dirPath);
    expect(await statRegularFile(dirPath)).toBeNull();
  });

  it('returns null for a symlink at the path itself, without following it', async () => {
    const target = path.join(scratchDirectory, 'target.txt');
    await fs.writeFile(target, 'hello');
    const link = path.join(scratchDirectory, 'link.txt');
    await fs.symlink(target, link);

    // lstat, never stat: a symlink at the leaf must be rejected even though
    // it points at a real regular file.
    expect(await statRegularFile(link)).toBeNull();
  });

  it('rethrows an error other than ENOENT', async () => {
    const filePath = path.join(scratchDirectory, 'file.txt');
    await fs.writeFile(filePath, 'hello');

    const accessError = Object.assign(new Error('EACCES: permission denied'), {
      code: 'EACCES',
    });
    vi.mocked(lstat).mockRejectedValueOnce(accessError);

    await expect(statRegularFile(filePath)).rejects.toBe(accessError);
  });
});
