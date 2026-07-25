import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {agentPersistence} from '../persistence/agent-persistence.js';
import {agentAttachmentStore} from './agent-attachment-store.js';

// The 8-byte PNG signature alone doesn't sniff as `image/png` — `file-type`
// (the real sniffer `agentAttachmentStore.save` uses) also expects the IHDR
// chunk header that follows it. Extended past the brief's literal so this
// test exercises a genuine save rather than one `save()` rejects outright.
const PNG = Buffer.concat([
  Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
    0x49, 0x48, 0x44, 0x52,
  ]),
  Buffer.alloc(512),
]);

const AGENT_ID = '11111111-1111-4111-8111-111111111111';

let sessionsDir: string;

beforeEach(async () => {
  sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'attach-e2e-'));
});

afterEach(async () => {
  await rm(sessionsDir, {recursive: true, force: true});
});

describe('attachment round trip', () => {
  it('stores bytes at the documented path and keeps base64 out of the snapshot', async () => {
    const scratchDirectory = agentPersistence.scratchPath(
      sessionsDir,
      AGENT_ID,
    );
    const saved = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      Readable.from([PNG]),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    // The bytes land exactly where attachmentsPath advertises.
    const expectedPath = path.join(
      agentPersistence.attachmentsPath(sessionsDir, AGENT_ID),
      'shot.png',
    );
    expect((await readFile(expectedPath)).equals(PNG)).toBe(true);

    const snapshot = {
      id: AGENT_ID,
      title: 'T',
      sseEventCount: 0,
      todos: [],
      options: {},
      llmSession: {
        id: 'sess',
        messages: [
          {
            id: 'u1',
            createdAt: 1,
            role: 'user',
            content: 'look',
            attachments: [saved.attachment],
          },
        ],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: {
          currentContextInputTokens: 0,
          latestCallOutputTokens: 0,
          sessionInputTokens: 0,
          sessionOutputTokens: 0,
          sessionCacheReadInputTokens: 0,
        },
      },
    };

    await agentPersistence.persistSnapshot(
      sessionsDir,
      AGENT_ID,
      snapshot as never,
    );
    const written = await readFile(
      agentPersistence.snapshotPath(sessionsDir, AGENT_ID),
      'utf-8',
    );

    expect(written).toContain('"fileName": "shot.png"');
    expect(written).not.toContain(PNG.toString('base64').slice(0, 32));

    const loaded = await agentPersistence.loadSnapshot(sessionsDir, AGENT_ID);
    expect(loaded.llmSession.messages[0]).toMatchObject({
      attachments: [
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: PNG.length},
      ],
    });
  });
});
