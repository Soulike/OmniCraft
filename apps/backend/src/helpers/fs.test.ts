import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {isFileExistsError, writeToTempFile} from './fs.js';

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
