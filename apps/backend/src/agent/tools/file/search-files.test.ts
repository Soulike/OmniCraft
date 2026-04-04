import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {searchFile} from './search-files.js';

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
