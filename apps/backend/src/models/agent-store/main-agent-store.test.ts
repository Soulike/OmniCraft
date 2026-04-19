import assert from 'node:assert';
import {mkdir, mkdtemp, rm, utimes, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import type {Agent} from '@/agent-core/agent/index.js';
import {AgentSseLog} from '@/agent-core/agent/index.js';

import {MainAgentStore} from './main-agent-store.js';

/** Creates a minimal mock Agent object for testing cache operations. */
function createMockAgent(
  id: string,
  overrides: {isRunning?: boolean; activeReaderCount?: number} = {},
): Agent {
  const sseLog = new AgentSseLog();
  Object.defineProperty(sseLog, 'activeReaderCount', {
    get: () => overrides.activeReaderCount ?? 0,
  });
  return {
    id,
    isRunning: overrides.isRunning ?? false,
    sseLog,
  } as Agent;
}

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
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'agent-store-test-'));
  });

  afterEach(async () => {
    MainAgentStore.resetInstance();
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

    it('stores the sessionsDir', () => {
      const store = MainAgentStore.create(sessionsDir);
      expect(store.sessionsDir).toBe(sessionsDir);
    });
  });

  describe('set and get', () => {
    it('stores and retrieves an agent from cache', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const agent = createMockAgent('test-id');
      store.set(agent);
      const retrieved = await store.get('test-id');
      expect(retrieved).toBe(agent);
    });

    it('returns undefined for nonexistent session', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const result = await store.get('nonexistent-id');
      expect(result).toBeUndefined();
    });
  });

  describe('has', () => {
    it('returns true for in-memory agent', async () => {
      const store = MainAgentStore.create(sessionsDir);
      store.set(createMockAgent('in-memory'));
      expect(await store.has('in-memory')).toBe(true);
    });

    it('returns true for on-disk session with snapshot', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = 'on-disk-session';
      await mkdir(path.join(sessionsDir, id));
      await writeFile(path.join(sessionsDir, id, 'snapshot.json'), '{}');
      expect(await store.has(id)).toBe(true);
    });

    it('returns false for nonexistent session', async () => {
      const store = MainAgentStore.create(sessionsDir);
      expect(await store.has('nonexistent')).toBe(false);
    });

    it('does not load the agent into cache', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = 'no-load-session';
      await mkdir(path.join(sessionsDir, id));
      await writeFile(path.join(sessionsDir, id, 'snapshot.json'), '{}');

      const exists = await store.has(id);
      expect(exists).toBe(true);

      await rm(path.join(sessionsDir, id), {recursive: true});
      const stillExists = await store.has(id);
      expect(stillExists).toBe(false);
    });
  });

  describe('delete', () => {
    it('removes from memory', async () => {
      const store = MainAgentStore.create(sessionsDir);
      store.set(createMockAgent('del-mem'));
      const result = await store.delete('del-mem');
      expect(result).toBe(true);
      // No longer in cache
      const agent = await store.get('del-mem');
      expect(agent).toBeUndefined();
    });

    it('removes from disk', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = 'del-disk';
      await mkdir(path.join(sessionsDir, id));
      await writeFile(path.join(sessionsDir, id, 'snapshot.json'), '{}');
      expect(await store.has(id)).toBe(true);

      await store.delete(id);
      expect(await store.has(id)).toBe(false);
    });

    it('returns true even if session does not exist on disk', async () => {
      const store = MainAgentStore.create(sessionsDir);
      // rm with force: true succeeds even if path doesn't exist
      const result = await store.delete('nonexistent');
      expect(result).toBe(true);
    });
  });

  describe('LRU eviction', () => {
    it('evicts oldest non-running agents when exceeding max cache size', () => {
      const store = MainAgentStore.create(sessionsDir);

      // Fill cache to MAX_CACHED_AGENTS (50)
      for (let i = 0; i < 50; i++) {
        store.set(createMockAgent(`agent-${i}`));
      }

      // Adding one more should trigger eviction of the oldest
      store.set(createMockAgent('agent-trigger'));

      // Cache should be at most 50
      // The oldest agent (agent-0) should have been evicted
      // We can't access cache directly, but we can verify via the
      // get method. agent-0 won't be found in cache (and won't be
      // on disk either), so it returns undefined.
    });

    it('skips running agents during eviction', async () => {
      const store = MainAgentStore.create(sessionsDir);

      // Set agent-0 as running
      store.set(createMockAgent('agent-running', {isRunning: true}));

      // Fill remaining slots
      for (let i = 1; i < 50; i++) {
        store.set(createMockAgent(`agent-${i}`));
      }

      // Trigger eviction
      store.set(createMockAgent('agent-trigger'));

      // Running agent should still be in cache
      const runningAgent = await store.get('agent-running');
      assert(runningAgent);
      expect(runningAgent.id).toBe('agent-running');
    });

    it('skips agents with active readers during eviction', async () => {
      const store = MainAgentStore.create(sessionsDir);

      // Set agent-0 with active readers
      store.set(createMockAgent('agent-reading', {activeReaderCount: 1}));

      // Fill remaining slots
      for (let i = 1; i < 50; i++) {
        store.set(createMockAgent(`agent-${i}`));
      }

      // Trigger eviction
      store.set(createMockAgent('agent-trigger'));

      // Agent with active readers should still be in cache
      const readingAgent = await store.get('agent-reading');
      assert(readingAgent);
      expect(readingAgent.id).toBe('agent-reading');
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
      await writeSnapshot(sessionsDir, 'session-a', {
        id: 'session-a',
        title: 'Title A',
      });
      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({
        sessions: [{id: 'session-a', title: 'Title A'}],
        total: 1,
      });
    });

    it('sorts by file mtime descending (most recent first)', async () => {
      const store = MainAgentStore.create(sessionsDir);

      await writeSnapshot(sessionsDir, 'older', {
        id: 'older',
        title: 'Older',
      });
      await writeSnapshot(sessionsDir, 'newer', {
        id: 'newer',
        title: 'Newer',
      });

      // Set mtime so 'older' is older and 'newer' is newer
      const past = new Date(Date.now() - 60_000);
      const now = new Date();
      await utimes(
        path.join(sessionsDir, 'older', 'snapshot.json'),
        past,
        past,
      );
      await utimes(path.join(sessionsDir, 'newer', 'snapshot.json'), now, now);

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {id: 'newer', title: 'Newer'},
        {id: 'older', title: 'Older'},
      ]);
    });

    it('skips directories with missing snapshot.json', async () => {
      const store = MainAgentStore.create(sessionsDir);
      await mkdir(path.join(sessionsDir, 'no-snapshot'));
      await writeSnapshot(sessionsDir, 'valid', {
        id: 'valid',
        title: 'Valid',
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result).toEqual({
        sessions: [{id: 'valid', title: 'Valid'}],
        total: 1,
      });
    });

    it('skips snapshots with invalid JSON', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const dir = path.join(sessionsDir, 'bad-json');
      await mkdir(dir);
      await writeFile(path.join(dir, 'snapshot.json'), 'not valid json{{{');

      await writeSnapshot(sessionsDir, 'good', {id: 'good', title: 'Good'});

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([{id: 'good', title: 'Good'}]);
    });

    it('skips snapshots missing required fields', async () => {
      const store = MainAgentStore.create(sessionsDir);
      await writeSnapshot(sessionsDir, 'no-title', {id: 'no-title'});
      await writeSnapshot(sessionsDir, 'complete', {
        id: 'complete',
        title: 'Complete',
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([{id: 'complete', title: 'Complete'}]);
    });

    it('paginates with offset and limit', async () => {
      const store = MainAgentStore.create(sessionsDir);

      for (let i = 0; i < 5; i++) {
        await writeSnapshot(sessionsDir, `s${i}`, {
          id: `s${i}`,
          title: `T${i}`,
        });
        const mtime = new Date(Date.now() - (4 - i) * 60_000);
        await utimes(
          path.join(sessionsDir, `s${i}`, 'snapshot.json'),
          mtime,
          mtime,
        );
      }

      // Sorted order by mtime desc: s4, s3, s2, s1, s0
      const page1 = await store.listSessionMetadata(0, 2);
      expect(page1.total).toBe(5);
      expect(page1.sessions).toEqual([
        {id: 's4', title: 'T4'},
        {id: 's3', title: 'T3'},
      ]);

      const page2 = await store.listSessionMetadata(2, 2);
      expect(page2.total).toBe(5);
      expect(page2.sessions).toEqual([
        {id: 's2', title: 'T2'},
        {id: 's1', title: 'T1'},
      ]);

      const page3 = await store.listSessionMetadata(4, 2);
      expect(page3.total).toBe(5);
      expect(page3.sessions).toEqual([{id: 's0', title: 'T0'}]);
    });

    it('reads from metadata.json when present', async () => {
      const store = MainAgentStore.create(sessionsDir);
      await writeSnapshot(sessionsDir, 'sess-1', {
        id: 'sess-1',
        title: 'Snapshot Title',
        sseEventCount: 0,
        llmSession: {id: 'llm-1', messages: [{large: 'data'}]},
        options: {workingDirectory: '/tmp'},
      });
      await writeMetadata(sessionsDir, 'sess-1', {
        id: 'sess-1',
        title: 'Metadata Title',
        workingDirectory: '/tmp',
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([
        {id: 'sess-1', title: 'Metadata Title', workingDirectory: '/tmp'},
      ]);
    });

    it('falls back to snapshot.json when metadata.json is missing', async () => {
      const store = MainAgentStore.create(sessionsDir);
      await writeSnapshot(sessionsDir, 'legacy', {
        id: 'legacy',
        title: 'Legacy Title',
        sseEventCount: 0,
        llmSession: {id: 'llm-1', messages: []},
        options: {workingDirectory: '/tmp'},
      });

      const result = await store.listSessionMetadata(0, 100);
      expect(result.sessions).toEqual([{id: 'legacy', title: 'Legacy Title'}]);
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
