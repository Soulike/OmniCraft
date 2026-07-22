import assert from 'node:assert';
import type {Dirent} from 'node:fs';
import {access, readdir, readFile, rm, stat} from 'node:fs/promises';
import path from 'node:path';

import {
  type SessionMetadata,
  sessionMetadataSchema,
} from '@omnicraft/api-schema';

import {CodingAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import {agentPersistence} from '@/agent-core/agent/index.js';
import {agentEventBus} from '@/agent-core/events/index.js';
import {isFileNotFoundError} from '@/helpers/fs.js';
import {logger} from '@/logger.js';

import {AgentStore} from './agent-store.js';

export class CodingAgentStore extends AgentStore {
  private static instance: CodingAgentStore | null = null;

  private readonly onAgentCreated = (agent: Agent): void => {
    if (agent instanceof CodingAgent) {
      this.set(agent);
    }
  };

  private constructor(sessionsDir: string) {
    super(sessionsDir);
  }

  /** Returns the singleton instance. */
  static getInstance(): CodingAgentStore {
    assert(
      CodingAgentStore.instance !== null,
      'CodingAgentStore is not initialized. Call CodingAgentStore.create() first.',
    );
    return CodingAgentStore.instance;
  }

  /** Creates the singleton instance and subscribes to agent events. */
  static create(sessionsDir: string): CodingAgentStore {
    assert(
      CodingAgentStore.instance === null,
      'CodingAgentStore is already initialized.',
    );
    const store = new CodingAgentStore(sessionsDir);
    CodingAgentStore.instance = store;
    agentEventBus.on('agent-created', store.onAgentCreated);
    return store;
  }

  /** Resets the singleton instance. Only for use in tests. */
  static resetInstance(): void {
    if (CodingAgentStore.instance) {
      agentEventBus.off(
        'agent-created',
        CodingAgentStore.instance.onAgentCreated,
      );
    }
    CodingAgentStore.instance = null;
  }

  async listSessionMetadata(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    let entries: Dirent[];
    try {
      entries = await readdir(this.sessionsDir, {withFileTypes: true});
    } catch {
      return {sessions: [], total: 0};
    }

    // A session is a directory; skip stray entries (e.g. macOS `.DS_Store`).
    const statResults: {id: string; mtime: number}[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        if (!entry.isDirectory()) return;
        const id = entry.name;
        try {
          const fileStat = await stat(
            agentPersistence.snapshotPath(this.sessionsDir, id),
          );
          statResults.push({id, mtime: fileStat.mtimeMs});
        } catch (e) {
          logger.warn(
            {err: e, sessionId: id},
            'Failed to stat session snapshot',
          );
        }
      }),
    );

    statResults.sort((a, b) => b.mtime - a.mtime);
    const total = statResults.length;
    const page = statResults.slice(offset, offset + limit);

    const running = this.getRunningIds();
    const waiting = this.getWaitingIds();
    const results = await Promise.all(
      page.map(async ({id, mtime}): Promise<SessionMetadata | null> => {
        try {
          const content = await this.readSessionMetadataFile(id);
          const json: unknown = JSON.parse(content);
          return {
            ...sessionMetadataSchema.parse(json),
            updatedAt: mtime,
            isRunning: running.has(id),
            isWaitingForInput: waiting.has(id),
          };
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
    return CodingAgent.restore(this.sessionsDir, id);
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
