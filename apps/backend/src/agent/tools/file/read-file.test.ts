import assert from 'node:assert';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/state/file-content-cache.js';
import {toolResultBlocksToText} from '@/agent-core/llm-api/helpers/tool-result-blocks-to-text.js';
import {MAX_INLINE_MEDIA_BYTES} from '@/agent-core/tool/media-guard.js';
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

      expect(toolResultBlocksToText(result.content)).toContain(
        'File: hello.txt (3 lines)',
      );
      expect(toolResultBlocksToText(result.content)).toContain('1\tline1');
      expect(toolResultBlocksToText(result.content)).toContain('2\tline2');
      expect(toolResultBlocksToText(result.content)).toContain('3\tline3');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.filePath).toBe('hello.txt');
      expect(result.data.totalLines).toBe(3);
      expect(result.data.startLine).toBe(1);
      expect(result.data.endLine).toBe(3);
      expect(result.data.content).toBeTruthy();
    });

    it('reads partial file with startLine', async () => {
      await writeFile('lines.txt', 'a\nb\nc\nd\ne');
      const result = await readFileTool.execute(
        {filePath: 'lines.txt', startLine: 3},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        '(5 lines, showing lines 3-5)',
      );
      expect(toolResultBlocksToText(result.content)).toContain('3\tc');
      expect(toolResultBlocksToText(result.content)).toContain('5\te');
      expect(toolResultBlocksToText(result.content)).not.toContain('1\ta');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.totalLines).toBe(5);
      expect(result.data.startLine).toBe(3);
      expect(result.data.endLine).toBe(5);
    });

    it('reads partial file with startLine and lineCount', async () => {
      await writeFile('lines.txt', 'a\nb\nc\nd\ne');
      const result = await readFileTool.execute(
        {filePath: 'lines.txt', startLine: 2, lineCount: 2},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        '(5 lines, showing lines 2-3)',
      );
      expect(toolResultBlocksToText(result.content)).toContain('2\tb');
      expect(toolResultBlocksToText(result.content)).toContain('3\tc');
      expect(toolResultBlocksToText(result.content)).not.toContain('4\td');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.totalLines).toBe(5);
      expect(result.data.startLine).toBe(2);
      expect(result.data.endLine).toBe(3);
    });

    it('resolves relative paths against workingDirectory', async () => {
      await writeFile('sub/file.txt', 'content');
      const result = await readFileTool.execute(
        {filePath: 'sub/file.txt'},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        'File: sub/file.txt',
      );
      expect(toolResultBlocksToText(result.content)).toContain('content');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.filePath).toContain('sub/file.txt');
      expect(result.data.content).toBeTruthy();
    });

    it('accepts absolute paths within workingDirectory', async () => {
      const absPath = await writeFile('abs.txt', 'data');
      const result = await readFileTool.execute({filePath: absPath}, context);

      expect(toolResultBlocksToText(result.content)).toContain('data');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.filePath).toBeTruthy();
      expect(result.data.content).toBeTruthy();
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

      expect(toolResultBlocksToText(result.content)).toContain('  1\tline1');
      expect(toolResultBlocksToText(result.content)).toContain('  2\tline2');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.totalLines).toBe(100);
      expect(result.data.startLine).toBe(1);
      expect(result.data.endLine).toBe(2);
    });
    it('handles empty file', async () => {
      await writeFile('empty.txt', '');
      const result = await readFileTool.execute(
        {filePath: 'empty.txt'},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        'File: empty.txt (0 lines)',
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.totalLines).toBe(0);
    });

    it('returns empty content when startLine exceeds total lines', async () => {
      await writeFile('short.txt', 'a\nb\nc');
      const result = await readFileTool.execute(
        {filePath: 'short.txt', startLine: 100},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        '(3 lines, showing lines 100-3)',
      );
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      assert(result.data.kind === 'text');
      expect(result.data.totalLines).toBe(3);
      expect(result.data.startLine).toBe(100);
      expect(result.data.endLine).toBe(3);
    });

    it('tracks file stat after successful read', async () => {
      await writeFile('tracked.txt', 'content');
      const stat = await fs.stat(path.join(tmpDir, 'tracked.txt'));

      await readFileTool.execute({filePath: 'tracked.txt'}, context);

      const checkResult = context.fileStatTracker.canModify(
        path.join(tmpDir, 'tracked.txt'),
        stat.size,
        stat.mtimeMs,
      );
      expect(checkResult).toBe('ok');
    });

    it('returns an image file as an image block with a media result', async () => {
      // 1x1 transparent PNG
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const png = Buffer.from(pngBase64, 'base64');
      await fs.writeFile(path.join(tmpDir, 'pixel.png'), png);

      const result = await readFileTool.execute(
        {filePath: 'pixel.png'},
        context,
      );

      expect(result.status).toBe('success');
      expect(result.content).toEqual([
        {type: 'image', mediaType: 'image/png', data: pngBase64},
      ]);
      expect(result.data).toEqual({
        kind: 'image',
        filePath: 'pixel.png',
        mediaType: 'image/png',
        byteSize: png.length,
      });
    });
  });

  describe('error cases', () => {
    it('rejects an oversized media file instead of inlining it', async () => {
      // A real PNG signature followed by padding so file-type sniffing still
      // detects it as image/png, while the on-disk size exceeds the inline cap.
      const pngBase64 =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const pngHeader = Buffer.from(pngBase64, 'base64');
      const oversized = Buffer.concat([
        pngHeader,
        Buffer.alloc(MAX_INLINE_MEDIA_BYTES - pngHeader.length + 1),
      ]);
      await fs.writeFile(path.join(tmpDir, 'huge.png'), oversized);

      const result = await readFileTool.execute(
        {filePath: 'huge.png'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toContain('over the');
      expect(result.data.message).toContain('MB inline limit for media');
      expect(toolResultBlocksToText(result.content)).toContain('Error:');
      // No base64 media payload leaks into the failure result: content is a
      // single text block, not an image/document block carrying `data`.
      expect(result.content).toHaveLength(1);
      expect(result.content[0]?.type).toBe('text');
      expect(JSON.stringify(result.content)).not.toContain(pngBase64);
    });

    it('returns error for nonexistent file', async () => {
      const result = await readFileTool.execute(
        {filePath: 'nope.txt'},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        'Error: File not found',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error for directories', async () => {
      await fs.mkdir(path.join(tmpDir, 'adir'));
      const result = await readFileTool.execute({filePath: 'adir'}, context);

      expect(toolResultBlocksToText(result.content)).toContain(
        'Error: Not a file',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
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

      expect(toolResultBlocksToText(result.content)).toContain(
        'Error: Binary file detected',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error when result exceeds 32KB', async () => {
      const longLine = 'x'.repeat(500);
      const lines = Array.from({length: 200}, () => longLine).join('\n');
      await writeFile('huge.txt', lines);

      const result = await readFileTool.execute(
        {filePath: 'huge.txt'},
        context,
      );

      expect(toolResultBlocksToText(result.content)).toContain(
        'Error: Read result exceeds',
      );
      expect(toolResultBlocksToText(result.content)).toContain('byte limit');
      expect(toolResultBlocksToText(result.content)).toContain(
        'Use startLine and lineCount',
      );
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });
});
