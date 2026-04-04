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

      expect(result).toContain('File written: hello.txt');
      expect(result).toContain('1 lines');
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

      expect(result).toContain('File written: existing.txt');
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('new content');
    });

    it('auto-creates parent directories', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'deep/nested/dir/file.txt', content: 'deep content'},
        context,
      );

      expect(result).toContain('File written: deep/nested/dir/file.txt');
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

      expect(result).toContain('3 lines');
    });

    it('handles empty content', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'empty.txt', content: ''},
        context,
      );

      expect(result).toContain('File written: empty.txt');
      expect(result).toContain('0 lines');
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = path.join(tmpDir, 'abs.txt');
      const result = await writeFileTool.execute(
        {filePath: absPath, content: 'absolute'},
        context,
      );

      expect(result).toContain('File written:');
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

      expect(result).toContain('File written:');
    });
  });

  describe('extraAllowedPaths', () => {
    let extraDir: string;

    beforeEach(async () => {
      extraDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wft-extra-'));
    });

    afterEach(async () => {
      await fs.rm(extraDir, {recursive: true, force: true});
    });

    it('allows writing in a read-write extra path', async () => {
      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read-write'}],
      });

      const filePath = path.join(extraDir, 'extra.txt');
      const result = await writeFileTool.execute(
        {filePath, content: 'extra content'},
        extraContext,
      );

      expect(result).toContain('File written:');
      const written = await fs.readFile(filePath, 'utf-8');
      expect(written).toBe('extra content');
    });

    it('rejects writing in a read-only extra path', async () => {
      const extraContext = createMockContext({
        workingDirectory: tmpDir,
        fileCache: new FileContentCache(),
        extraAllowedPaths: [{path: extraDir, mode: 'read'}],
      });

      const filePath = path.join(extraDir, 'readonly.txt');
      const result = await writeFileTool.execute(
        {filePath, content: 'should fail'},
        extraContext,
      );

      expect(result).toContain('Error: Access denied: path is read-only');
    });
  });

  describe('error cases', () => {
    it('rejects paths outside workingDirectory', async () => {
      const result = await writeFileTool.execute(
        {filePath: '/etc/evil.txt', content: 'hack'},
        context,
      );

      expect(result).toContain(
        'Error: Access denied: path is outside the allowed directories',
      );
    });

    it('rejects path traversal attacks', async () => {
      const result = await writeFileTool.execute(
        {filePath: '../../../etc/evil.txt', content: 'hack'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('rejects content exceeding 1MB', async () => {
      const bigContent = 'x'.repeat(1_048_577);
      const result = await writeFileTool.execute(
        {filePath: 'big.txt', content: bigContent},
        context,
      );

      expect(result).toContain('Error: Content exceeds');
    });

    it('rejects overwriting a file that was not read', async () => {
      await fs.writeFile(path.join(tmpDir, 'unread.txt'), 'old');

      const result = await writeFileTool.execute(
        {filePath: 'unread.txt', content: 'new'},
        context,
      );

      expect(result).toContain('Error: Read the file before modifying it');
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

      expect(result).toContain('Error: File has been modified since last read');
    });

    it('allows creating a new file without prior read', async () => {
      const result = await writeFileTool.execute(
        {filePath: 'brand-new.txt', content: 'fresh'},
        context,
      );

      expect(result).toContain('File written:');
    });
  });
});
