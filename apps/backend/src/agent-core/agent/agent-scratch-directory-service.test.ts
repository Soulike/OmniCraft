import crypto from 'node:crypto';
import {mkdtempSync, realpathSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {agentScratchDirectoryService} from './agent-scratch-directory-service.js';

const tmpDirsToCleanup = new Set<string>();

afterEach(() => {
  for (const dir of tmpDirsToCleanup) {
    rmSync(dir, {recursive: true, force: true});
  }
  tmpDirsToCleanup.clear();
});

describe('AgentScratchDirectoryService', () => {
  it('creates a scratch dir under sessionsDir for a valid id', () => {
    const sessionsDir = realpathSync(
      mkdtempSync(path.join(os.tmpdir(), 'scratch-svc-')),
    );
    tmpDirsToCleanup.add(sessionsDir);
    const id = crypto.randomUUID();

    const dir = agentScratchDirectoryService.createScratchDirectory(
      sessionsDir,
      id,
    );

    expect(dir).toBe(path.join(sessionsDir, id, 'scratch'));
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('falls back to an owner-only tmp scratch dir when sessionsDir is null', () => {
    const id = crypto.randomUUID();
    const expected = path.join(realpathSync(os.tmpdir()), id, 'scratch');
    tmpDirsToCleanup.add(path.join(realpathSync(os.tmpdir()), id));

    const dir = agentScratchDirectoryService.createScratchDirectory(null, id);

    expect(dir).toBe(expected);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('rejects non-UUID ids before building a path', () => {
    expect(() =>
      agentScratchDirectoryService.createScratchDirectory(null, '../escape'),
    ).toThrow();
  });
});
