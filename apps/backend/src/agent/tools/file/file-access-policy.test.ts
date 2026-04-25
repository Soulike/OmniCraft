import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  checkExistingFileAccess,
  checkNewFileAccess,
  isSymbolicLinkPath,
} from './file-access-policy.js';

describe('file-access-policy', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fap-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true, force: true});
  });

  it('detects symbolic links', async () => {
    const target = path.join(tempDir, 'target.txt');
    const link = path.join(tempDir, 'link.txt');
    await fs.writeFile(target, 'content');
    await fs.symlink(target, link);

    expect(await isSymbolicLinkPath(link)).toBe(true);
    expect(await isSymbolicLinkPath(target)).toBe(false);
  });

  it('blocks existing paths whose real target is blocked', async () => {
    const envFile = path.join(tempDir, '.env');
    const link = path.join(tempDir, 'env-link');
    await fs.writeFile(envFile, 'SECRET=value');
    await fs.symlink(envFile, link);

    const result = await checkExistingFileAccess(link);

    expect(result).toEqual({
      allowed: false,
      blockedPath: envFile,
      reason: 'blocked-pattern',
    });
  });

  it('blocks new paths through a symlinked parent when only the real target is blocked', async () => {
    const gitDir = path.join(tempDir, '.git');
    const linkToGit = path.join(tempDir, 'link-to-git');
    await fs.mkdir(gitDir);
    await fs.symlink(gitDir, linkToGit, 'dir');

    const result = await checkNewFileAccess(path.join(linkToGit, 'new-config'));

    expect(result.allowed).toBe(false);
  });
});
