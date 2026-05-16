import crypto from 'node:crypto';
import {realpathSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {agentWorkingDirectoryService} from './agent-working-directory-service.js';

const tmpDirsToCleanup = new Set<string>();

afterEach(() => {
  for (const dir of tmpDirsToCleanup) {
    rmSync(dir, {recursive: true, force: true});
  }
  tmpDirsToCleanup.clear();
});

describe('AgentWorkingDirectoryService', () => {
  it('creates an owner-only real directory for a valid agent id', () => {
    const agentId = crypto.randomUUID();
    const expected = path.join(realpathSync(os.tmpdir()), agentId);
    tmpDirsToCleanup.add(expected);

    const dir =
      agentWorkingDirectoryService.createDefaultWorkingDirectory(agentId);

    expect(dir).toBe(expected);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('rejects non-UUID ids before building a tmp path', () => {
    expect(() =>
      agentWorkingDirectoryService.createDefaultWorkingDirectory('../escape'),
    ).toThrow();
  });
});
