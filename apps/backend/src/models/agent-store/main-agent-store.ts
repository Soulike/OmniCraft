import assert from 'node:assert';
import {access, rm} from 'node:fs/promises';
import path from 'node:path';

import {MainAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';
import {getLlmConfig} from '@/services/chat/helpers.js';

const MAX_CACHED_AGENTS = 50;

interface CacheEntry {
  agent: Agent;
  lastAccessedAt: number;
}

export class MainAgentStore {
  private static instance: MainAgentStore | null = null;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly loadingPromises = new Map<
    string,
    Promise<Agent | undefined>
  >();
  private readonly _sessionsDir: string;

  private readonly onAgentCreated = (agent: Agent): void => {
    this.set(agent);
  };

  private constructor(sessionsDir: string) {
    this._sessionsDir = sessionsDir;
  }

  get sessionsDir(): string {
    return this._sessionsDir;
  }

  /** Returns the singleton instance. */
  static getInstance(): MainAgentStore {
    assert(
      MainAgentStore.instance !== null,
      'MainAgentStore is not initialized. Call MainAgentStore.create() first.',
    );
    return MainAgentStore.instance;
  }

  /** Creates the singleton instance and subscribes to agent events. */
  static create(sessionsDir: string): MainAgentStore {
    assert(
      MainAgentStore.instance === null,
      'MainAgentStore is already initialized.',
    );
    const store = new MainAgentStore(sessionsDir);
    MainAgentStore.instance = store;
    agentEventBus.on('agent-created', store.onAgentCreated);
    return store;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    if (MainAgentStore.instance) {
      agentEventBus.off(
        'agent-created',
        MainAgentStore.instance.onAgentCreated,
      );
    }
    MainAgentStore.instance = null;
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

  /** Removes an agent from memory and deletes its session directory. */
  async delete(id: string): Promise<boolean> {
    this.cache.delete(id);
    const sessionDir = path.join(this._sessionsDir, id);
    try {
      await rm(sessionDir, {recursive: true, force: true});
      return true;
    } catch {
      return false;
    }
  }

  private async loadFromDisk(id: string): Promise<Agent | undefined> {
    if (!(await this.existsOnDisk(id))) return undefined;
    const agent = await MainAgent.restore(getLlmConfig, this._sessionsDir, id);
    const entry = this.cache.get(id);
    if (entry) entry.lastAccessedAt = Date.now();
    return agent;
  }

  private async existsOnDisk(id: string): Promise<boolean> {
    try {
      await access(MainAgent.snapshotPath(this._sessionsDir, id));
      return true;
    } catch {
      return false;
    }
  }

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
