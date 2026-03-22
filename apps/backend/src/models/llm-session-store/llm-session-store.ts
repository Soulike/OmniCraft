import assert from 'node:assert';

import {eventBus} from '@/events/index.js';
import {LlmSession} from '@/models/llm-session/index.js';

/**
 * In-memory store for LLM sessions, keyed by session id.
 * Currently a simple Map wrapper. Can be extended with disk-backed
 * lazy loading for persistence in a future version.
 */
export class LlmSessionStore {
  private static instance: LlmSessionStore | null = null;

  private readonly sessions = new Map<string, LlmSession>();

  /** Returns the singleton instance. */
  static getInstance(): LlmSessionStore {
    assert(
      LlmSessionStore.instance !== null,
      'LlmSessionStore is not initialized. Call LlmSessionStore.create() first.',
    );
    return LlmSessionStore.instance;
  }

  /** Creates the singleton instance and subscribes to session events. */
  static create(): LlmSessionStore {
    assert(
      LlmSessionStore.instance === null,
      'LlmSessionStore is already initialized.',
    );
    LlmSessionStore.instance = new LlmSessionStore();
    eventBus.on('llm-session-created', (session) => {
      LlmSessionStore.instance?.set(session);
    });
    return LlmSessionStore.instance;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    LlmSessionStore.instance = null;
  }

  /** Registers a session in the store. */
  set(session: LlmSession): void {
    this.sessions.set(session.id, session);
  }

  /** Retrieves a session by id, or undefined if not found. */
  get(id: string): LlmSession | undefined {
    return this.sessions.get(id);
  }

  /** Removes a session from the store. */
  delete(id: string): boolean {
    return this.sessions.delete(id);
  }

  /** Checks whether a session with the given id exists. */
  has(id: string): boolean {
    return this.sessions.has(id);
  }
}
