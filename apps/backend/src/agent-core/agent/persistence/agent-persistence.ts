import crypto from 'node:crypto';
import {mkdirSync, renameSync, writeFileSync} from 'node:fs';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {sseEventSchema} from '@omnicraft/sse-events';

import {isFileNotFoundError} from '@/helpers/fs.js';

import type {AgentSnapshot} from '../types.js';
import {agentSnapshotSchema} from '../types.js';

interface PersistSnapshotOptions {
  sync?: boolean;
}

class AgentPersistence {
  snapshotPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'snapshot.json');
  }

  metadataPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'metadata.json');
  }

  eventsPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'sse-events.jsonl');
  }

  persistSnapshot(
    sessionsDir: string,
    id: string,
    snapshot: AgentSnapshot,
    options: {sync: true},
  ): void;
  persistSnapshot(
    sessionsDir: string,
    id: string,
    snapshot: AgentSnapshot,
    options?: {sync?: false},
  ): Promise<void>;
  persistSnapshot(
    sessionsDir: string,
    id: string,
    snapshot: AgentSnapshot,
    options?: PersistSnapshotOptions,
  ): void | Promise<void> {
    const dir = path.join(sessionsDir, id);

    const snapshotFile = this.snapshotPath(sessionsDir, id);
    const snapshotTmp = `${snapshotFile}.${crypto.randomUUID()}.tmp`;
    const snapshotData = JSON.stringify(snapshot, null, 2) + '\n';

    const metadataFile = this.metadataPath(sessionsDir, id);
    const metadataTmp = `${metadataFile}.${crypto.randomUUID()}.tmp`;
    const metadataData =
      JSON.stringify(
        {
          id: snapshot.id,
          title: snapshot.title,
          workingDirectory: snapshot.options.workingDirectory,
        },
        null,
        2,
      ) + '\n';

    if (options?.sync) {
      mkdirSync(dir, {recursive: true});
      writeFileSync(snapshotTmp, snapshotData);
      renameSync(snapshotTmp, snapshotFile);
      writeFileSync(metadataTmp, metadataData);
      renameSync(metadataTmp, metadataFile);
      return;
    }

    return (async () => {
      await mkdir(dir, {recursive: true});
      await Promise.all([
        writeFile(snapshotTmp, snapshotData).then(() =>
          rename(snapshotTmp, snapshotFile),
        ),
        writeFile(metadataTmp, metadataData).then(() =>
          rename(metadataTmp, metadataFile),
        ),
      ]);
    })();
  }

  async loadSnapshot(sessionsDir: string, id: string): Promise<AgentSnapshot> {
    const filePath = this.snapshotPath(sessionsDir, id);
    const content = await readFile(filePath, 'utf-8');
    const json: unknown = JSON.parse(content);
    return agentSnapshotSchema.parse(json);
  }

  async reconcileEventsFile(
    sessionsDir: string,
    id: string,
    sseEventCount: number,
  ): Promise<void> {
    const filePath = this.eventsPath(sessionsDir, id);
    let content: string;
    try {
      content = await readFile(filePath, 'utf-8');
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
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
  }
}

export const agentPersistence = new AgentPersistence();
