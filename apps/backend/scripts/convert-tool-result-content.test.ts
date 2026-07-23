import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {logger} from '@/logger.js';

import {
  convertRoot,
  convertSnapshotJson,
} from './convert-tool-result-content.js';

describe('convertSnapshotJson', () => {
  it('wraps string tool-message content in a text block', () => {
    const {changed, value} = convertSnapshotJson({
      messages: [
        {role: 'user', content: 'hi'},
        {role: 'tool', callId: 'c1', status: 'success', content: 'done'},
      ],
    });
    expect(changed).toBe(true);
    expect((value as {messages: unknown[]}).messages[1]).toMatchObject({
      role: 'tool',
      content: [{type: 'text', text: 'done'}],
    });
  });

  it('is idempotent when content is already an array', () => {
    const input = {
      messages: [
        {
          role: 'tool',
          callId: 'c1',
          status: 'success',
          content: [{type: 'text', text: 'done'}],
        },
      ],
    };
    const {changed} = convertSnapshotJson(input);
    expect(changed).toBe(false);
  });

  it('leaves user/assistant messages untouched', () => {
    const {value} = convertSnapshotJson({
      messages: [
        {role: 'assistant', content: 'text', toolCalls: [], thinking: []},
      ],
    });
    expect((value as {messages: unknown[]}).messages[0]).toMatchObject({
      role: 'assistant',
      content: 'text',
    });
  });
});

describe('convertRoot', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir === undefined) return;
    await rm(tempDir, {recursive: true, force: true});
    tempDir = undefined;
    vi.restoreAllMocks();
  });

  it('rewrites string content on disk, skips corrupt JSON, and silently skips missing snapshots', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'convert-tool-result-'));

    const withStringContent = path.join(tempDir, 'session-with-string');
    const withCorruptJson = path.join(tempDir, 'session-with-corrupt-json');
    const withoutSnapshot = path.join(tempDir, 'session-without-snapshot');
    await mkdir(withStringContent, {recursive: true});
    await mkdir(withCorruptJson, {recursive: true});
    await mkdir(withoutSnapshot, {recursive: true});

    await writeFile(
      path.join(withStringContent, 'snapshot.json'),
      JSON.stringify({
        messages: [
          {role: 'tool', callId: 'c1', status: 'success', content: 'done'},
        ],
      }),
    );
    await writeFile(
      path.join(withCorruptJson, 'snapshot.json'),
      '{not valid json',
    );
    // withoutSnapshot intentionally has no snapshot.json file.

    const warnSpy = vi.spyOn(logger, 'warn');

    const count = await convertRoot(tempDir);

    expect(count).toBe(1);

    const converted = JSON.parse(
      await readFile(path.join(withStringContent, 'snapshot.json'), 'utf-8'),
    ) as {messages: unknown[]};
    expect(converted.messages[0]).toMatchObject({
      role: 'tool',
      content: [{type: 'text', text: 'done'}],
    });

    // Corrupt JSON is skipped, not thrown, and left on disk untouched.
    const stillCorrupt = await readFile(
      path.join(withCorruptJson, 'snapshot.json'),
      'utf-8',
    );
    expect(stillCorrupt).toBe('{not valid json');

    // Corrupt JSON is a genuine error and is still reported at warn level,
    // but the missing-snapshot session must not be.
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        snapshot: path.join(withCorruptJson, 'snapshot.json'),
      }),
      expect.any(String),
    );
    const withoutSnapshotPath = path.join(withoutSnapshot, 'snapshot.json');
    for (const call of warnSpy.mock.calls) {
      expect(call[0]).not.toMatchObject({snapshot: withoutSnapshotPath});
    }
  });
});
