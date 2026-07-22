import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {AgentSseLog} from '@/agent-core/agent/events/agent-sse-log.js';
import type {Agent} from '@/agent-core/agent/index.js';

import {CodingAgentStore} from './coding-agent-store.js';

function createMockAgent(
  id: string,
  isRunning: boolean,
  isWaitingForInput = false,
): Agent {
  const sseLog = new AgentSseLog();
  Object.defineProperty(sseLog, 'activeReaderCount', {get: () => 0});
  return {id, isRunning, isWaitingForInput, sseLog} as Agent;
}

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
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-test-'));
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('marks isRunning true only for cached running agents', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const runningId = crypto.randomUUID();
    const idleId = crypto.randomUUID();
    await writeSnapshot(sessionsDir, runningId, {id: runningId, title: 'Run'});
    await writeSnapshot(sessionsDir, idleId, {id: idleId, title: 'Idle'});
    store.set(createMockAgent(runningId, true));
    store.set(createMockAgent(idleId, false));

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
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-wait-'));
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('getWaitingIds returns exactly the waiting agents', () => {
    const store = CodingAgentStore.create(sessionsDir);
    const waitingId = crypto.randomUUID();
    const runningId = crypto.randomUUID();
    const idleId = crypto.randomUUID();
    store.set(createMockAgent(waitingId, true, true));
    store.set(createMockAgent(runningId, true, false));
    store.set(createMockAgent(idleId, false, false));

    expect(store.getWaitingIds()).toEqual(new Set([waitingId]));
  });

  it('marks isWaitingForInput true only for cached waiting agents', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const waitingId = crypto.randomUUID();
    const runningId = crypto.randomUUID();
    await writeSnapshot(sessionsDir, waitingId, {id: waitingId, title: 'Wait'});
    await writeSnapshot(sessionsDir, runningId, {id: runningId, title: 'Run'});
    store.set(createMockAgent(waitingId, true, true));
    store.set(createMockAgent(runningId, true, false));

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
