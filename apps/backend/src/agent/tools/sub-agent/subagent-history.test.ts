import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  agentPersistence,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';

import {
  copySubagentSseEvents,
  createResumedSubagentSnapshot,
  loadSubagentMetadata,
  persistSubagentMetadata,
  prepareResumedSubagentState,
  subagentMetadataPath,
} from './subagent-history.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';

function emptyUsage() {
  return {
    currentContextInputTokens: 0,
    latestCallOutputTokens: 0,
    sessionInputTokens: 0,
    sessionOutputTokens: 0,
    sessionCacheReadInputTokens: 0,
  };
}

describe('subagent history metadata helpers', () => {
  let tmpDir: string;

  function createSnapshot(id: string, sseEventCount: number): AgentSnapshot {
    return {
      id,
      title: 'Source Subagent',
      sseEventCount,
      llmSession: {
        id: `${id}-llm`,
        messages: [
          {
            id: `${id}-message`,
            createdAt: 1,
            role: 'user',
            content: 'original task',
          },
        ],
        compactions: [],
        usageBaselineMessageCount: null,
        usage: emptyUsage(),
      },
      options: {workingDirectory: tmpDir, thinkingLevel: 'none'},
    };
  }

  async function writeEvents(
    sessionsDir: string,
    id: string,
    events: SseEvent[],
  ): Promise<void> {
    const filePath = agentPersistence.eventsPath(sessionsDir, id);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(
      filePath,
      events.map((event) => JSON.stringify(event) + '\n').join(''),
    );
  }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'subagent-history-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('computes the subagent sidecar metadata path', () => {
    expect(subagentMetadataPath(tmpDir, 'subagent-1')).toBe(
      path.join(tmpDir, 'subagent-1', 'subagent.json'),
    );
  });

  it.each([
    '',
    '.',
    '..',
    '../escape',
    '/tmp/escape',
    'nested/id',
    'nested\\id',
  ])('rejects unsafe subagent id %j', (subagentId) => {
    expect(() => subagentMetadataPath(tmpDir, subagentId)).toThrow(
      'Invalid subagent id',
    );
  });

  it('persists and loads subagent sidecar metadata', async () => {
    await persistSubagentMetadata(tmpDir, 'subagent-1', {
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 123,
    });

    await expect(
      fs.readFile(path.join(tmpDir, 'subagent-1', 'subagent.json'), 'utf-8'),
    ).resolves.toContain('"agentType": "explore"');

    await expect(loadSubagentMetadata(tmpDir, 'subagent-1')).resolves.toEqual({
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 123,
    });
  });

  it('rejects sidecar metadata whose id does not match the requested subagent', async () => {
    const metadataPath = subagentMetadataPath(tmpDir, 'subagent-2');
    await fs.mkdir(path.dirname(metadataPath), {recursive: true});
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        schemaVersion: 1,
        id: 'subagent-1',
        agentType: SUB_AGENT_TYPE.GENERAL,
        createdAt: 123,
      }),
    );

    await expect(loadSubagentMetadata(tmpDir, 'subagent-2')).rejects.toThrow(
      'Subagent metadata id mismatch: expected subagent-2, got subagent-1',
    );
  });

  it('creates a resumed snapshot with new agent and llm session ids', () => {
    const source = createSnapshot('source-id', 0);

    const resumed = createResumedSubagentSnapshot(
      source,
      'target-id',
      'target-llm-id',
    );

    expect(resumed).toMatchObject({
      ...source,
      id: 'target-id',
      llmSession: {
        ...source.llmSession,
        id: 'target-llm-id',
        messages: source.llmSession.messages,
      },
    });
    expect(resumed.sseEventCount).toBe(source.sseEventCount);
  });

  it('copies exactly the source snapshot sse event count', async () => {
    const source = createSnapshot('source-id', 2);
    await writeEvents(tmpDir, source.id, [
      {
        type: 'message-start',
        role: 'assistant',
        messageId: 'm1',
        createdAt: 1,
        content: '',
      },
      {type: 'text-delta', content: 'hello'},
      {type: 'text-delta', content: 'ignored-extra'},
    ]);

    await copySubagentSseEvents({
      sourceSessionsDir: tmpDir,
      sourceSnapshot: source,
      targetSessionsDir: tmpDir,
      targetId: 'target-id',
    });

    const copied = await fs.readFile(
      agentPersistence.eventsPath(tmpDir, 'target-id'),
      'utf-8',
    );
    expect(copied.trimEnd().split('\n')).toHaveLength(2);
    expect(copied).toContain('"message-start"');
    expect(copied).toContain('hello');
    expect(copied).not.toContain('ignored-extra');
  });

  it('fails when source event log has fewer valid events than the snapshot count', async () => {
    const source = createSnapshot('source-id', 2);
    await writeEvents(tmpDir, source.id, [
      {type: 'text-delta', content: 'only one'},
    ]);

    await expect(
      copySubagentSseEvents({
        sourceSessionsDir: tmpDir,
        sourceSnapshot: source,
        targetSessionsDir: tmpDir,
        targetId: 'target-id',
      }),
    ).rejects.toThrow('expected 2 SSE events');
  });

  it('fails when source event log is missing before the snapshot count is copied', async () => {
    const source = createSnapshot('source-id', 1);

    await expect(
      copySubagentSseEvents({
        sourceSessionsDir: tmpDir,
        sourceSnapshot: source,
        targetSessionsDir: tmpDir,
        targetId: 'target-id',
      }),
    ).rejects.toThrow('source event log is missing');
  });

  it('fails when source event log is corrupted before the snapshot count is copied', async () => {
    const source = createSnapshot('source-id', 2);
    const filePath = agentPersistence.eventsPath(tmpDir, source.id);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(
      filePath,
      JSON.stringify({type: 'text-delta', content: 'valid'}) + '\nnot-json\n',
    );

    await expect(
      copySubagentSseEvents({
        sourceSessionsDir: tmpDir,
        sourceSnapshot: source,
        targetSessionsDir: tmpDir,
        targetId: 'target-id',
      }),
    ).rejects.toThrow('expected 2 SSE events but copied 1');
  });

  it('prepares a resumed persisted subagent state', async () => {
    const source = createSnapshot('source-id', 1);
    await agentPersistence.persistSnapshot(tmpDir, source.id, source);
    await persistSubagentMetadata(tmpDir, source.id, {
      schemaVersion: 1,
      id: source.id,
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 10,
    });
    await writeEvents(tmpDir, source.id, [
      {type: 'text-delta', content: 'old'},
    ]);

    const prepared = await prepareResumedSubagentState({
      subagentSessionsDir: tmpDir,
      sourceSubagentId: source.id,
    });

    expect(prepared.snapshot.id).not.toBe(source.id);
    expect(prepared.snapshot.llmSession.id).not.toBe(source.llmSession.id);
    expect(prepared.snapshot.llmSession.messages).toEqual(
      source.llmSession.messages,
    );
    expect(prepared.metadata).toMatchObject({
      schemaVersion: 1,
      id: prepared.snapshot.id,
      agentType: SUB_AGENT_TYPE.EXPLORE,
      resumedFromSubagentId: source.id,
    });
    expect(prepared.subagentSseEventStartIndex).toBe(1);
    await expect(
      loadSubagentMetadata(tmpDir, prepared.snapshot.id),
    ).resolves.toEqual(prepared.metadata);
    await expect(
      agentPersistence.loadSnapshot(tmpDir, prepared.snapshot.id),
    ).resolves.toEqual(prepared.snapshot);

    const copiedEvents = await fs.readFile(
      agentPersistence.eventsPath(tmpDir, prepared.snapshot.id),
      'utf-8',
    );
    expect(copiedEvents).toContain('old');
  });

  it('rejects resume when the source snapshot id differs from the requested subagent id', async () => {
    const source = createSnapshot('source-id', 0);
    await agentPersistence.persistSnapshot(tmpDir, source.id, {
      ...source,
      id: 'other-source-id',
    });
    await persistSubagentMetadata(tmpDir, source.id, {
      schemaVersion: 1,
      id: source.id,
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 10,
    });

    await expect(
      prepareResumedSubagentState({
        subagentSessionsDir: tmpDir,
        sourceSubagentId: source.id,
      }),
    ).rejects.toThrow(
      'Subagent snapshot id mismatch: expected source-id, got other-source-id',
    );
  });

  it('fails resume preparation when source subagent metadata is missing', async () => {
    const source = createSnapshot('source-id', 0);
    await agentPersistence.persistSnapshot(tmpDir, source.id, source);

    await expect(
      prepareResumedSubagentState({
        subagentSessionsDir: tmpDir,
        sourceSubagentId: source.id,
      }),
    ).rejects.toThrow();
  });
});
