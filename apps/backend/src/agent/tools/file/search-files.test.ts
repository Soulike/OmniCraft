import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {FileContentCache} from '@/agent-core/agent/index.js';
import {createMockContext} from '@/agent-core/tool/testing.js';
import type {ToolExecutionContext} from '@/agent-core/tool/types.js';

import {searchFile, searchFilesTool} from './search-files.js';

describe('searchFile', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sf-test-'));
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

  it('finds matching lines with line numbers', async () => {
    const filePath = await writeFile('test.ts', 'foo\nbar\nbaz\nfoo bar\n');

    const matches = await searchFile(filePath, /foo/, 100);

    expect(matches).toEqual([
      {line: 1, content: 'foo'},
      {line: 4, content: 'foo bar'},
    ]);
  });

  it('returns empty array when no matches', async () => {
    const filePath = await writeFile('test.ts', 'hello\nworld\n');

    const matches = await searchFile(filePath, /xyz/, 100);

    expect(matches).toEqual([]);
  });

  it('respects maxMatches limit', async () => {
    const filePath = await writeFile(
      'test.ts',
      'match1\nmatch2\nmatch3\nmatch4\nmatch5\n',
    );

    const matches = await searchFile(filePath, /match/, 3);

    expect(matches).toHaveLength(3);
    expect(matches[0]).toEqual({line: 1, content: 'match1'});
    expect(matches[2]).toEqual({line: 3, content: 'match3'});
  });

  it('stops reading when AbortSignal fires', async () => {
    const lines = Array.from({length: 1000}, (_, i) => `line${i}`).join('\n');
    const filePath = await writeFile('big.ts', lines);

    const controller = new AbortController();
    controller.abort();

    const matches = await searchFile(filePath, /line/, 100, controller.signal);

    expect(matches.length).toBeLessThan(1000);
  });

  it('supports regex special characters', async () => {
    const filePath = await writeFile('test.ts', 'foo(bar)\nfoo[baz]\nplain\n');

    const matches = await searchFile(filePath, /foo\(bar\)/, 100);

    expect(matches).toEqual([{line: 1, content: 'foo(bar)'}]);
  });

  it('handles empty file', async () => {
    const filePath = await writeFile('empty.ts', '');

    const matches = await searchFile(filePath, /anything/, 100);

    expect(matches).toEqual([]);
  });
});

describe('searchFilesTool', () => {
  let tmpDir: string;
  let context: ToolExecutionContext;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sft-test-'));
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
    expect(searchFilesTool.name).toBe('search_files');
  });

  describe('success cases', () => {
    it('finds matches across multiple files', async () => {
      await writeFile('a.ts', 'import foo\nexport bar\n');
      await writeFile('b.ts', 'import baz\nconst x = 1\n');

      const result = await searchFilesTool.execute(
        {pattern: 'import'},
        context,
      );

      expect(result).toContain('Found 2 matches');
      expect(result).toContain('a.ts:1: import foo');
      expect(result).toContain('b.ts:1: import baz');
    });

    it('filters by filePattern', async () => {
      await writeFile('a.ts', 'hello world\n');
      await writeFile('b.js', 'hello world\n');

      const result = await searchFilesTool.execute(
        {pattern: 'hello', filePattern: '**/*.ts'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.js');
    });

    it('searches within a custom path', async () => {
      await writeFile('src/a.ts', 'target\n');
      await writeFile('lib/b.ts', 'target\n');

      const result = await searchFilesTool.execute(
        {pattern: 'target', path: 'src'},
        context,
      );

      expect(result).toContain('a.ts');
      expect(result).not.toContain('b.ts');
    });

    it('returns no-match message when nothing found', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute({pattern: 'xyz'}, context);

      expect(result).toContain('No matches found');
    });

    it('skips binary files', async () => {
      await writeFile('text.ts', 'A match\n');
      const binaryPath = path.join(tmpDir, 'binary.bin');
      const buf = Buffer.alloc(100);
      buf.fill(0x41, 0, 50);
      buf[50] = 0x00;
      buf.fill(0x41, 51);
      await fs.writeFile(binaryPath, buf);

      const result = await searchFilesTool.execute({pattern: 'A'}, context);

      expect(result).toContain('text.ts');
      expect(result).not.toContain('binary.bin');
    });

    it('sorts results by file path', async () => {
      await writeFile('c.ts', 'match\n');
      await writeFile('a.ts', 'match\n');
      await writeFile('b.ts', 'match\n');

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      const lines = result.split('\n').filter((l) => /:\d+:/.test(l));
      expect(lines[0]).toContain('a.ts');
      expect(lines[1]).toContain('b.ts');
      expect(lines[2]).toContain('c.ts');
    });

    it('truncates at 100 matches', async () => {
      const content = Array.from({length: 20}, (_, i) => `match${i}`).join(
        '\n',
      );
      const writes = Array.from({length: 10}, (_, i) =>
        writeFile(`file${i}.ts`, content),
      );
      await Promise.all(writes);

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      expect(result).toContain('100+');
      expect(result).toContain('showing first 100');
    });

    it('returns partial results on timeout', async () => {
      await writeFile('a.ts', 'match\n');

      let callCount = 0;
      vi.spyOn(Date, 'now').mockImplementation(() => {
        callCount++;
        if (callCount <= 1) return 0;
        return 31_000;
      });

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      vi.restoreAllMocks();

      expect(result).toContain('timed out after 30s');
    });
  });

  describe('error cases', () => {
    it('rejects path outside workingDirectory', async () => {
      const result = await searchFilesTool.execute(
        {pattern: 'test', path: '/etc'},
        context,
      );

      expect(result).toContain('Error: Access denied');
    });

    it('returns error for nonexistent directory', async () => {
      const result = await searchFilesTool.execute(
        {pattern: 'test', path: 'nonexistent'},
        context,
      );

      expect(result).toContain('Error: Directory not found');
    });

    it('returns error for invalid regex', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute(
        {pattern: '[invalid'},
        context,
      );

      expect(result).toContain('Error: Invalid regex pattern');
    });

    it('returns error when path is a file', async () => {
      await writeFile('afile.txt', 'content');

      const result = await searchFilesTool.execute(
        {pattern: 'test', path: 'afile.txt'},
        context,
      );

      expect(result).toContain('Error: Not a directory');
    });
  });
});
