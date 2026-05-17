import {type SubAgentType, subAgentTypeSchema} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {Agent} from '../agent.js';

export const DEFAULT_MAX_LIVE_SUBAGENTS = 10;

const subagentIdSchema = z.uuid();

interface LiveSubagentRegistryEntry {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  lastAccessedAt: number;
}

export interface LiveSubagentRecord {
  readonly id: string;
  readonly agentType: SubAgentType;
  readonly title: string;
  readonly isRunning: boolean;
}

export interface LiveSubagentHandle {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
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

  register(agent: Agent, agentType: SubAgentType): void {
    const id = subagentIdSchema.parse(agent.id);
    const parsedAgentType = subAgentTypeSchema.parse(agentType);
    this.records.set(id, {
      agent,
      agentType: parsedAgentType,
      lastAccessedAt: this.nextAccessOrder(),
    });
    this.evictIfNeeded();
  }

  get(id: string): LiveSubagentHandle | undefined {
    const parsedId = subagentIdSchema.parse(id);
    const entry = this.records.get(parsedId);
    if (!entry) {
      this.evictIfNeeded();
      return undefined;
    }

    entry.lastAccessedAt = this.nextAccessOrder();
    this.evictIfNeeded();
    return {agent: entry.agent, agentType: entry.agentType};
  }

  list(): LiveSubagentRecord[] {
    return [...this.records.values()].map((entry) => ({
      id: entry.agent.id,
      agentType: entry.agentType,
      title: entry.agent.title,
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
      .sort((a, b) => a[1].lastAccessedAt - b[1].lastAccessedAt);

    for (const [id] of entries) {
      if (this.records.size <= this.maxEntries) break;
      this.records.delete(id);
    }
  }

  private isEvictable(entry: LiveSubagentRegistryEntry): boolean {
    return !entry.agent.isRunning && entry.agent.sseLog.activeReaderCount === 0;
  }
}
