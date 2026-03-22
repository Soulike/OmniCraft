import assert from 'node:assert';

import type {Agent} from '@/agents/types.js';
import {eventBus} from '@/events/index.js';

/**
 * In-memory store for agent instances, keyed by agent id.
 * Currently a simple Map wrapper. Can be extended with disk-backed
 * lazy loading for persistence in a future version.
 */
export class AgentStore {
  private static instance: AgentStore | null = null;

  private readonly agents = new Map<string, Agent>();

  /** Returns the singleton instance. */
  static getInstance(): AgentStore {
    assert(
      AgentStore.instance !== null,
      'AgentStore is not initialized. Call AgentStore.create() first.',
    );
    return AgentStore.instance;
  }

  /** Creates the singleton instance and subscribes to agent events. */
  static create(): AgentStore {
    assert(AgentStore.instance === null, 'AgentStore is already initialized.');
    AgentStore.instance = new AgentStore();
    eventBus.on('agent-created', (agent) => {
      AgentStore.instance?.set(agent);
    });
    return AgentStore.instance;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    AgentStore.instance = null;
  }

  /** Registers an agent in the store. */
  set(agent: Agent): void {
    this.agents.set(agent.id, agent);
  }

  /** Retrieves an agent by id, or undefined if not found. */
  get(id: string): Agent | undefined {
    return this.agents.get(id);
  }

  /** Removes an agent from the store. */
  delete(id: string): boolean {
    return this.agents.delete(id);
  }

  /** Checks whether an agent with the given id exists. */
  has(id: string): boolean {
    return this.agents.has(id);
  }
}
