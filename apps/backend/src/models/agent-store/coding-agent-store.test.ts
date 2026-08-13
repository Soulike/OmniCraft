import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {McpManager} from '@/models/mcp-manager/index.js';

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

describe('CodingAgentStore.listSessionMetadata isRunning', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    McpManager.create();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    CodingAgentStore.resetInstance();
    McpManager.resetInstanceForTesting();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('marks isRunning true only for cached running agents', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const runningId = store.createAgent(sessionsDir);
    const idleId = store.createAgent(sessionsDir);
    await store.runAgentOperation(runningId, (agent) => {
      vi.spyOn(agent, 'isRunning', 'get').mockReturnValue(true);
    });

    const {sessions} = await store.listSessionMetadata(0, 100);
    const byId = new Map(sessions.map((s) => [s.id, s.isRunning]));
    expect(byId.get(runningId)).toBe(true);
    expect(byId.get(idleId)).toBe(false);
  });

  it('marks isRunning false when the session has no cached agent', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Cold'});

    const {sessions} = await store.listSessionMetadata(0, 100);
    expect(sessions[0].isRunning).toBe(false);
  });

  it('ignores non-directory entries (e.g. macOS .DS_Store)', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Valid'});
    await writeFile(path.join(sessionsDir, '.DS_Store'), 'junk');

    const {sessions, total} = await store.listSessionMetadata(0, 100);
    expect(total).toBe(1);
    expect(sessions.map((s) => s.id)).toEqual([id]);
  });
});

describe('CodingAgentStore waiting status', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    McpManager.create();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-wait-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    CodingAgentStore.resetInstance();
    McpManager.resetInstanceForTesting();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('marks isWaitingForInput true only for cached waiting agents', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const waitingId = store.createAgent(sessionsDir);
    const runningId = store.createAgent(sessionsDir);
    await store.runAgentOperation(waitingId, (agent) => {
      vi.spyOn(agent, 'isRunning', 'get').mockReturnValue(true);
      vi.spyOn(agent, 'isWaitingForInput', 'get').mockReturnValue(true);
    });
    await store.runAgentOperation(runningId, (agent) => {
      vi.spyOn(agent, 'isRunning', 'get').mockReturnValue(true);
    });

    const {sessions} = await store.listSessionMetadata(0, 100);
    const byId = new Map(sessions.map((s) => [s.id, s.isWaitingForInput]));
    expect(byId.get(waitingId)).toBe(true);
    expect(byId.get(runningId)).toBe(false);
  });

  it('marks isWaitingForInput false when the session has no cached agent', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Cold'});

    const {sessions} = await store.listSessionMetadata(0, 100);
    expect(sessions[0].isWaitingForInput).toBe(false);
  });
});
