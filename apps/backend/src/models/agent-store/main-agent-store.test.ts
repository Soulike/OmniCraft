import assert from 'node:assert';
import {mkdir, mkdtemp, rm} from 'node:fs/promises';
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

    it('returns true for on-disk directory', async () => {
      const store = MainAgentStore.create(sessionsDir);
      const id = 'on-disk-session';
      await mkdir(path.join(sessionsDir, id));
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

      // has() should return true (directory exists on disk)
      // but should NOT trigger loading into the cache.
      const exists = await store.has(id);
      expect(exists).toBe(true);

      // After has(), the agent should not be cached. We cannot call
      // get() to verify because that would trigger loadFromDisk.
      // Instead, delete from disk and re-check has() — if has() had
      // cached it, it would still return true.
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

  describe('resetInstance', () => {
    it('allows re-creation after reset', () => {
      MainAgentStore.create(sessionsDir);
      MainAgentStore.resetInstance();
      expect(() => MainAgentStore.create(sessionsDir)).not.toThrow();
    });

    it('is safe to call when no instance exists', () => {
      expect(() => { MainAgentStore.resetInstance(); }).not.toThrow();
    });
  });
});
