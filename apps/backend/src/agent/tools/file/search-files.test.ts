import assert from 'node:assert';
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

      expect(result.content).toContain('Found 2 matches');
      expect(result.content).toContain('a.ts:1: import foo');
      expect(result.content).toContain('b.ts:1: import baz');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.pattern).toBe('import');
      expect(result.data.matches).toHaveLength(2);
      expect(result.data.truncated).toBe(false);
    });

    it('filters by filePattern', async () => {
      await writeFile('a.ts', 'hello world\n');
      await writeFile('b.js', 'hello world\n');

      const result = await searchFilesTool.execute(
        {pattern: 'hello', filePattern: '**/*.ts'},
        context,
      );

      expect(result.content).toContain('a.ts');
      expect(result.content).not.toContain('b.js');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches).toHaveLength(1);
    });

    it('searches within a custom path', async () => {
      await writeFile('src/a.ts', 'target\n');
      await writeFile('lib/b.ts', 'target\n');

      const result = await searchFilesTool.execute(
        {pattern: 'target', path: 'src'},
        context,
      );

      expect(result.content).toContain('a.ts');
      expect(result.content).not.toContain('b.ts');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches).toHaveLength(1);
    });

    it('returns no-match message when nothing found', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute({pattern: 'xyz'}, context);

      expect(result.content).toContain('No matches found');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches).toHaveLength(0);
      expect(result.data.truncated).toBe(false);
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

      expect(result.content).toContain('text.ts');
      expect(result.content).not.toContain('binary.bin');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches).toHaveLength(1);
    });

    it('sorts results by file path', async () => {
      await writeFile('c.ts', 'match\n');
      await writeFile('a.ts', 'match\n');
      await writeFile('b.ts', 'match\n');

      const result = await searchFilesTool.execute({pattern: 'match'}, context);

      const lines = result.content.split('\n').filter((l) => /:\d+:/.test(l));
      expect(lines[0]).toContain('a.ts');
      expect(lines[1]).toContain('b.ts');
      expect(lines[2]).toContain('c.ts');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches[0].file).toContain('a.ts');
      expect(result.data.matches[1].file).toContain('b.ts');
      expect(result.data.matches[2].file).toContain('c.ts');
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

      expect(result.content).toContain('100+');
      expect(result.content).toContain('showing first 100');
      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches).toHaveLength(100);
      expect(result.data.truncated).toBe(true);
    });

    it('skips blocked paths and appends the policy note', async () => {
      await writeFile('src/app.ts', 'target\n');
      await writeFile('.env', 'target\n');
      await writeFile('.git/config', 'target\n');

      const result = await searchFilesTool.execute(
        {pattern: 'target'},
        context,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.content).toContain('src/app.ts:1: target');
      expect(result.content).not.toContain('.env');
      expect(result.content).not.toContain('.git/config');
      expect(result.content).toContain(
        'Some paths were skipped because they are blocked by file access policy',
      );
      expect(result.data.matches.map((m) => m.file)).toEqual(['src/app.ts']);
    });

    it('skips symlinked files', async () => {
      const target = await writeFile('target.ts', 'target\n');
      await fs.symlink(target, path.join(tmpDir, 'link.ts'));

      const result = await searchFilesTool.execute(
        {pattern: 'target'},
        context,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches.map((m) => m.file)).toEqual(['target.ts']);
      expect(result.content).toContain(
        'Some paths were skipped because they are blocked by file access policy',
      );
    });

    it('skips explicit traversal through symlinked directories', async () => {
      await writeFile('real-project/.git/config', 'target\n');
      await fs.symlink(
        path.join(tmpDir, 'real-project', '.git'),
        path.join(tmpDir, 'safe-link'),
        'dir',
      );

      const result = await searchFilesTool.execute(
        {pattern: 'target', filePattern: 'safe-link/**'},
        context,
      );

      expect(result.status).toBe('success');
      assert(result.status === 'success');
      expect(result.data.matches).toHaveLength(0);
      expect(result.content).not.toContain('safe-link/config');
      expect(result.content).not.toContain('target');
      expect(result.content).toContain(
        'Some paths were skipped because they are blocked by file access policy',
      );
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

      expect(result.content).toContain('timed out after 30s');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });

  describe('error cases', () => {
    it('returns error for nonexistent directory', async () => {
      const result = await searchFilesTool.execute(
        {pattern: 'test', path: 'nonexistent'},
        context,
      );

      expect(result.content).toContain('Error: Directory not found');
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

      const result = await searchFilesTool.execute(
        {pattern: 'anything', path: 'git-link'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
    });

    it('denies a symlinked search root whose target is allowed', async () => {
      await writeFile('real-src/file.ts', 'target\n');
      await fs.symlink(
        path.join(tmpDir, 'real-src'),
        path.join(tmpDir, 'src-link'),
        'dir',
      );

      const result = await searchFilesTool.execute(
        {pattern: 'target', path: 'src-link'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
    });

    it('denies a search root below a symlinked directory', async () => {
      await writeFile('real-src/subdir/file.ts', 'target\n');
      await fs.symlink(
        path.join(tmpDir, 'real-src'),
        path.join(tmpDir, 'src-link'),
        'dir',
      );

      const result = await searchFilesTool.execute(
        {pattern: 'target', path: 'src-link/subdir'},
        context,
      );

      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.content).toContain('Access denied by file access policy');
    });

    it('returns error for invalid regex', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute({pattern: 'a**'}, context);

      expect(result.content).toContain('Error: Invalid regex pattern');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('rejects unsafe regex patterns', async () => {
      await writeFile('a.ts', 'hello\n');

      const result = await searchFilesTool.execute(
        {pattern: '(a+)+$'},
        context,
      );

      expect(result.content).toContain('Error: Regex pattern rejected');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });

    it('returns error when path is a file', async () => {
      await writeFile('afile.txt', 'content');

      const result = await searchFilesTool.execute(
        {pattern: 'test', path: 'afile.txt'},
        context,
      );

      expect(result.content).toContain('Error: Not a directory');
      expect(result.status).toBe('failure');
      assert(result.status === 'failure');
      expect(result.data.message).toBeTruthy();
    });
  });
});
