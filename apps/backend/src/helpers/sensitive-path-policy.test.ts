import path from 'node:path';

import {describe, expect, it} from 'vitest';

import {
  checkSensitivePathAccess,
  createSensitivePathPolicy,
} from './sensitive-path-policy.js';

describe('sensitive-path-policy', () => {
  const root = path.join(path.sep, 'tmp', 'policy-test');
  const homeDir = path.join(root, 'home');
  const dataDir = path.join(root, 'data');
  const policy = createSensitivePathPolicy({homeDir, dataDir});

  it('blocks configured home sensitive roots and app data dir', () => {
    const sshKey = path.join(homeDir, '.ssh', 'id_ed25519');
    const appSettings = path.join(dataDir, 'settings.json');

    expect(checkSensitivePathAccess(sshKey, policy)).toEqual({
      allowed: false,
      blockedPath: path.join(homeDir, '.ssh'),
      reason: 'blocked-root',
    });
    expect(checkSensitivePathAccess(appSettings, policy)).toEqual({
      allowed: false,
      blockedPath: dataDir,
      reason: 'blocked-root',
    });
  });

  it('blocks VCS metadata segments but not sibling ignore files', () => {
    const gitConfig = path.join(root, 'project', '.git', 'config');
    const gitignore = path.join(root, 'project', '.gitignore');

    expect(checkSensitivePathAccess(gitConfig, policy)).toEqual({
      allowed: false,
      blockedPath: path.join(root, 'project', '.git'),
      reason: 'blocked-segment',
    });
    expect(checkSensitivePathAccess(gitignore, policy).allowed).toBe(true);
  });

  it('blocks env files except examples', () => {
    expect(
      checkSensitivePathAccess(path.join(root, '.env'), policy).allowed,
    ).toBe(false);
    expect(
      checkSensitivePathAccess(path.join(root, '.env.local'), policy).allowed,
    ).toBe(false);
    expect(
      checkSensitivePathAccess(path.join(root, '.env.example'), policy).allowed,
    ).toBe(true);
    expect(
      checkSensitivePathAccess(path.join(root, '.env.sample'), policy).allowed,
    ).toBe(true);
    expect(
      checkSensitivePathAccess(path.join(root, '.env.template'), policy)
        .allowed,
    ).toBe(true);
  });

  it('blocks credential filenames and private key extensions', () => {
    const blocked = [
      '.netrc',
      '.git-credentials',
      '.npmrc',
      '.pypirc',
      '.pgpass',
      '.my.cnf',
      '.bash_history',
      '.zsh_history',
      'credentials.json',
      'server.pem',
      'server.key',
      'cert.p12',
      'cert.pfx',
      'id_rsa',
      'id_ed25519',
      'my-service-account-prod.json',
    ];

    for (const basename of blocked) {
      expect(
        checkSensitivePathAccess(path.join(root, basename), policy).allowed,
      ).toBe(false);
    }
  });

  it('reports exact credential basenames as blocked-basename', () => {
    for (const basename of ['.netrc', 'credentials.json', 'id_ed25519']) {
      const targetPath = path.join(root, basename);

      expect(checkSensitivePathAccess(targetPath, policy)).toEqual({
        allowed: false,
        blockedPath: targetPath,
        reason: 'blocked-basename',
      });
    }
  });

  it('reports sensitive filename patterns as blocked-pattern', () => {
    for (const basename of [
      '.env.local',
      'server.pem',
      'my-service-account-prod.json',
    ]) {
      const targetPath = path.join(root, basename);

      expect(checkSensitivePathAccess(targetPath, policy)).toEqual({
        allowed: false,
        blockedPath: targetPath,
        reason: 'blocked-pattern',
      });
    }
  });
});
