import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CodingAgentStore} from '@/models/agent-store/index.js';

import {codingAgentSessionService} from './coding-agent-session-service.js';

describe('codingAgentSessionService.listSessions', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-svc-test-'));
    CodingAgentStore.create(sessionsDir);
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('returns all sessions and no total field', async () => {
    const id = crypto.randomUUID();
    const dir = path.join(sessionsDir, id);
    await mkdir(dir, {recursive: true});
    await writeFile(
      path.join(dir, 'snapshot.json'),
      JSON.stringify({id, title: 'Task'}),
    );

    const result = await codingAgentSessionService.listSessions();

    expect(result).toEqual({sessions: [{id, title: 'Task'}]});
    expect(result).not.toHaveProperty('total');
  });
});
