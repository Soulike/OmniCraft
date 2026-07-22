import type {SessionMetadata} from '@omnicraft/api-schema';

import type {Agent} from '@/agent-core/agent/index.js';

const MAX_CACHED_AGENTS = 50;

interface CacheEntry {
  agent: Agent;
  lastAccessedAt: number;
}

/**
 * Abstract base class for agent stores.
 * Handles in-memory LRU caching and deduplication of concurrent loads.
 * Subclasses implement disk persistence and session listing.
 */
export abstract class AgentStore {
  private readonly cache = new Map<string, CacheEntry>();
  private readonly loadingPromises = new Map<
    string,
    Promise<Agent | undefined>
  >();

  constructor(private readonly _sessionsDir: string) {}

  get sessionsDir(): string {
    return this._sessionsDir;
  }

  /** Registers an agent in the cache with LRU tracking. */
  set(agent: Agent): void {
    this.cache.set(agent.id, {agent, lastAccessedAt: Date.now()});
    this.evictIfNeeded();
  }

  /** Retrieves an agent by id, loading from disk if not cached. */
  async get(id: string): Promise<Agent | undefined> {
    const entry = this.cache.get(id);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      return entry.agent;
    }

    const existing = this.loadingPromises.get(id);
    if (existing) return existing;

    const loadPromise = this.loadFromDisk(id);
    this.loadingPromises.set(id, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  /** Checks whether an agent exists in memory or on disk. Does not load. */
  async has(id: string): Promise<boolean> {
    if (this.cache.has(id)) return true;
    return this.existsOnDisk(id);
  }

  /** Removes an agent from memory and deletes its session from disk. */
  async delete(id: string): Promise<boolean> {
    this.cache.delete(id);
    return this.deleteFromDisk(id);
  }

  /**
   * Ids of currently-running agents resident in the cache. Running agents are
   * never evicted (see evictIfNeeded), so this in-memory scan (O(≤50), no disk)
   * is a complete view of what is running right now. After a process restart the
   * cache is cold, so this is empty — correct, since a turn cannot survive one.
   */
  getRunningIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, entry] of this.cache) {
      if (entry.agent.isRunning) {
        ids.add(id);
      }
    }
    return ids;
  }

  /**
   * Ids of cached agents currently blocked awaiting a user response to a
   * client-side tool call. Mirrors {@link getRunningIds}: a blocked agent is
   * always running, so eviction never removes it and this in-memory scan is a
   * complete view. Cold cache after a restart ⇒ empty, which is correct.
   */
  getWaitingIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, entry] of this.cache) {
      if (entry.agent.isWaitingForInput) {
        ids.add(id);
      }
    }
    return ids;
  }

  /** Lists persisted sessions with pagination. */
  abstract listSessionMetadata(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}>;

  /** Loads an agent from disk. Returns undefined if not found. */
  protected abstract loadFromDisk(id: string): Promise<Agent | undefined>;

  /** Checks whether an agent session exists on disk. */
  protected abstract existsOnDisk(id: string): Promise<boolean>;

  /** Deletes an agent session from disk. */
  protected abstract deleteFromDisk(id: string): Promise<boolean>;

  private evictIfNeeded(): void {
    if (this.cache.size <= MAX_CACHED_AGENTS) return;

    const entries = [...this.cache.entries()]
      .filter(
        ([, e]) => !e.agent.isRunning && e.agent.sseLog.activeReaderCount === 0,
      )
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (const [id] of entries) {
      if (this.cache.size <= MAX_CACHED_AGENTS) break;
      this.cache.delete(id);
    }
  }
}
