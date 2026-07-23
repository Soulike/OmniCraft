import crypto from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it, vi} from 'vitest';

import {agentSnapshotSchema} from '@/agent-core/agent/index.js';
import {logger} from '@/logger.js';

import {
  convertRoot,
  convertSnapshotJson,
} from './convert-tool-result-content.js';

/**
 * A real, schema-valid `AgentSnapshot` (see `agentSnapshotSchema` /
 * `llmSessionSnapshotSchema`) except that the `role: 'tool'` message's
 * `content` is still the pre-migration string shape, which is what an
 * on-disk snapshot written before the `ToolResultBlock[]` breaking change
 * looks like. Note `messages` lives at `llmSession.messages`, not at the
 * snapshot's top level.
 */
function buildRawSnapshot(toolContent: unknown): unknown {
  return {
    id: crypto.randomUUID(),
    title: 'test session',
    sseEventCount: 0,
    llmSession: {
      id: 'llm-session-1',
      messages: [
        {id: 'm1', createdAt: 0, role: 'user', content: 'hello'},
        {
          id: 'm2',
          createdAt: 1,
          role: 'assistant',
          content: '',
          toolCalls: [{callId: 'c1', toolName: 'read_file', arguments: '{}'}],
          thinking: [],
        },
        {
          id: 'm3',
          createdAt: 2,
          role: 'tool',
          callId: 'c1',
          status: 'success',
          content: toolContent,
        },
      ],
      compactions: [],
      latestUsageInputMessageCount: null,
      usage: {
        currentContextInputTokens: 0,
        latestCallOutputTokens: 0,
        sessionInputTokens: 0,
        sessionOutputTokens: 0,
        sessionCacheReadInputTokens: 0,
      },
    },
    options: {},
  };
}

interface SnapshotShape {
  llmSession: {messages: {role: string; content: unknown}[]};
}

describe('convertSnapshotJson', () => {
  it('wraps string tool-message content (at llmSession.messages) in a text block', () => {
    const raw = buildRawSnapshot('done');

    // The raw, pre-migration snapshot does not validate: llmToolResultMessageSchema
    // requires `content: ToolResultBlock[]`, not a string.
    expect(agentSnapshotSchema.safeParse(raw).success).toBe(false);

    const {changed, value} = convertSnapshotJson(raw);

    expect(changed).toBe(true);
    const converted = value as SnapshotShape;
    expect(converted.llmSession.messages[2]).toMatchObject({
      role: 'tool',
      content: [{type: 'text', text: 'done'}],
    });

    // The whole point of the fix: the converted snapshot now parses as a
    // real AgentSnapshot. Against the old (buggy) implementation, which
    // inspected `json.messages` at the top level, `changed` would be false
    // here (there is no top-level `messages` key) and this `.parse()` would
    // throw, because the tool message's `content` would still be a string.
    expect(() => agentSnapshotSchema.parse(converted)).not.toThrow();
  });

  it('is idempotent when content is already an array', () => {
    const raw = buildRawSnapshot([{type: 'text', text: 'done'}]);
    expect(agentSnapshotSchema.safeParse(raw).success).toBe(true);

    const {changed, value} = convertSnapshotJson(raw);

    expect(changed).toBe(false);
    expect(value).toBe(raw);
  });

  it('leaves user/assistant messages untouched', () => {
    const raw = buildRawSnapshot([{type: 'text', text: 'done'}]);
    const {value} = convertSnapshotJson(raw);
    const converted = value as SnapshotShape;

    expect(converted.llmSession.messages[0]).toMatchObject({
      role: 'user',
      content: 'hello',
    });
    expect(converted.llmSession.messages[1]).toMatchObject({
      role: 'assistant',
      content: '',
    });
  });

  it('leaves a snapshot with no llmSession unchanged', () => {
    const raw = {id: crypto.randomUUID(), title: 't'};
    const {changed, value} = convertSnapshotJson(raw);
    expect(changed).toBe(false);
    expect(value).toBe(raw);
  });

  it('leaves a snapshot whose llmSession.messages is missing or not an array unchanged', () => {
    const noMessages = convertSnapshotJson({llmSession: {}});
    expect(noMessages.changed).toBe(false);

    const nonArrayMessages = convertSnapshotJson({
      llmSession: {messages: 'not-an-array'},
    });
    expect(nonArrayMessages.changed).toBe(false);
  });

  it('leaves non-object input unchanged', () => {
    expect(convertSnapshotJson(null)).toEqual({changed: false, value: null});
    expect(convertSnapshotJson('str')).toEqual({
      changed: false,
      value: 'str',
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

    const rawSnapshot = buildRawSnapshot('done');
    await writeFile(
      path.join(withStringContent, 'snapshot.json'),
      JSON.stringify(rawSnapshot),
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
    ) as SnapshotShape;
    expect(converted.llmSession.messages[2]).toMatchObject({
      role: 'tool',
      content: [{type: 'text', text: 'done'}],
    });
    // The on-disk result is a real, schema-valid AgentSnapshot.
    expect(() => agentSnapshotSchema.parse(converted)).not.toThrow();

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
