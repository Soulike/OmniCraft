import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, utimes, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

import {MainAgentStore} from './main-agent-store.js';

/** Writes a minimal snapshot.json into a session directory. */
async function writeSnapshot(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(data));
}

/** Writes a metadata.json sidecar into a session directory. */
async function writeMetadata(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(data));
}

describe('MainAgentStore', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    MainAgentStore.resetInstance();
    McpManager.create();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'agent-store-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    MainAgentStore.resetInstance();
    McpManager.resetInstanceForTesting();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  describe('getInstance', () => {
    it('throws if not initialized', () => {
      expect(() => MainAgentStore.getInstance()).toThrow(
        'MainAgentStore is not initialized',
      );
    });

    it('returns the singleton after create', () => {
      const store = MainAgentStore.create(sessionsDir);
      expect(MainAgentStore.getInstance()).toBe(store);
    });
  });

  describe('create', () => {
    it('throws if called twice', () => {
      MainAgentStore.create(sessionsDir);
      expect(() => MainAgentStore.create(sessionsDir)).toThrow(
        'already initialized',
      );
    });
  });

  describe('agent lifecycle', () => {
    it('owns a created agent before announcing it', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const notification = Promise.withResolvers<boolean>();
      agentEventBus.once('agent-created', (agent) => {
        void store
          .runAgentOperation(agent.id, (current) => current === agent)
          .then((owned) => {
            notification.resolve(owned ?? false);
          });
      });

      const sessionId = store.createAgent();

      expect(sessionId).toEqual(expect.any(String));
      await expect(notification.promise).resolves.toBe(true);
    });

    it('drains an active operation before deleting its agent', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const agentId = store.createAgent();
      const operationStarted = Promise.withResolvers<undefined>();
      const resumeOperation = Promise.withResolvers<undefined>();

      const operation = store.runAgentOperation(agentId, async (current) => {
        operationStarted.resolve(undefined);
        await resumeOperation.promise;
        return current.id;
      });
      await operationStarted.promise;

      let deletionFinished = false;
      const deletion = store.delete(agentId).then((result) => {
        deletionFinished = true;
        return result;
      });
      await Promise.resolve();

      expect(deletionFinished).toBe(false);
      await expect(
        store.runAgentOperation(agentId, () => 'unexpected'),
      ).resolves.toBeUndefined();

      resumeOperation.resolve(undefined);
      await expect(operation).resolves.toBe(agentId);
      await expect(deletion).resolves.toBe(true);
      await expect(
        store.runAgentOperation(agentId, () => 'unexpected'),
      ).resolves.toBeUndefined();
    });

    it('restores a persisted agent for an operation', async () => {
      const firstStore = MainAgentStore.create(sessionsDir);
      const sessionId = firstStore.createAgent();
      MainAgentStore.resetInstance();

      const restoredStore = MainAgentStore.create(sessionsDir);
      await expect(
        restoredStore.runAgentOperation(sessionId, (agent) => agent.id),
      ).resolves.toBe(sessionId);
    });

    it('keeps an agent owned while one of its operations is active', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const sessionId = store.createAgent();
      const operationStarted = Promise.withResolvers<undefined>();
      const resumeOperation = Promise.withResolvers<undefined>();
      const closeObserved =
        Promise.withResolvers<ReturnType<typeof vi.spyOn>>();

      const operation = store.runAgentOperation(sessionId, async (agent) => {
        closeObserved.resolve(vi.spyOn(agent, 'close'));
        operationStarted.resolve(undefined);
        await resumeOperation.promise;
      });
      await operationStarted.promise;
      await new Promise<void>((resolve) => setTimeout(resolve, 2));

      for (let i = 0; i < 50; i++) {
        store.createAgent();
      }

      const deletion = store.delete(sessionId);
      resumeOperation.resolve(undefined);
      await operation;
      await expect(deletion).resolves.toBe(true);
      expect(await closeObserved.promise).toHaveBeenCalledOnce();
    });

    it('retries LRU eviction when an operation loses its final protection', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const releases: PromiseWithResolvers<undefined>[] = [];
      const operations: Promise<unknown>[] = [];
      const firstAgent = Promise.withResolvers<Agent>();

      const firstId = store.createAgent();
      const firstStarted = Promise.withResolvers<undefined>();
      const firstRelease = Promise.withResolvers<undefined>();
      releases.push(firstRelease);
      operations.push(
        store.runAgentOperation(firstId, async (agent) => {
          firstAgent.resolve(agent);
          firstStarted.resolve(undefined);
          await firstRelease.promise;
        }),
      );
      await firstStarted.promise;

      for (let i = 0; i < 50; i++) {
        const id = store.createAgent();
        const started = Promise.withResolvers<undefined>();
        const release = Promise.withResolvers<undefined>();
        releases.push(release);

        const operation = store.runAgentOperation(id, async () => {
          started.resolve(undefined);
          await release.promise;
        });
        operations.push(operation);
        await started.promise;
      }

      try {
        releases[0].resolve(undefined);
        await operations[0];

        const originalAgent = await firstAgent.promise;
        await expect(
          store.runAgentOperation(firstId, (agent) => agent !== originalAgent),
        ).resolves.toBe(true);
      } finally {
        for (const release of releases) release.resolve(undefined);
        await Promise.all(operations);
      }
    });
  });

  describe('delete', () => {
    it('removes from disk', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = 'del-disk';
      await mkdir(path.join(sessionsDir, id));
      await writeFile(path.join(sessionsDir, id, 'snapshot.json'), '{}');

      await expect(store.delete(id)).resolves.toBe(true);
      await expect(
        store.runAgentOperation(id, () => 'unexpected'),
      ).resolves.toBeUndefined();
    });

    it('returns false if the session does not exist', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const result = await store.delete('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('listSessionMetadata', () => {
    it('returns empty result when sessions directory is empty', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({sessions: [], total: 0});
    });

    it('returns empty result when sessions directory does not exist', async () => {
      const nonexistent = path.join(sessionsDir, 'does-not-exist');
      const store = MainAgentStore.create(nonexistent);
      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({sessions: [], total: 0});
    });

    it('returns metadata from valid snapshots', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = crypto.randomUUID();
      await writeSnapshot(sessionsDir, id, {
        id,
        title: 'Title A',
      });
      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({
        sessions: [
          {id, title: 'Title A', updatedAt: expect.any(Number) as unknown},
        ],
        total: 1,
      });
    });

    it('sorts by file mtime descending (most recent first)', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const olderId = crypto.randomUUID();
      const newerId = crypto.randomUUID();

      await writeSnapshot(sessionsDir, olderId, {
        id: olderId,
        title: 'Older',
      });
      await writeSnapshot(sessionsDir, newerId, {
        id: newerId,
        title: 'Newer',
      });

      // Set mtime so 'older' is older and 'newer' is newer
      const past = new Date(Date.now() - 60_000);
      const now = new Date();
      await utimes(
        path.join(sessionsDir, olderId, 'snapshot.json'),
        past,
        past,
      );
      await utimes(path.join(sessionsDir, newerId, 'snapshot.json'), now, now);

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {id: newerId, title: 'Newer', updatedAt: expect.any(Number) as unknown},
        {id: olderId, title: 'Older', updatedAt: expect.any(Number) as unknown},
      ]);
    });

    it('skips directories with missing snapshot.json', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const validId = crypto.randomUUID();
      await mkdir(path.join(sessionsDir, 'no-snapshot'));
      await writeSnapshot(sessionsDir, validId, {
        id: validId,
        title: 'Valid',
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({
        sessions: [
          {
            id: validId,
            title: 'Valid',
            updatedAt: expect.any(Number) as unknown,
          },
        ],
        total: 1,
      });
    });

    it('ignores non-directory entries (e.g. macOS .DS_Store)', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const validId = crypto.randomUUID();
      await writeSnapshot(sessionsDir, validId, {id: validId, title: 'Valid'});
      await writeFile(path.join(sessionsDir, '.DS_Store'), 'junk');

      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({
        sessions: [
          {
            id: validId,
            title: 'Valid',
            updatedAt: expect.any(Number) as unknown,
          },
        ],
        total: 1,
      });
    });

    it('skips snapshots with invalid JSON', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const dir = path.join(sessionsDir, 'bad-json');
      await mkdir(dir);
      await writeFile(path.join(dir, 'snapshot.json'), 'not valid json{{{');

      const goodId = crypto.randomUUID();
      await writeSnapshot(sessionsDir, goodId, {id: goodId, title: 'Good'});

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {id: goodId, title: 'Good', updatedAt: expect.any(Number) as unknown},
      ]);
    });

    it('skips snapshots missing required fields', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const noTitleId = crypto.randomUUID();
      const completeId = crypto.randomUUID();
      await writeSnapshot(sessionsDir, noTitleId, {id: noTitleId});
      await writeSnapshot(sessionsDir, completeId, {
        id: completeId,
        title: 'Complete',
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {
          id: completeId,
          title: 'Complete',
          updatedAt: expect.any(Number) as unknown,
        },
      ]);
    });

    it('paginates with offset and limit', async () => {
      const store = MainAgentStore.create(sessionsDir);

      const ids = Array.from({length: 5}, () => crypto.randomUUID());
      for (let i = 0; i < ids.length; i++) {
        await writeSnapshot(sessionsDir, ids[i], {
          id: ids[i],
          title: `T${i}`,
        });
        const mtime = new Date(Date.now() - (4 - i) * 60_000);
        await utimes(
          path.join(sessionsDir, ids[i], 'snapshot.json'),
          mtime,
          mtime,
        );
      }

      // Sorted order by mtime desc: ids[4], ids[3], ids[2], ids[1], ids[0]
      const page1 = await store.listSessionMetadata(0, 2);
      expect(page1.total).toBe(5);
      expect(page1.sessions).toEqual([
        {id: ids[4], title: 'T4', updatedAt: expect.any(Number) as unknown},
        {id: ids[3], title: 'T3', updatedAt: expect.any(Number) as unknown},
      ]);

      const page2 = await store.listSessionMetadata(2, 2);
      expect(page2.total).toBe(5);
      expect(page2.sessions).toEqual([
        {id: ids[2], title: 'T2', updatedAt: expect.any(Number) as unknown},
        {id: ids[1], title: 'T1', updatedAt: expect.any(Number) as unknown},
      ]);

      const page3 = await store.listSessionMetadata(4, 2);
      expect(page3.total).toBe(5);
      expect(page3.sessions).toEqual([
        {id: ids[0], title: 'T0', updatedAt: expect.any(Number) as unknown},
      ]);
    });

    it('reads from metadata.json when present', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = crypto.randomUUID();
      await writeSnapshot(sessionsDir, id, {
        id,
        title: 'Snapshot Title',
        sseEventCount: 0,
        llmSession: {id: 'llm-1', messages: [{large: 'data'}]},
        options: {workingDirectory: '/tmp'},
      });
      await writeMetadata(sessionsDir, id, {
        id,
        title: 'Metadata Title',
        workingDirectory: '/tmp',
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {
          id,
          title: 'Metadata Title',
          workingDirectory: '/tmp',
          updatedAt: expect.any(Number) as unknown,
        },
      ]);
    });

    it('falls back to snapshot.json when metadata.json is missing', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = crypto.randomUUID();
      await writeSnapshot(sessionsDir, id, {
        id,
        title: 'Legacy Title',
        sseEventCount: 0,
        llmSession: {id: 'llm-1', messages: []},
        options: {workingDirectory: '/tmp'},
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {id, title: 'Legacy Title', updatedAt: expect.any(Number) as unknown},
      ]);
    });

    it('includes updatedAt equal to the snapshot mtime', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = crypto.randomUUID();
      await writeSnapshot(sessionsDir, id, {id, title: 'Timed'});
      const when = new Date('2026-01-02T03:04:05.000Z');
      await utimes(path.join(sessionsDir, id, 'snapshot.json'), when, when);

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions[0].updatedAt).toBe(when.getTime());
    });
  });

  describe('resetInstance', () => {
    it('allows re-creation after reset', () => {
      MainAgentStore.create(sessionsDir);
      MainAgentStore.resetInstance();
      expect(() => MainAgentStore.create(sessionsDir)).not.toThrow();
    });

    it('is safe to call when no instance exists', () => {
      expect(() => {
        MainAgentStore.resetInstance();
      }).not.toThrow();
    });
  });
});
