import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {createSensitivePathPolicy} from '@/helpers/sensitive-path-policy.js';

import {
  checkExistingFileAccess,
  checkLexicalFileAccess,
  checkNewFileAccess,
  isSymbolicLinkPath,
} from './file-access-policy.js';

describe('file-access-policy', () => {
  const originalDataDir = process.env.DATA_DIR;
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fap-test-'));
  });

  afterEach(async () => {
    if (originalDataDir === undefined) {
      delete process.env.DATA_DIR;
    } else {
      process.env.DATA_DIR = originalDataDir;
    }
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

  it('uses an explicit policy instead of ambient DATA_DIR for existing file checks', async () => {
    process.env.DATA_DIR = os.tmpdir();
    const envFile = path.join(tempDir, '.env');
    const link = path.join(tempDir, 'env-link');
    const policy = createSensitivePathPolicy({
      homeDir: path.join(tempDir, '..', 'explicit-home'),
      dataDir: path.join(tempDir, '..', 'explicit-data'),
    });
    await fs.writeFile(envFile, 'SECRET=value');
    await fs.symlink(envFile, link);

    const result = await checkExistingFileAccess(link, policy);

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

  it('uses an explicit policy for lexical and new file checks', async () => {
    process.env.DATA_DIR = os.tmpdir();
    const policy = createSensitivePathPolicy({
      homeDir: path.join(tempDir, '..', 'explicit-home'),
      dataDir: path.join(tempDir, '..', 'explicit-data'),
    });
    const newEnvFile = path.join(tempDir, 'nested', '.env.local');

    expect(
      checkLexicalFileAccess(path.join(tempDir, 'safe.txt'), policy),
    ).toEqual({
      allowed: true,
    });
    expect(await checkNewFileAccess(newEnvFile, policy)).toEqual({
      allowed: false,
      blockedPath: newEnvFile,
      reason: 'blocked-pattern',
    });
  });
});
