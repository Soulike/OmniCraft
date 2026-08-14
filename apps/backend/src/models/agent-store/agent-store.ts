import type {SessionMetadata} from '@omnicraft/api-schema';

import type {Agent} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';

const MAX_CACHED_AGENTS = 50;

interface CacheEntry {
  agent: Agent;
  lastAccessedAt: number;
}

interface AgentLifecycle {
  activeOperationCount: number;
  deleting: boolean;
  drain: PromiseWithResolvers<undefined> | null;
  deletion: Promise<boolean> | null;
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
  private readonly lifecycles = new Map<string, AgentLifecycle>();

  constructor(private readonly _sessionsDir: string) {}

  protected get sessionsDir(): string {
    return this._sessionsDir;
  }

  /** Adds an owned agent to the cache with LRU tracking. */
  private cacheAgent(agent: Agent): void {
    this.cache.set(agent.id, {agent, lastAccessedAt: Date.now()});
    this.evictIfNeeded();
  }

  /** Retrieves an owned agent by id, loading from disk if not cached. */
  private async getAgent(id: string): Promise<Agent | undefined> {
    const entry = this.cache.get(id);
    if (entry) {
      entry.lastAccessedAt = Date.now();
      return entry.agent;
    }

    const existing = this.loadingPromises.get(id);
    if (existing) return existing;

    const loadPromise = this.loadAndRegister(id);
    this.loadingPromises.set(id, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.loadingPromises.delete(id);
    }
  }

  /** Runs one operation against the current agent for a persisted session. */
  async runAgentOperation<Result>(
    id: string,
    operation: (agent: Agent) => Promise<Result> | Result,
  ): Promise<Result | undefined> {
    const lifecycle = this.getLifecycle(id);
    if (lifecycle.deleting) return undefined;

    lifecycle.activeOperationCount++;
    try {
      const agent = await this.getAgent(id);
      if (!agent) return undefined;
      return await operation(agent);
    } finally {
      this.releaseOperation(id, lifecycle);
    }
  }

  /** Removes an agent from memory and deletes its session from disk. */
  delete(id: string): Promise<boolean> {
    const lifecycle = this.getLifecycle(id);
    if (lifecycle.deletion) return lifecycle.deletion;

    lifecycle.deleting = true;
    if (lifecycle.activeOperationCount > 0) {
      lifecycle.drain = Promise.withResolvers<undefined>();
    }
    lifecycle.deletion = this.finishDelete(id, lifecycle);
    return lifecycle.deletion;
  }

  /**
   * Ids of currently-running agents resident in the cache. Running agents are
   * never evicted (see evictIfNeeded), so this in-memory scan (O(≤50), no disk)
   * is a complete view of what is running right now. After a process restart the
   * cache is cold, so this is empty — correct, since a turn cannot survive one.
   */
  protected getRunningIds(): Set<string> {
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
  protected getWaitingIds(): Set<string> {
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

  /** Takes ownership of an Agent before notifying outward listeners. */
  protected registerAgent(agent: Agent): void {
    this.cacheAgent(agent);
    agentEventBus.emit('agent-created', agent);
  }

  private async loadAndRegister(id: string): Promise<Agent | undefined> {
    const agent = await this.loadFromDisk(id);
    if (agent) this.registerAgent(agent);
    return agent;
  }

  private getLifecycle(id: string): AgentLifecycle {
    const existing = this.lifecycles.get(id);
    if (existing) return existing;

    const lifecycle = {
      activeOperationCount: 0,
      deleting: false,
      drain: null,
      deletion: null,
    };
    this.lifecycles.set(id, lifecycle);
    return lifecycle;
  }

  private releaseOperation(id: string, lifecycle: AgentLifecycle): void {
    lifecycle.activeOperationCount--;
    if (lifecycle.activeOperationCount !== 0) return;

    lifecycle.drain?.resolve(undefined);
    if (!lifecycle.deleting) this.lifecycles.delete(id);
    this.evictIfNeeded();
  }

  private async finishDelete(
    id: string,
    lifecycle: AgentLifecycle,
  ): Promise<boolean> {
    try {
      await lifecycle.drain?.promise;
      const agent = this.cache.get(id)?.agent;
      if (!agent && !(await this.existsOnDisk(id))) return false;

      await agent?.close();
      this.cache.delete(id);
      return await this.deleteFromDisk(id);
    } finally {
      if (this.lifecycles.get(id) === lifecycle) {
        this.lifecycles.delete(id);
      }
    }
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= MAX_CACHED_AGENTS) return;

    const entries = [...this.cache.entries()]
      .filter(([id, entry]) => {
        const lifecycle = this.lifecycles.get(id);
        if (lifecycle) {
          if (lifecycle.deleting) return false;
          if (lifecycle.activeOperationCount > 0) return false;
        }
        if (entry.agent.isRunning) return false;
        return entry.agent.sseLog.activeReaderCount === 0;
      })
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (const [id] of entries) {
      if (this.cache.size <= MAX_CACHED_AGENTS) break;
      this.cache.delete(id);
    }
  }
}
