import crypto from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {sseEventSchema} from '@omnicraft/sse-events';

import type {AgentSnapshot} from './types.js';
import {agentSnapshotSchema} from './types.js';

export const agentPersistence = {
  snapshotPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'snapshot.json');
  },

  metadataPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'metadata.json');
  },

  eventsPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'sse-events.jsonl');
  },

  async persistSnapshot(
    sessionsDir: string,
    id: string,
    snapshot: AgentSnapshot,
  ): Promise<void> {
    const dir = path.join(sessionsDir, id);
    await mkdir(dir, {recursive: true});

    const snapshotFile = agentPersistence.snapshotPath(sessionsDir, id);
    const snapshotTmp = `${snapshotFile}.${crypto.randomUUID()}.tmp`;
    const snapshotData = JSON.stringify(snapshot, null, 2) + '\n';
    await writeFile(snapshotTmp, snapshotData);
    await rename(snapshotTmp, snapshotFile);

    const metadataFile = agentPersistence.metadataPath(sessionsDir, id);
    const metadataTmp = `${metadataFile}.${crypto.randomUUID()}.tmp`;
    const metadataData =
      JSON.stringify({id: snapshot.id, title: snapshot.title}, null, 2) + '\n';
    await writeFile(metadataTmp, metadataData);
    await rename(metadataTmp, metadataFile);
  },

  async loadSnapshot(sessionsDir: string, id: string): Promise<AgentSnapshot> {
    const filePath = agentPersistence.snapshotPath(sessionsDir, id);
    const content = await readFile(filePath, 'utf-8');
    const json: unknown = JSON.parse(content);
    return agentSnapshotSchema.parse(json);
  },

  async reconcileEventsFile(
    sessionsDir: string,
    id: string,
    sseEventCount: number,
  ): Promise<void> {
    const filePath = agentPersistence.eventsPath(sessionsDir, id);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (
        error instanceof Error &&
        'code' in error &&
        error.code === 'ENOENT'
      ) {
        return;
      }
      throw error;
    }

    if (content === '') return;

    const lines = content.split('\n');
    const validEvents: string[] = [];
    for (const line of lines) {
      if (line === '') continue;
      if (validEvents.length >= sseEventCount) break;
      try {
        const parsed: unknown = JSON.parse(line);
        sseEventSchema.parse(parsed);
        validEvents.push(line);
      } catch {
        break;
      }
    }

    const targetCount = Math.min(validEvents.length, sseEventCount);
    const truncated = validEvents.slice(0, targetCount);
    const nonEmptyLines = lines.filter((l) => l !== '');

    if (
      truncated.length !== nonEmptyLines.length ||
      truncated.some((line, i) => line !== nonEmptyLines[i])
    ) {
      await writeFile(filePath, truncated.map((line) => line + '\n').join(''));
    }
  },
};
