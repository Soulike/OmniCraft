import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/state/file-content-cache.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {editFileTool} from './edit-file.js';

describe('editFileTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eft-test-'));
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  async function writeFile(name: string, content: string): Promise<string> {
    const filePath = path.join(tmpDir, name);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, content);
    return filePath;
  }

  it('has the correct name', () => {
    expect(editFileTool.name).toBe('edit_file');
  });

  describe('success cases', () => {
    it('succeeds when file was read first', async () => {
      const filePath = path.join(tmpDir, 'tracked.ts');
      await fs.writeFile(filePath, 'old line\n');
      const stat = await fs.stat(filePath);
      context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

      const result = await editFileTool.execute(
        {filePath: 'tracked.ts', oldString: 'old line', newString: 'new line'},
        context,
      );

      expect(result.content).toContain('File edited:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('tracked.ts');
      expect(result.data.matchCount).toBe(1);
      expect(result.data.diff).toBeTruthy();
      expect(result.data.truncated).toBe(false);
    });

    it('replaces a unique string', async () => {
      await writeFile('test.ts', 'const x = 1;\nconst y = 2;\n');
      const stat = await fs.stat(path.join(tmpDir, 'test.ts'));
      context.fileStatTracker.set(
        path.join(tmpDir, 'test.ts'),
        stat.size,
        stat.mtimeMs,
      );

      const result = await editFileTool.execute(
        {
          filePath: 'test.ts',
          oldString: 'const x = 1;',
          newString: 'const x = 42;',
        },
        context,
      );

      expect(result.content).toContain('File edited: test.ts');
      expect(result.content).toContain('1 replacement(s)');
      expect(result.content).toContain('-const x = 1;');
      expect(result.content).toContain('+const x = 42;');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('test.ts');
      expect(result.data.matchCount).toBe(1);
      expect(result.data.diff).toBeTruthy();
      expect(result.data.truncated).toBe(false);
      const written = await fs.readFile(path.join(tmpDir, 'test.ts'), 'utf-8');
      expect(written).toBe('const x = 42;\nconst y = 2;\n');
    });

    it('replaces all occurrences with replaceAll', async () => {
      await writeFile('test.ts', 'foo\nbar\nfoo\nbaz\nfoo\n');
      const stat = await fs.stat(path.join(tmpDir, 'test.ts'));
      context.fileStatTracker.set(
        path.join(tmpDir, 'test.ts'),
        stat.size,
        stat.mtimeMs,
      );

      const result = await editFileTool.execute(
        {
          filePath: 'test.ts',
          oldString: 'foo',
          newString: 'qux',
          replaceAll: true,
        },
        context,
      );

      expect(result.content).toContain('3 replacement(s)');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matchCount).toBe(3);
      expect(result.data.truncated).toBe(false);
      const written = await fs.readFile(path.join(tmpDir, 'test.ts'), 'utf-8');
      expect(written).toBe('qux\nbar\nqux\nbaz\nqux\n');
    });

    it('returns unified diff in output', async () => {
      await writeFile('test.ts', 'line1\nold line\nline3\n');
      const stat = await fs.stat(path.join(tmpDir, 'test.ts'));
      context.fileStatTracker.set(
        path.join(tmpDir, 'test.ts'),
        stat.size,
        stat.mtimeMs,
      );

      const result = await editFileTool.execute(
        {filePath: 'test.ts', oldString: 'old line', newString: 'new line'},
        context,
      );

      expect(result.content).toContain('---');
      expect(result.content).toContain('+++');
      expect(result.content).toContain('-old line');
      expect(result.content).toContain('+new line');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.diff).toBeTruthy();
      expect(result.data.truncated).toBe(false);
    });

    it('truncates large diffs at 4KB', async () => {
      const longOld = 'x'.repeat(3000);
      const longNew = 'y'.repeat(3000);
      await writeFile('big.ts', `before\n${longOld}\nafter\n`);
      const stat = await fs.stat(path.join(tmpDir, 'big.ts'));
      context.fileStatTracker.set(
        path.join(tmpDir, 'big.ts'),
        stat.size,
        stat.mtimeMs,
      );

      const result = await editFileTool.execute(
        {filePath: 'big.ts', oldString: longOld, newString: longNew},
        context,
      );

      expect(result.content).toContain('File edited: big.ts');
      expect(result.content).toContain('Diff truncated');
      expect(result.content).toContain('Read the file to review');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.truncated).toBe(true);
      expect(result.data.diff).toBeTruthy();
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = await writeFile('abs.txt', 'old');
      const stat = await fs.stat(absPath);
      context.fileStatTracker.set(absPath, stat.size, stat.mtimeMs);

      const result = await editFileTool.execute(
        {filePath: absPath, oldString: 'old', newString: 'new'},
        context,
      );

      expect(result.content).toContain('File edited:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBeTruthy();
      expect(result.data.diff).toBeTruthy();
    });
  });

  describe('error cases', () => {
    it('returns error for nonexistent file', async () => {
      const result = await editFileTool.execute(
        {filePath: 'nope.txt', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result.content).toContain('Error: File not found');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error for directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'adir'));

      const result = await editFileTool.execute(
        {filePath: 'adir', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result.content).toContain('Error: Not a file');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error when oldString not found', async () => {
      await writeFile('test.ts', 'hello world');
      const stat = await fs.stat(path.join(tmpDir, 'test.ts'));
      context.fileStatTracker.set(
        path.join(tmpDir, 'test.ts'),
        stat.size,
        stat.mtimeMs,
      );

      const result = await editFileTool.execute(
        {filePath: 'test.ts', oldString: 'nonexistent', newString: 'new'},
        context,
      );

      expect(result.content).toContain('Error: old string not found');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects no-op replacement when oldString equals newString', async () => {
      const filePath = await writeFile('noop.ts', 'content');
      const stat = await fs.stat(filePath);
      context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

      const result = await editFileTool.execute(
        {filePath: 'noop.ts', oldString: 'content', newString: 'content'},
        context,
      );

      expect(result.content).toContain(
        'Error: oldString and newString are identical',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error on multiple matches without replaceAll', async () => {
      await writeFile('test.ts', 'foo\nbar\nfoo\n');
      const stat = await fs.stat(path.join(tmpDir, 'test.ts'));
      context.fileStatTracker.set(
        path.join(tmpDir, 'test.ts'),
        stat.size,
        stat.mtimeMs,
      );

      const result = await editFileTool.execute(
        {filePath: 'test.ts', oldString: 'foo', newString: 'baz'},
        context,
      );

      expect(result.content).toContain('Error: Found 2 matches');
      expect(result.content).toContain('replaceAll');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects files exceeding 10MB', async () => {
      const bigPath = path.join(tmpDir, 'huge.txt');
      const handle = await fs.open(bigPath, 'w');
      await handle.truncate(10_485_761);
      await handle.close();

      const result = await editFileTool.execute(
        {filePath: 'huge.txt', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result.content).toContain('Error: File exceeds');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects editing a file that was not read', async () => {
      await writeFile('unread.ts', 'content');

      const result = await editFileTool.execute(
        {filePath: 'unread.ts', oldString: 'content', newString: 'new'},
        context,
      );

      expect(result.content).toContain(
        'Error: Read the file before modifying it',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects editing a file modified since last read', async () => {
      const filePath = await writeFile('stale.ts', 'old content');
      // Track with stale stat
      context.fileStatTracker.set(filePath, 0, 0);

      const result = await editFileTool.execute(
        {filePath: 'stale.ts', oldString: 'old content', newString: 'new'},
        context,
      );

      expect(result.content).toContain(
        'Error: File has been modified since last read',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });
});
