import {access, mkdtemp, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MainAgentStore} from '@/models/agent-store/index.js';
import {McpManager} from '@/models/mcp-manager/index.js';

import {chatAgentSessionService} from './chat-agent-session-service.js';

describe('chatAgentSessionService lifecycle', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    MainAgentStore.resetInstance();
    McpManager.create();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'chat-session-test-'));
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    MainAgentStore.resetInstance();
    McpManager.resetInstanceForTesting();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('does not enqueue or persist work after concurrent session deletion', async () => {
    const store = MainAgentStore.create(sessionsDir);
    const sessionId = store.createAgent();
    const claimStarted = Promise.withResolvers<undefined>();
    const resumeClaim = Promise.withResolvers<undefined>();

    await store.runAgentOperation(sessionId, (agent) => {
      vi.spyOn(agent, 'claimAttachments').mockImplementation(async () => {
        claimStarted.resolve(undefined);
        await resumeClaim.promise;
        return {ok: true, attachments: []};
      });
    });

    const completion = chatAgentSessionService.sendCompletion(
      sessionId,
      'hello',
      [],
    );
    await claimStarted.promise;

    let deletionFinished = false;
    const deletion = chatAgentSessionService
      .deleteSession(sessionId)
      .then((result) => {
        deletionFinished = true;
        return result;
      });
    await Promise.resolve();

    expect(deletionFinished).toBe(false);
    await expect(
      chatAgentSessionService.abortCompletion(sessionId),
    ).resolves.toBe(false);

    resumeClaim.resolve(undefined);
    await expect(completion).resolves.toEqual({ok: true});
    await expect(deletion).resolves.toBe(true);

    await new Promise<void>((resolve) => setImmediate(resolve));
    await expect(access(path.join(sessionsDir, sessionId))).rejects.toThrow();
  });
});
