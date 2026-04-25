import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  createSensitivePathPolicy,
  type SensitivePathPolicy,
} from '@/helpers/sensitive-path-policy.js';

import {
  checkExistingFileAccess,
  checkLexicalFileAccess,
  checkNewFileAccess,
  getFileAccessPolicyGlobIgnorePatterns,
  hasFileAccessPolicyIgnoredDescendant,
  isAllowedOsRootAliasSymlinkPath,
  isPathThroughSymbolicLink,
  isSymbolicLinkPath,
} from './file-access-policy.js';

describe('file-access-policy', () => {
  const originalDataDir = process.env.DATA_DIR;
  let tempDir: string;
  let testPolicy: SensitivePathPolicy;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'fap-test-'));
    testPolicy = createSensitivePathPolicy({
      homeDir: path.join(tempDir, '..', 'explicit-home'),
      dataDir: path.join(tempDir, '..', 'explicit-data'),
    });
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

  it('detects paths under a symlinked base directory', async () => {
    const realWorkspace = path.join(tempDir, 'real-workspace');
    const workspaceLink = path.join(tempDir, 'workspace-link');
    const childPath = path.join(workspaceLink, 'sub', 'file.ts');
    await fs.mkdir(path.join(realWorkspace, 'sub'), {recursive: true});
    await fs.writeFile(path.join(realWorkspace, 'sub', 'file.ts'), '');
    await fs.symlink(realWorkspace, workspaceLink, 'dir');

    expect(await isPathThroughSymbolicLink(workspaceLink, childPath)).toBe(
      true,
    );
  });

  it('detects paths whose base is below a symlinked ancestor', async () => {
    const realWorkspace = path.join(tempDir, 'real-workspace');
    const workspaceLink = path.join(tempDir, 'workspace-link');
    const baseDir = path.join(workspaceLink, 'sub');
    const childPath = path.join(baseDir, 'file.ts');
    await fs.mkdir(path.join(realWorkspace, 'sub'), {recursive: true});
    await fs.writeFile(path.join(realWorkspace, 'sub', 'file.ts'), '');
    await fs.symlink(realWorkspace, workspaceLink, 'dir');

    expect(await isPathThroughSymbolicLink(baseDir, childPath)).toBe(true);
  });

  it('detects paths through a symlinked intermediate component', async () => {
    const targetDir = path.join(tempDir, 'target');
    const linkDir = path.join(tempDir, 'link');
    const childPath = path.join(linkDir, 'file.ts');
    await fs.mkdir(targetDir);
    await fs.writeFile(path.join(targetDir, 'file.ts'), '');
    await fs.symlink(targetDir, linkDir, 'dir');

    expect(await isPathThroughSymbolicLink(tempDir, childPath)).toBe(true);
  });

  it('allows normal paths under a normal base directory', async () => {
    const childPath = path.join(tempDir, 'sub', 'file.ts');
    await fs.mkdir(path.dirname(childPath), {recursive: true});
    await fs.writeFile(childPath, '');

    expect(await isPathThroughSymbolicLink(tempDir, childPath)).toBe(false);
  });

  it('does not treat normal temp paths as symlinked solely because of OS root aliases', async () => {
    const tempWorkspace = await fs.mkdtemp(path.join(os.tmpdir(), 'fap-os-'));
    try {
      const childPath = path.join(tempWorkspace, 'sub', 'file.ts');
      await fs.mkdir(path.dirname(childPath), {recursive: true});
      await fs.writeFile(childPath, '');

      expect(await isPathThroughSymbolicLink(tempWorkspace, childPath)).toBe(
        false,
      );
    } finally {
      await fs.rm(tempWorkspace, {recursive: true, force: true});
    }
  });

  it('only allows known OS-managed root alias symlinks', () => {
    const allowsMacOsAliases = process.platform === 'darwin';

    expect(isAllowedOsRootAliasSymlinkPath('/var', '/private/var')).toBe(
      allowsMacOsAliases,
    );
    expect(isAllowedOsRootAliasSymlinkPath('/tmp', '/private/tmp')).toBe(
      allowsMacOsAliases,
    );
    expect(
      isAllowedOsRootAliasSymlinkPath('/workspace-link', '/real-workspace'),
    ).toBe(false);
    expect(isAllowedOsRootAliasSymlinkPath('/var', '/elsewhere/var')).toBe(
      false,
    );
  });

  it('returns glob ignores for blocked segments and descendant blocked roots', () => {
    const blockedRoot = path.join(tempDir, 'nested', 'sensitive-root');
    const policy: SensitivePathPolicy = {
      ...testPolicy,
      blockedRoots: [blockedRoot],
    };

    expect(getFileAccessPolicyGlobIgnorePatterns(tempDir, policy)).toEqual(
      expect.arrayContaining([
        '.git',
        '.git/**',
        '**/.git',
        '**/.git/**',
        'nested/sensitive-root',
        'nested/sensitive-root/**',
      ]),
    );
  });

  it('detects existing descendants that policy glob ignores would prune', async () => {
    const blockedRoot = path.join(tempDir, 'nested', 'sensitive-root');
    const policy: SensitivePathPolicy = {
      ...testPolicy,
      blockedRoots: [blockedRoot],
    };
    await fs.mkdir(path.join(tempDir, '.git'), {recursive: true});
    await fs.writeFile(path.join(tempDir, '.git', 'config'), '[core]');
    await fs.mkdir(blockedRoot, {recursive: true});

    expect(
      await hasFileAccessPolicyIgnoredDescendant(tempDir, '**/*', policy),
    ).toBe(true);
  });

  it('does not report ignored descendants outside the active glob scope', async () => {
    await fs.mkdir(path.join(tempDir, '.git'), {recursive: true});
    await fs.writeFile(path.join(tempDir, '.git', 'config'), '[core]');
    await fs.mkdir(path.join(tempDir, 'src'), {recursive: true});
    await fs.writeFile(path.join(tempDir, 'src', 'app.ts'), '');

    expect(
      await hasFileAccessPolicyIgnoredDescendant(
        tempDir,
        'src/*.ts',
        testPolicy,
      ),
    ).toBe(false);
  });

  it('blocks existing paths whose real target is blocked', async () => {
    const envFile = path.join(tempDir, '.env');
    const link = path.join(tempDir, 'env-link');
    await fs.writeFile(envFile, 'SECRET=value');
    await fs.symlink(envFile, link);

    const result = await checkExistingFileAccess(link, testPolicy);

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
    await fs.writeFile(envFile, 'SECRET=value');
    await fs.symlink(envFile, link);

    const result = await checkExistingFileAccess(link, testPolicy);

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

    const result = await checkNewFileAccess(
      path.join(linkToGit, 'new-config'),
      testPolicy,
    );

    expect(result.allowed).toBe(false);
  });

  it('uses an explicit policy for lexical and new file checks', async () => {
    process.env.DATA_DIR = os.tmpdir();
    const newEnvFile = path.join(tempDir, 'nested', '.env.local');

    expect(
      checkLexicalFileAccess(path.join(tempDir, 'safe.txt'), testPolicy),
    ).toEqual({
      allowed: true,
    });
    expect(await checkNewFileAccess(newEnvFile, testPolicy)).toEqual({
      allowed: false,
      blockedPath: newEnvFile,
      reason: 'blocked-pattern',
    });
  });
});
