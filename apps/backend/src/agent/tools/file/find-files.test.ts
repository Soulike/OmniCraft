import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {findFilesTool} from './find-files.js';

describe('findFilesTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fft-test-'));
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeFile(name: string, content = ''): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('has the correct name', () => {
    expect(findFilesTool.name).toBe('find_files');
  });

  describe('success cases', () => {
    it('finds files matching a simple pattern', async () => {
      await writeFile('a.ts', '');
      await writeFile('b.ts', '');
      await writeFile('c.js', '');

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      expect(result).toContain('Found 2 files');
      expect(result).toContain('a.ts');
      expect(result).toContain('b.ts');
      expect(result).not.toContain('c.js');
    });

    it('finds files in subdirectories', async () => {
      await writeFile('src/foo.ts', '');
      await writeFile('src/bar/baz.ts', '');

      const result = await findFilesTool.execute(
        {pattern: 'src/**/*.ts'},
        context,
      );

      expect(result).toContain('Found 2 files');
      expect(result).toContain('src/foo.ts');
      expect(result).toContain('src/bar/baz.ts');
    });

    it('returns results sorted alphabetically', async () => {
      await writeFile('c.ts', '');
      await writeFile('a.ts', '');
      await writeFile('b.ts', '');

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      const lines = result.split('\n');
      const filePaths = lines.filter((l) => l.endsWith('.ts'));
      expect(filePaths).toEqual(['a.ts', 'b.ts', 'c.ts']);
    });

    it('matches dotfiles when dot is in pattern', async () => {
      await writeFile('.env', '');
      await writeFile('.gitignore', '');
      await writeFile('readme.md', '');

      const result = await findFilesTool.execute({pattern: '.*'}, context);

      expect(result).toContain('.env');
      expect(result).toContain('.gitignore');
      expect(result).not.toContain('readme.md');
    });

    it('searches within a custom path', async () => {
      await writeFile('src/a.ts', '');
      await writeFile('lib/b.ts', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'src'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.ts');
    });

    it('searches with an absolute custom path', async () => {
      await writeFile('src/a.ts', '');
      await writeFile('lib/b.ts', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: path.join(tmpDir, 'src')},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.ts');
    });

    it('supports brace expansion (or semantics)', async () => {
      await writeFile('a.ts', '');
      await writeFile('b.tsx', '');
      await writeFile('c.js', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.{ts,tsx}'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).toContain('b.tsx');
      expect(result).not.toContain('c.js');
    });

    it('returns no-match message when nothing found', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.xyz'},
        context,
      );

      expect(result).toContain('No files found matching');
    });

    it('truncates results exceeding 100 entries', async () => {
      const writes = Array.from({length: 120}, (_, i) =>
        writeFile(`file${String(i).padStart(3, '0')}.ts`, ''),
      );
      await Promise.all(writes);

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      expect(result).toContain('Found 100+ files');
      expect(result).toContain('showing first 100');
      expect(result).toContain('Use a more specific pattern');
    });
  });

  describe('extraAllowedPaths', () => {
    let extraDir: string;

    beforeEach(async () => {
      extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fft-extra-'));
    });

    afterEach(async () => {
      await fs.rm(extraDir, {recursive: true, force: true});
    });

    it('allows searching in an extra allowed path', async () => {
      await fs.writeFile(path.join(extraDir, 'lib.ts'), '');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read'}],
      });

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: extraDir},
        extraContext,
      );

      expect(result).toContain('lib.ts');
    });

    it('allows searching in an extra read-write path', async () => {
      await fs.writeFile(path.join(extraDir, 'rw.ts'), '');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read-write'}],
      });

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: extraDir},
        extraContext,
      );

      expect(result).toContain('rw.ts');
    });
  });

  describe('error cases', () => {
    it('rejects path outside workingDirectory', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: '/etc'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('rejects path traversal attacks', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: '../../../etc'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent directory', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'nonexistent'},
        context,
      );

      expect(result).toContain('Error: Directory not found');
    });

    it('returns error when path is a file', async () => {
      await writeFile('afile.txt', 'content');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'afile.txt'},
        context,
      );

      expect(result).toContain('Error: Not a directory');
    });
  });
});
