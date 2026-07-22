import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {writeToTempFile} from './fs.js';

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
