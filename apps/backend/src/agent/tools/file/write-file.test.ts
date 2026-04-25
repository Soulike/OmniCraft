import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {writeFileTool} from './write-file.js';

describe('writeFileTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wft-test-'));
    context = createMockContext({
      workingDirectory: tmpDir,
      fileCache: new FileContentCache(),
    });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('has the correct name', () => {
    expect(writeFileTool.name).toBe('write_file');
  });

  describe('success cases', () => {
    it('creates a new file', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'hello.txt', content: 'hello world'},
        context,
      );

      expect(result.content).toContain('File written: hello.txt');
      expect(result.content).toContain('1 lines');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('hello.txt');
      expect(result.data.lineCount).toBe(1);
      const written = await fs.readFile(
        path.join(tmpDir, 'hello.txt'),
        'utf-8',
      );
      expect(written).toBe('hello world');
    });

    it('overwrites an existing file', async () => {
      const filePath = path.join(tmpDir, 'existing.txt');
      await fs.writeFile(filePath, 'old content');
      const stat = await fs.stat(filePath);
      context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

      const result = await writeFileTool.execute(
        {filePath: 'existing.txt', content: 'new content'},
        context,
      );

      expect(result.content).toContain('File written: existing.txt');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('existing.txt');
      expect(result.data.lineCount).toBe(1);
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('new content');
    });

    it('auto-creates parent directories', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'deep/nested/dir/file.txt', content: 'deep content'},
        context,
      );

      expect(result.content).toContain(
        'File written: deep/nested/dir/file.txt',
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('deep/nested/dir/file.txt');
      expect(result.data.lineCount).toBe(1);
      const written = await fs.readFile(
        path.join(tmpDir, 'deep/nested/dir/file.txt'),
        'utf-8',
      );
      expect(written).toBe('deep content');
    });

    it('counts lines correctly', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'multi.txt', content: 'line1\nline2\nline3'},
        context,
      );

      expect(result.content).toContain('3 lines');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.lineCount).toBe(3);
    });

    it('handles empty content', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'empty.txt', content: ''},
        context,
      );

      expect(result.content).toContain('File written: empty.txt');
      expect(result.content).toContain('0 lines');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('empty.txt');
      expect(result.data.lineCount).toBe(0);
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = path.join(tmpDir, 'abs.txt');
      const result = await writeFileTool.execute(
        {filePath: absPath, content: 'absolute'},
        context,
      );

      expect(result.content).toContain('File written:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBeTruthy();
      const written = await fs.readFile(absPath, 'utf-8');
      expect(written).toBe('absolute');
    });

    it('allows overwriting a file that was read first', async () => {
      const filePath = path.join(tmpDir, 'read-first.txt');
      await fs.writeFile(filePath, 'old');
      const stat = await fs.stat(filePath);
      context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);

      const result = await writeFileTool.execute(
        {filePath: 'read-first.txt', content: 'new'},
        context,
      );

      expect(result.content).toContain('File written:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBeTruthy();
    });
  });

  describe('error cases', () => {
    it('denies writing a new blocked path', async () => {
      const result = await writeFileTool.execute(
        {filePath: '.env.local', content: 'SECRET=value'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
      await expect(fs.stat(path.join(tmpDir, '.env.local'))).rejects.toThrow();
    });

    it('denies blocked paths before checking oversized content', async () => {
      const bigContent = 'x'.repeat(1_048_577);
      const result = await writeFileTool.execute(
        {filePath: '.env.local', content: bigContent},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
      expect(result.content).not.toContain('Content exceeds');
    });

    it('denies overwriting an existing blocked path', async () => {
      const filePath = path.join(tmpDir, '.env');
      await fs.writeFile(filePath, 'old');
      context.fileStatTracker.set(
        filePath,
        3,
        (await fs.stat(filePath)).mtimeMs,
      );

      const result = await writeFileTool.execute(
        {filePath: '.env', content: 'new'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
      await expect(fs.readFile(filePath, 'utf-8')).resolves.toBe('old');
    });

    it('denies new writes through a symlinked parent to a blocked real target', async () => {
      const realProject = path.join(tmpDir, 'real-project');
      const linkProject = path.join(tmpDir, 'link-project');
      await fs.mkdir(path.join(realProject, '.git'), {recursive: true});
      await fs.symlink(realProject, linkProject, 'dir');

      const result = await writeFileTool.execute(
        {filePath: 'link-project/.git/new-config', content: 'content'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
    });

    it('denies oversized writes through a symlinked parent before checking content size', async () => {
      const realProject = path.join(tmpDir, 'real-project');
      const linkProject = path.join(tmpDir, 'link-safe');
      const bigContent = 'x'.repeat(1_048_577);
      await fs.mkdir(path.join(realProject, '.git'), {recursive: true});
      await fs.symlink(path.join(realProject, '.git'), linkProject, 'dir');

      const result = await writeFileTool.execute(
        {filePath: 'link-safe/config', content: bigContent},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
      expect(result.content).not.toContain('Content exceeds');
    });

    it('returns a tool failure for allowed broken symlink paths', async () => {
      await fs.symlink(
        'missing-target.txt',
        path.join(tmpDir, 'broken-link.txt'),
      );

      const result = await writeFileTool.execute(
        {filePath: 'broken-link.txt', content: 'new'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Error:');
    });

    it('rejects content exceeding 1MB', async () => {
      const bigContent = 'x'.repeat(1_048_577);
      const result = await writeFileTool.execute(
        {filePath: 'big.txt', content: bigContent},
        context,
      );

      expect(result.content).toContain('Error: Content exceeds');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects overwriting a file that was not read', async () => {
      await fs.writeFile(path.join(tmpDir, 'unread.txt'), 'old');

      const result = await writeFileTool.execute(
        {filePath: 'unread.txt', content: 'new'},
        context,
      );

      expect(result.content).toContain(
        'Error: Read the file before modifying it',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects overwriting a file modified since last read', async () => {
      const filePath = path.join(tmpDir, 'stale.txt');
      await fs.writeFile(filePath, 'old');
      // Track with stale stat
      context.fileStatTracker.set(filePath, 0, 0);

      const result = await writeFileTool.execute(
        {filePath: 'stale.txt', content: 'new'},
        context,
      );

      expect(result.content).toContain(
        'Error: File has been modified since last read',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('allows creating a new file without prior read', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'brand-new.txt', content: 'fresh'},
        context,
      );

      expect(result.content).toContain('File written:');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.filePath).toBe('brand-new.txt');
    });

    it('rejects writing a previously read file that was deleted', async () => {
      const filePath = path.join(tmpDir, 'deleted.txt');
      await fs.writeFile(filePath, 'content');
      const stat = await fs.stat(filePath);
      context.fileStatTracker.set(filePath, stat.size, stat.mtimeMs);
      await fs.rm(filePath);

      const result = await writeFileTool.execute(
        {filePath: 'deleted.txt', content: 'new'},
        context,
      );

      expect(result.content).toContain(
        'Error: File has been deleted since last read',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });
});
