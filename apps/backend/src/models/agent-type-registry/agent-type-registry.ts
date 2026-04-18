import assert from 'node:assert';

import type {AgentType} from '@omnicraft/api-schema';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import type {Agent} from '@/agent-core/agent/index.js';

/** Minimal store interface consumed by the agent-session service. */
export interface AgentSessionStore {
  readonly sessionsDir: string;
  get(id: string): Promise<Agent | undefined>;
  has(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  listSessionMetadata(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}>;
}

/** Constructor signature shared by all top-level agent classes. */
export type AgentConstructor = new (
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
  sessionsDir?: string,
) => Agent;

interface AgentTypeConfig {
  agentConstructor: AgentConstructor;
  store: AgentSessionStore;
}

/**
 * Maps each {@link AgentType} to its constructor and store.
 * Populated once during server startup.
 */
class AgentTypeRegistry {
  private readonly configs = new Map<AgentType, AgentTypeConfig>();

  /** Registers an agent type with its constructor and store. */
  register(
    type: AgentType,
    agentConstructor: AgentConstructor,
    store: AgentSessionStore,
  ): void {
    this.configs.set(type, {agentConstructor, store});
  }

  /** Returns the config for a registered agent type. Throws if not registered. */
  get(type: AgentType): AgentTypeConfig {
    const config = this.configs.get(type);
    assert(config, `No agent type registered: ${type}`);
    return config;
  }
}

export const agentTypeRegistry = new AgentTypeRegistry();
