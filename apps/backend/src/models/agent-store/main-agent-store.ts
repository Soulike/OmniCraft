import assert from 'node:assert';
import {access, readdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';

import {
  type SessionMetadata,
  sessionMetadataSchema,
} from '@omnicraft/api-schema';

import {MainAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import {agentPersistence} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';
import {isFileNotFoundError} from '@/helpers/fs.js';
import {logger} from '@/logger.js';

import {AgentStore} from './agent-store.js';

export class MainAgentStore extends AgentStore {
  private static instance: MainAgentStore | null = null;

  private readonly onAgentCreated = (agent: Agent): void => {
    if (agent instanceof MainAgent) {
      this.set(agent);
    }
  };

  private constructor(sessionsDir: string) {
    super(sessionsDir);
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

  async listSessionMetadata(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    let entries: string[];
    try {
      entries = await readdir(this.sessionsDir);
    } catch {
      return {sessions: [], total: 0};
    }

    // Phase 1: stat all snapshot files to get mtime for sorting.
    const statResults: {id: string; mtime: number}[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const fileStat = await stat(
            agentPersistence.snapshotPath(this.sessionsDir, entry),
          );
          statResults.push({id: entry, mtime: fileStat.mtimeMs});
        } catch (e) {
          logger.warn(
            {err: e, sessionId: entry},
            'Failed to stat session snapshot',
          );
        }
      }),
    );

    statResults.sort((a, b) => b.mtime - a.mtime);
    const total = statResults.length;
    const page = statResults.slice(offset, offset + limit);

    // Phase 2: read metadata (or snapshot as fallback) for the requested page.
    const results = await Promise.all(
      page.map(async ({id}): Promise<SessionMetadata | null> => {
        try {
          const content = await this.readSessionMetadataFile(id);
          const json: unknown = JSON.parse(content);
          return sessionMetadataSchema.parse(json);
        } catch (e) {
          logger.warn({err: e, sessionId: id}, 'Skipping unreadable session');
          return null;
        }
      }),
    );

    const sessions = results.filter((r): r is SessionMetadata => r !== null);

    return {sessions, total};
  }

  protected async loadFromDisk(id: string): Promise<Agent | undefined> {
    if (!(await this.existsOnDisk(id))) return undefined;
    return MainAgent.restore(this.sessionsDir, id);
  }

  protected async existsOnDisk(id: string): Promise<boolean> {
    try {
      await access(agentPersistence.snapshotPath(this.sessionsDir, id));
      return true;
    } catch {
      return false;
    }
  }

  protected async deleteFromDisk(id: string): Promise<boolean> {
    const sessionDir = path.join(this.sessionsDir, id);
    try {
      await rm(sessionDir, {recursive: true, force: true});
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Reads session metadata from metadata.json, falling back to snapshot.json
   * for sessions created before the sidecar file was introduced.
   */
  private async readSessionMetadataFile(id: string): Promise<string> {
    try {
      return await readFile(
        agentPersistence.metadataPath(this.sessionsDir, id),
        'utf-8',
      );
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        return readFile(
          agentPersistence.snapshotPath(this.sessionsDir, id),
          'utf-8',
        );
      }
      throw error;
    }
  }
}
