import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

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

      expect(result.content).toContain('Found 2 files');
      expect(result.content).toContain('a.ts');
      expect(result.content).toContain('b.ts');
      expect(result.content).not.toContain('c.js');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.pattern).toBe('**/*.ts');
      expect(result.data.files).toBeInstanceOf(Array);
      expect(result.data.files).toHaveLength(2);
      expect(result.data.truncated).toBe(false);
    });

    it('finds files in subdirectories', async () => {
      await writeFile('src/foo.ts', '');
      await writeFile('src/bar/baz.ts', '');

      const result = await findFilesTool.execute(
        {pattern: 'src/**/*.ts'},
        context,
      );

      expect(result.content).toContain('Found 2 files');
      expect(result.content).toContain('src/foo.ts');
      expect(result.content).toContain('src/bar/baz.ts');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(2);
    });

    it('returns results sorted alphabetically', async () => {
      await writeFile('c.ts', '');
      await writeFile('a.ts', '');
      await writeFile('b.ts', '');

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      const lines = result.content.split('\n');
      const filePaths = lines.filter((l) => l.endsWith('.ts'));
      expect(filePaths).toEqual(['a.ts', 'b.ts', 'c.ts']);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toContain('a.ts');
      expect(result.data.files).toContain('b.ts');
      expect(result.data.files).toContain('c.ts');
    });

    it('matches dotfiles when dot is in pattern', async () => {
      await writeFile('.env.example', '');
      await writeFile('.gitignore', '');
      await writeFile('readme.md', '');

      const result = await findFilesTool.execute({pattern: '.*'}, context);

      expect(result.content).toContain('.env.example');
      expect(result.content).toContain('.gitignore');
      expect(result.content).not.toContain('readme.md');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(2);
    });

    it('searches within a custom path', async () => {
      await writeFile('src/a.ts', '');
      await writeFile('lib/b.ts', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'src'},
        context,
      );

      expect(result.content).toContain('a.ts');
      expect(result.content).not.toContain('b.ts');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(1);
    });

    it('searches with an absolute custom path', async () => {
      await writeFile('src/a.ts', '');
      await writeFile('lib/b.ts', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: path.join(tmpDir, 'src')},
        context,
      );

      expect(result.content).toContain('a.ts');
      expect(result.content).not.toContain('b.ts');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(1);
    });

    it('supports brace expansion (or semantics)', async () => {
      await writeFile('a.ts', '');
      await writeFile('b.tsx', '');
      await writeFile('c.js', '');

      const result = await findFilesTool.execute(
        {pattern: '**/*.{ts,tsx}'},
        context,
      );

      expect(result.content).toContain('a.ts');
      expect(result.content).toContain('b.tsx');
      expect(result.content).not.toContain('c.js');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(2);
    });

    it('returns no-match message when nothing found', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.xyz'},
        context,
      );

      expect(result.content).toContain('No files found matching');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.pattern).toBe('**/*.xyz');
      expect(result.data.files).toHaveLength(0);
      expect(result.data.truncated).toBe(false);
    });

    it('truncates results exceeding 100 entries', async () => {
      const writes = Array.from({length: 120}, (_, i) =>
        writeFile(`file${String(i).padStart(3, '0')}.ts`, ''),
      );
      await Promise.all(writes);

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      expect(result.content).toContain('Found 100+ files');
      expect(result.content).toContain('showing first 100');
      expect(result.content).toContain('Use a more specific pattern');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(100);
      expect(result.data.truncated).toBe(true);
    });

    it('skips blocked paths and appends the policy note', async () => {
      await writeFile('src/app.ts', '');
      await writeFile('.env', 'SECRET=value');
      await writeFile('.git/config', '[core]');

      const result = await findFilesTool.execute({pattern: '**/*'}, context);

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.content).toContain('src/app.ts');
      expect(result.content).not.toContain('.env');
      expect(result.content).not.toContain('.git/config');
      expect(result.content).toContain(
        'Some paths were skipped because they are blocked by file access policy',
      );
      expect(result.data.files).toContain('src/app.ts');
      expect(result.data.files).not.toContain('.env');
    });

    it('skips symlinked files', async () => {
      const target = await writeFile('target.ts', '');
      await fs.symlink(target, path.join(tmpDir, 'link.ts'));

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toContain('target.ts');
      expect(result.data.files).not.toContain('link.ts');
      expect(result.content).toContain(
        'Some paths were skipped because they are blocked by file access policy',
      );
    });

    it('skips explicit traversal through symlinked directories', async () => {
      await writeFile('real-project/.git/config', '[core]');
      await fs.symlink(
        path.join(tmpDir, 'real-project', '.git'),
        path.join(tmpDir, 'safe-link'),
        'dir',
      );

      const result = await findFilesTool.execute(
        {pattern: 'safe-link/**'},
        context,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).not.toContain('safe-link/config');
      expect(result.content).not.toContain('safe-link/config');
      expect(result.content).toContain(
        'Some paths were skipped because they are blocked by file access policy',
      );
    });
  });

  describe('error cases', () => {
    it('returns partial results on timeout', async () => {
      for (let i = 0; i < 5; i++) {
        await writeFile(`file${i}.ts`, '');
      }

      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        // First call sets startTime, subsequent calls exceed timeout
        if (callCount <= 1) return 0;
        return 31_000;
      });

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      vi.restoreAllMocks();

      expect(result.content).toContain('search timed out after 30s');
      expect(result.content).toContain('Results may be incomplete');
      // Should have collected at least 1 file before timeout
      expect(result.content).toContain('.ts');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('denies a search root whose real target is blocked', async () => {
      await fs.mkdir(path.join(tmpDir, '.git'), {recursive: true});
      await fs.symlink(
        path.join(tmpDir, '.git'),
        path.join(tmpDir, 'git-link'),
        'dir',
      );

      const result = await findFilesTool.execute(
        {pattern: '**/*', path: 'git-link'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
    });

    it('denies a symlinked search root whose target is allowed', async () => {
      await writeFile('real-src/file.ts', '');
      await fs.symlink(
        path.join(tmpDir, 'real-src'),
        path.join(tmpDir, 'src-link'),
        'dir',
      );

      const result = await findFilesTool.execute(
        {pattern: '**/*', path: 'src-link'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
    });

    it('returns error for nonexistent directory', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'nonexistent'},
        context,
      );

      expect(result.content).toContain('Error: Directory not found');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error when path is a file', async () => {
      await writeFile('afile.txt', 'content');

      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'afile.txt'},
        context,
      );

      expect(result.content).toContain('Error: Not a directory');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });
});
