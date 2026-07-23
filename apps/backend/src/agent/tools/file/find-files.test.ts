import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/state/file-content-cache.js';
import {toolResultBlocksToText} from '@/agent-core/llm-api/tool-result-block.js';
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

      expect(toolResultBlocksToText(result.content)).toContain('Found 2 files');
      expect(toolResultBlocksToText(result.content)).toContain('a.ts');
      expect(toolResultBlocksToText(result.content)).toContain('b.ts');
      expect(toolResultBlocksToText(result.content)).not.toContain('c.js');
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

      expect(toolResultBlocksToText(result.content)).toContain('Found 2 files');
      expect(toolResultBlocksToText(result.content)).toContain('src/foo.ts');
      expect(toolResultBlocksToText(result.content)).toContain(
        'src/bar/baz.ts',
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(2);
    });

    it('returns results sorted alphabetically', async () => {
      await writeFile('c.ts', '');
      await writeFile('a.ts', '');
      await writeFile('b.ts', '');

      const result = await findFilesTool.execute({pattern: '**/*.ts'}, context);

      const lines = toolResultBlocksToText(result.content).split('\n');
      const filePaths = lines.filter((l) => l.endsWith('.ts'));
      expect(filePaths).toEqual(['a.ts', 'b.ts', 'c.ts']);
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toContain('a.ts');
      expect(result.data.files).toContain('b.ts');
      expect(result.data.files).toContain('c.ts');
    });

    it('matches dotfiles when dot is in pattern', async () => {
      await writeFile('.env', '');
      await writeFile('.gitignore', '');
      await writeFile('readme.md', '');

      const result = await findFilesTool.execute({pattern: '.*'}, context);

      expect(toolResultBlocksToText(result.content)).toContain('.env');
      expect(toolResultBlocksToText(result.content)).toContain('.gitignore');
      expect(toolResultBlocksToText(result.content)).not.toContain('readme.md');
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

      expect(toolResultBlocksToText(result.content)).toContain('a.ts');
      expect(toolResultBlocksToText(result.content)).not.toContain('b.ts');
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

      expect(toolResultBlocksToText(result.content)).toContain('a.ts');
      expect(toolResultBlocksToText(result.content)).not.toContain('b.ts');
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

      expect(toolResultBlocksToText(result.content)).toContain('a.ts');
      expect(toolResultBlocksToText(result.content)).toContain('b.tsx');
      expect(toolResultBlocksToText(result.content)).not.toContain('c.js');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(2);
    });

    it('returns no-match message when nothing found', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.xyz'},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        'No files found matching',
      );
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

      expect(toolResultBlocksToText(result.content)).toContain(
        'Found 100+ files',
      );
      expect(toolResultBlocksToText(result.content)).toContain(
        'showing first 100',
      );
      expect(toolResultBlocksToText(result.content)).toContain(
        'Use a more specific pattern',
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.files).toHaveLength(100);
      expect(result.data.truncated).toBe(true);
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

      expect(toolResultBlocksToText(result.content)).toContain(
        'search timed out after 30s',
      );
      expect(toolResultBlocksToText(result.content)).toContain(
        'Results may be incomplete',
      );
      // Should have collected at least 1 file before timeout
      expect(toolResultBlocksToText(result.content)).toContain('.ts');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error for nonexistent directory', async () => {
      const result = await findFilesTool.execute(
        {pattern: '**/*.ts', path: 'nonexistent'},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        'Error: Directory not found',
      );
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

      expect(toolResultBlocksToText(result.content)).toContain(
        'Error: Not a directory',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });
});
