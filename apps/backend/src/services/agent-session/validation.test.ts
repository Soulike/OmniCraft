import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';
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

  const makeAllowed = (...entries: AllowedPathEntry[]) => entries;

  it('returns null for valid workspace', async () => {
    const allowed = makeAllowed({path: tempDir, mode: 'read-write'});
    const result = await validateSessionPaths(tempDir, allowed);
    expect(result).toBeNull();
  });

  it('returns WORKSPACE_PATH_NOT_FOUND for non-existent workspace', async () => {
    const allowed = makeAllowed({path: '/nonexistent', mode: 'read-write'});
    const result = await validateSessionPaths('/nonexistent', allowed);
    expect(result).toBe(CreateSessionError.WORKSPACE_PATH_NOT_FOUND);
  });

  it('returns WORKSPACE_NOT_IN_ALLOWED_PATHS for workspace not in list', async () => {
    const allowed = makeAllowed({path: '/some/other', mode: 'read-write'});
    const result = await validateSessionPaths(tempDir, allowed);
    expect(result).toBe(CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS);
  });

  it('returns WORKSPACE_NOT_READ_WRITE for read-only workspace', async () => {
    const allowed = makeAllowed({path: tempDir, mode: 'read'});
    const result = await validateSessionPaths(tempDir, allowed);
    expect(result).toBe(CreateSessionError.WORKSPACE_NOT_READ_WRITE);
  });
});
