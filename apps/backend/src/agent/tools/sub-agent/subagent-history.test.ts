import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  loadSubagentMetadata,
  persistSubagentMetadata,
  subagentMetadataPath,
} from './subagent-history.js';
import {SUB_AGENT_TYPE} from './subagent-types.js';

describe('subagent history metadata helpers', () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'subagent-history-'));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, {recursive: true, force: true});
  });

  it('computes the subagent sidecar metadata path', () => {
    expect(subagentMetadataPath(tmpDir, 'subagent-1')).toBe(
      path.join(tmpDir, 'subagent-1', 'subagent.json'),
    );
  });

  it.each([
    '',
    '.',
    '..',
    '../escape',
    '/tmp/escape',
    'nested/id',
    'nested\\id',
  ])('rejects unsafe subagent id %j', (subagentId) => {
    expect(() => subagentMetadataPath(tmpDir, subagentId)).toThrow(
      'Invalid subagent id',
    );
  });

  it('persists and loads subagent sidecar metadata', async () => {
    await persistSubagentMetadata(tmpDir, 'subagent-1', {
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 123,
    });

    await expect(
      fs.readFile(path.join(tmpDir, 'subagent-1', 'subagent.json'), 'utf-8'),
    ).resolves.toContain('"agentType": "explore"');

    await expect(loadSubagentMetadata(tmpDir, 'subagent-1')).resolves.toEqual({
      schemaVersion: 1,
      id: 'subagent-1',
      agentType: SUB_AGENT_TYPE.EXPLORE,
      createdAt: 123,
    });
  });

  it('rejects sidecar metadata whose id does not match the requested subagent', async () => {
    const metadataPath = subagentMetadataPath(tmpDir, 'subagent-2');
    await fs.mkdir(path.dirname(metadataPath), {recursive: true});
    await fs.writeFile(
      metadataPath,
      JSON.stringify({
        schemaVersion: 1,
        id: 'subagent-1',
        agentType: SUB_AGENT_TYPE.GENERAL,
        createdAt: 123,
      }),
    );

    await expect(loadSubagentMetadata(tmpDir, 'subagent-2')).rejects.toThrow(
      'Subagent metadata id mismatch: expected subagent-2, got subagent-1',
    );
  });
});
