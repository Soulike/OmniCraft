import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, utimes, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CodingAgentStore} from './coding-agent-store.js';

async function writeSnapshot(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(data));
}

async function writeMetadata(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(data));
}

describe('CodingAgentStore.listAllSessionMetadata', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-test-'));
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('returns an empty array when the directory is empty', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    expect(await store.listAllSessionMetadata()).toEqual([]);
  });

  it('returns every session (no pagination) sorted by mtime desc', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const olderId = crypto.randomUUID();
    const newerId = crypto.randomUUID();
    await writeSnapshot(sessionsDir, olderId, {id: olderId, title: 'Older'});
    await writeSnapshot(sessionsDir, newerId, {id: newerId, title: 'Newer'});
    const past = new Date(Date.now() - 60_000);
    const now = new Date();
    await utimes(path.join(sessionsDir, olderId, 'snapshot.json'), past, past);
    await utimes(path.join(sessionsDir, newerId, 'snapshot.json'), now, now);

    expect(await store.listAllSessionMetadata()).toEqual([
      {id: newerId, title: 'Newer'},
      {id: olderId, title: 'Older'},
    ]);
  });

  it('includes workingDirectory from metadata.json', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Snapshot'});
    await writeMetadata(sessionsDir, id, {
      id,
      title: 'Meta',
      workingDirectory: '/tmp/ws',
    });

    expect(await store.listAllSessionMetadata()).toEqual([
      {id, title: 'Meta', workingDirectory: '/tmp/ws'},
    ]);
  });
});
