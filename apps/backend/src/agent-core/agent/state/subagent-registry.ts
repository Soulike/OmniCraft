import assert from 'node:assert';

import {
  agentIdSchema,
  type SubAgentType,
  subAgentTypeSchema,
} from '@omnicraft/api-schema';

import type {Agent} from '../agent.js';
import {createNickname} from './nickname.js';

export const DEFAULT_MAX_LIVE_SUBAGENTS = 10;

const subagentIdSchema = agentIdSchema;

interface LiveSubagentRegistryEntry {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  readonly nickname: string;
  lastAccessOrder: number;
}

export interface LiveSubagentRecord {
  readonly id: string;
  readonly agentType: SubAgentType;
  readonly title: string;
  readonly nickname: string;
  readonly isRunning: boolean;
}

export interface LiveSubagentHandle {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  readonly nickname: string;
}

interface SubagentRegistryOptions {
  readonly maxEntries?: number;
}

export class SubagentRegistry {
  private readonly records = new Map<string, LiveSubagentRegistryEntry>();
  private readonly maxEntries: number;
  private accessOrder = 0;

  constructor(options: SubagentRegistryOptions = {}) {
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_LIVE_SUBAGENTS;
  }

  // The nickname is trusted to be unique among live entries; the registry
  // enforces no uniqueness here. Obtain one from generateNickname() to guarantee it.
  register(agent: Agent, agentType: SubAgentType, nickname: string): void {
    assert(
      nickname !== '' && nickname === nickname.trim(),
      'subagent nickname must be non-empty and have no surrounding whitespace',
    );
    const id = subagentIdSchema.parse(agent.id);
    const parsedAgentType = subAgentTypeSchema.parse(agentType);
    this.records.set(id, {
      agent,
      agentType: parsedAgentType,
      nickname,
      lastAccessOrder: this.nextAccessOrder(),
    });
    this.evictIfNeeded();
  }

  generateNickname(): string {
    const taken = new Set<string>();
    for (const entry of this.records.values()) {
      taken.add(entry.nickname);
    }
    return createNickname(taken);
  }

  get(id: string): LiveSubagentHandle | undefined {
    const parsedId = subagentIdSchema.safeParse(id);
    if (!parsedId.success) return undefined;

    const entry = this.records.get(parsedId.data);
    if (!entry) {
      return undefined;
    }

    entry.lastAccessOrder = this.nextAccessOrder();
    return {
      agent: entry.agent,
      agentType: entry.agentType,
      nickname: entry.nickname,
    };
  }

  getByNickname(nickname: string): LiveSubagentHandle | undefined {
    for (const entry of this.records.values()) {
      if (entry.nickname !== nickname) continue;
      // Resolving an entry counts as an access, bumping lastAccessOrder so the
      // looked-up entry is protected from eviction, mirroring get().
      entry.lastAccessOrder = this.nextAccessOrder();
      return {
        agent: entry.agent,
        agentType: entry.agentType,
        nickname: entry.nickname,
      };
    }
    return undefined;
  }

  list(): LiveSubagentRecord[] {
    return [...this.records.values()].map((entry) => ({
      id: entry.agent.id,
      agentType: entry.agentType,
      title: entry.agent.title,
      nickname: entry.nickname,
      isRunning: entry.agent.isRunning,
    }));
  }

  clear(): void {
    this.records.clear();
  }

  private nextAccessOrder(): number {
    this.accessOrder += 1;
    return this.accessOrder;
  }

  private evictIfNeeded(): void {
    if (this.records.size <= this.maxEntries) return;

    const entries = [...this.records.entries()]
      .filter(([, entry]) => this.isEvictable(entry))
      .sort((a, b) => a[1].lastAccessOrder - b[1].lastAccessOrder);

    for (const [id] of entries) {
      if (this.records.size <= this.maxEntries) break;
      this.records.delete(id);
    }
  }

  private isEvictable(entry: LiveSubagentRegistryEntry): boolean {
    return !entry.agent.isRunning && entry.agent.sseLog.activeReaderCount === 0;
  }
}
