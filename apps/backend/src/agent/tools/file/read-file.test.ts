import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {readFileTool} from './read-file.js';

describe('readFileTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'rft-test-'));
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
    expect(readFileTool.name).toBe('read_file');
  });

  describe('success cases', () => {
    it('reads a full file with line numbers and header', async () => {
      await writeFile('hello.txt', 'line1\nline2\nline3');
      const result = await readFileTool.execute(
        {filePath: 'hello.txt'},
        context,
      );

      expect(result).toContain('File: hello.txt (3 lines)');
      expect(result).toContain('1\tline1');
      expect(result).toContain('2\tline2');
      expect(result).toContain('3\tline3');
    });

    it('reads partial file with startLine', async () => {
      await writeFile('lines.txt', 'a\nb\nc\nd\ne');
      const result = await readFileTool.execute(
        {filePath: 'lines.txt', startLine: 3},
        context,
      );

      expect(result).toContain('(5 lines, showing lines 3-5)');
      expect(result).toContain('3\tc');
      expect(result).toContain('5\te');
      expect(result).not.toContain('1\ta');
    });

    it('reads partial file with startLine and lineCount', async () => {
      await writeFile('lines.txt', 'a\nb\nc\nd\ne');
      const result = await readFileTool.execute(
        {filePath: 'lines.txt', startLine: 2, lineCount: 2},
        context,
      );

      expect(result).toContain('(5 lines, showing lines 2-3)');
      expect(result).toContain('2\tb');
      expect(result).toContain('3\tc');
      expect(result).not.toContain('4\td');
    });

    it('resolves relative paths against workingDirectory', async () => {
      await writeFile('sub/file.txt', 'content');
      const result = await readFileTool.execute(
        {filePath: 'sub/file.txt'},
        context,
      );

      expect(result).toContain('File: sub/file.txt');
      expect(result).toContain('content');
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = await writeFile('abs.txt', 'data');
      const result = await readFileTool.execute({filePath: absPath}, context);

      expect(result).toContain('data');
    });

    it('right-aligns line numbers', async () => {
      const lines = Array.from({length: 100}, (_, i) => `line${i + 1}`).join(
        '\n',
      );
      await writeFile('hundred.txt', lines);
      const result = await readFileTool.execute(
        {filePath: 'hundred.txt', startLine: 1, lineCount: 2},
        context,
      );

      expect(result).toContain('  1\tline1');
      expect(result).toContain('  2\tline2');
    });
    it('handles empty file', async () => {
      await writeFile('empty.txt', '');
      const result = await readFileTool.execute(
        {filePath: 'empty.txt'},
        context,
      );

      expect(result).toContain('File: empty.txt (0 lines)');
    });

    it('returns empty content when startLine exceeds total lines', async () => {
      await writeFile('short.txt', 'a\nb\nc');
      const result = await readFileTool.execute(
        {filePath: 'short.txt', startLine: 100},
        context,
      );

      expect(result).toContain('(3 lines, showing lines 100-3)');
    });
  });

  describe('error cases', () => {
    it('rejects paths outside workingDirectory', async () => {
      const result = await readFileTool.execute(
        {filePath: '/etc/passwd'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('rejects path traversal attacks', async () => {
      const result = await readFileTool.execute(
        {filePath: '../../../etc/passwd'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent file', async () => {
      const result = await readFileTool.execute(
        {filePath: 'nope.txt'},
        context,
      );

      expect(result).toContain('Error: File not found');
    });

    it('returns error for directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'adir'));
      const result = await readFileTool.execute({filePath: 'adir'}, context);

      expect(result).toContain('Error: Not a file');
    });

    it('returns error for binary files', async () => {
      const binaryContent = Buffer.alloc(100);
      binaryContent[50] = 0x00; // null byte
      binaryContent.fill(0x41, 0, 50); // 'A' before null
      await fs.writeFile(path.join(tmpDir, 'binary.bin'), binaryContent);

      const result = await readFileTool.execute(
        {filePath: 'binary.bin'},
        context,
      );

      expect(result).toContain('Error: Binary file detected');
    });

    it('returns error when result exceeds 32KB', async () => {
      const longLine = 'x'.repeat(500);
      const lines = Array.from({length: 200}, () => longLine).join('\n');
      await writeFile('huge.txt', lines);

      const result = await readFileTool.execute(
        {filePath: 'huge.txt'},
        context,
      );

      expect(result).toContain('Error: Read result exceeds');
      expect(result).toContain('byte limit');
      expect(result).toContain('Use startLine and lineCount');
    });
  });
});
