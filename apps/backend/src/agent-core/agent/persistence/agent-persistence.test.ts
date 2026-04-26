import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {SseEvent} from '@omnicraft/sse-events';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import type {AgentSnapshot} from '../types.js';
import {agentPersistence} from './agent-persistence.js';

function createTestSnapshot(id: string): AgentSnapshot {
  return {
    id,
    title: 'Test Session',
    sseEventCount: 0,
    llmSession: {
      id: 'llm-session-id',
      messages: [],
    },
    options: {
      workingDirectory: '/tmp/test-working-dir',
      thinkingLevel: 'medium',
    },
  };
}

function sseTextDelta(content: string): SseEvent {
  return {type: 'text-delta', content};
}

describe('agentPersistence', () => {
  let tmpDir: string;
  const agentId = 'test-agent-id';

  beforeEach(async () => {
    tmpDir = await mkdtemp(path.join(os.tmpdir(), 'agent-persistence-test-'));
    await mkdir(path.join(tmpDir, agentId), {recursive: true});
  });

  afterEach(async () => {
    await rm(tmpDir, {recursive: true, force: true});
  });

  describe('persistSnapshot', () => {
    it('writes snapshot to disk and can be loaded back', async () => {
      const snapshot = createTestSnapshot(agentId);
      await agentPersistence.persistSnapshot(tmpDir, agentId, snapshot);

      const loaded = await agentPersistence.loadSnapshot(tmpDir, agentId);
      expect(loaded).toEqual(snapshot);
    });

    it('writes metadata.json alongside snapshot.json', async () => {
      const snapshot = createTestSnapshot(agentId);
      await agentPersistence.persistSnapshot(tmpDir, agentId, snapshot);

      const metadataPath = agentPersistence.metadataPath(tmpDir, agentId);
      const content = await readFile(metadataPath, 'utf-8');
      const metadata: unknown = JSON.parse(content);

      expect(metadata).toEqual({
        id: agentId,
        title: 'Test Session',
        workingDirectory: '/tmp/test-working-dir',
      });
    });
  });

  describe('loadSnapshot', () => {
    it('reads and parses snapshot.json correctly', async () => {
      const snapshot = createTestSnapshot(agentId);
      const filePath = path.join(tmpDir, agentId, 'snapshot.json');
      await writeFile(filePath, JSON.stringify(snapshot, null, 2) + '\n');

      const loaded = await agentPersistence.loadSnapshot(tmpDir, agentId);

      expect(loaded).toEqual(snapshot);
    });

    it('throws when snapshot.json does not exist', async () => {
      await expect(
        agentPersistence.loadSnapshot(tmpDir, 'nonexistent-id'),
      ).rejects.toThrow();
    });

    it('throws when snapshot.json contains invalid JSON', async () => {
      const filePath = path.join(tmpDir, agentId, 'snapshot.json');
      await writeFile(filePath, 'not-valid-json');

      await expect(
        agentPersistence.loadSnapshot(tmpDir, agentId),
      ).rejects.toThrow();
    });

    it('throws when snapshot fails schema validation', async () => {
      const filePath = path.join(tmpDir, agentId, 'snapshot.json');
      await writeFile(filePath, JSON.stringify({id: 'test', invalid: true}));

      await expect(
        agentPersistence.loadSnapshot(tmpDir, agentId),
      ).rejects.toThrow();
    });

    it('throws when snapshot options are missing thinkingLevel', async () => {
      const filePath = path.join(tmpDir, agentId, 'snapshot.json');
      await writeFile(
        filePath,
        JSON.stringify({
          id: agentId,
          title: 'Test Session',
          sseEventCount: 0,
          llmSession: {id: 'llm-session-id', messages: []},
          options: {workingDirectory: '/tmp/test-working-dir'},
        }),
      );

      await expect(
        agentPersistence.loadSnapshot(tmpDir, agentId),
      ).rejects.toThrow();
    });
  });

  describe('reconcileEventsFile', () => {
    it('keeps events up to sseEventCount', async () => {
      const events = [
        sseTextDelta('event-1'),
        sseTextDelta('event-2'),
        sseTextDelta('event-3'),
      ];
      const filePath = path.join(tmpDir, agentId, 'sse-events.jsonl');
      await writeFile(
        filePath,
        events.map((e) => JSON.stringify(e)).join('\n') + '\n',
      );

      await agentPersistence.reconcileEventsFile(tmpDir, agentId, 2);

      const content = await readFile(filePath, 'utf-8');
      const lines = content
        .trimEnd()
        .split('\n')
        .filter((l) => l !== '');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(sseTextDelta('event-1'));
      expect(JSON.parse(lines[1])).toEqual(sseTextDelta('event-2'));
    });

    it('clears file when sseEventCount is 0', async () => {
      const events = [sseTextDelta('event-1'), sseTextDelta('event-2')];
      const filePath = path.join(tmpDir, agentId, 'sse-events.jsonl');
      await writeFile(
        filePath,
        events.map((e) => JSON.stringify(e)).join('\n') + '\n',
      );

      await agentPersistence.reconcileEventsFile(tmpDir, agentId, 0);

      const content = await readFile(filePath, 'utf-8');
      expect(content).toBe('');
    });

    it('discards corrupted last line before truncating', async () => {
      const validEvents = [sseTextDelta('event-1'), sseTextDelta('event-2')];
      const filePath = path.join(tmpDir, agentId, 'sse-events.jsonl');
      await writeFile(
        filePath,
        validEvents.map((e) => JSON.stringify(e)).join('\n') +
          '\n' +
          'corrupted-json\n',
      );

      await agentPersistence.reconcileEventsFile(tmpDir, agentId, 3);

      const content = await readFile(filePath, 'utf-8');
      const lines = content
        .trimEnd()
        .split('\n')
        .filter((l) => l !== '');
      expect(lines).toHaveLength(2);
      expect(JSON.parse(lines[0])).toEqual(sseTextDelta('event-1'));
      expect(JSON.parse(lines[1])).toEqual(sseTextDelta('event-2'));
    });

    it('does nothing when events file does not exist', async () => {
      await expect(
        agentPersistence.reconcileEventsFile(tmpDir, 'nonexistent-id', 5),
      ).resolves.toBeUndefined();
    });
  });
});
