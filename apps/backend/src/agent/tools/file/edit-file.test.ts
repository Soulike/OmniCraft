import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
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

      expect(result).toContain('File edited:');
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

      expect(result).toContain('File edited: test.ts');
      expect(result).toContain('1 replacement(s)');
      expect(result).toContain('-const x = 1;');
      expect(result).toContain('+const x = 42;');
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

      expect(result).toContain('3 replacement(s)');
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

      expect(result).toContain('---');
      expect(result).toContain('+++');
      expect(result).toContain('-old line');
      expect(result).toContain('+new line');
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

      expect(result).toContain('File edited: big.ts');
      expect(result).toContain('Diff truncated');
      expect(result).toContain('Read the file to review');
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = await writeFile('abs.txt', 'old');
      const stat = await fs.stat(absPath);
      context.fileStatTracker.set(absPath, stat.size, stat.mtimeMs);

      const result = await editFileTool.execute(
        {filePath: absPath, oldString: 'old', newString: 'new'},
        context,
      );

      expect(result).toContain('File edited:');
    });
  });

  describe('extraAllowedPaths', () => {
    let extraDir: string;

    beforeEach(async () => {
      extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'eft-extra-'));
    });

    afterEach(async () => {
      await fs.rm(extraDir, {recursive: true, force: true});
    });

    it('allows editing in a read-write extra path', async () => {
      const filePath = path.join(extraDir, 'extra.txt');
      await fs.writeFile(filePath, 'old content');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read-write'}],
      });

      const stat = await fs.stat(filePath);
      extraContext.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

      const result = await editFileTool.execute(
        {filePath, oldString: 'old', newString: 'new'},
        extraContext,
      );

      expect(result).toContain('File edited:');
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('new content');
    });

    it('rejects editing in a read-only extra path', async () => {
      const filePath = path.join(extraDir, 'readonly.txt');
      await fs.writeFile(filePath, 'content');

      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read'}],
      });

      const result = await editFileTool.execute(
        {filePath, oldString: 'content', newString: 'new'},
        extraContext,
      );

      expect(result).toContain('Error: Access denied: path is read-only');
    });
  });

  describe('error cases', () => {
    it('rejects paths outside workingDirectory', async () => {
      const result = await editFileTool.execute(
        {filePath: '/etc/passwd', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain(
        'Error: Access denied: path is outside the allowed directories',
      );
    });

    it('rejects path traversal attacks', async () => {
      const result = await editFileTool.execute(
        {filePath: '../../../etc/passwd', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent file', async () => {
      const result = await editFileTool.execute(
        {filePath: 'nope.txt', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain('Error: File not found');
    });

    it('returns error for directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'adir'));

      const result = await editFileTool.execute(
        {filePath: 'adir', oldString: 'a', newString: 'b'},
        context,
      );

      expect(result).toContain('Error: Not a file');
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

      expect(result).toContain('Error: old string not found');
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

      expect(result).toContain('Error: Found 2 matches');
      expect(result).toContain('replaceAll');
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

      expect(result).toContain('Error: File exceeds');
    });

    it('rejects editing a file that was not read', async () => {
      await writeFile('unread.ts', 'content');

      const result = await editFileTool.execute(
        {filePath: 'unread.ts', oldString: 'content', newString: 'new'},
        context,
      );

      expect(result).toContain('Error: Read the file before modifying it');
    });

    it('rejects editing a file modified since last read', async () => {
      const filePath = await writeFile('stale.ts', 'old content');
      // Track with stale stat
      context.fileStatTracker.set(filePath, 0, 0);

      const result = await editFileTool.execute(
        {filePath: 'stale.ts', oldString: 'old content', newString: 'new'},
        context,
      );

      expect(result).toContain('Error: File has been modified since last read');
    });
  });
});
