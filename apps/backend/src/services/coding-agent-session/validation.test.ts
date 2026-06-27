import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {Workspace} from '@omnicraft/settings-schema';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

describe('validateSessionPaths', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-validation-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true});
  });

  const makeWorkspaces = (...entries: Workspace[]) => entries;

  it('returns null for valid workspace', async () => {
    const workspaces = makeWorkspaces({path: tempDir});
    const result = await validateSessionPaths(tempDir, workspaces);
    expect(result).toBeNull();
  });

  it('returns WORKSPACE_PATH_NOT_FOUND for non-existent workspace', async () => {
    const workspaces = makeWorkspaces({path: '/nonexistent'});
    const result = await validateSessionPaths('/nonexistent', workspaces);
    expect(result).toBe(CreateSessionError.WORKSPACE_PATH_NOT_FOUND);
  });

  it('returns WORKSPACE_NOT_CONFIGURED for workspace not in list', async () => {
    const workspaces = makeWorkspaces({path: '/some/other'});
    const result = await validateSessionPaths(tempDir, workspaces);
    expect(result).toBe(CreateSessionError.WORKSPACE_NOT_CONFIGURED);
  });
});
