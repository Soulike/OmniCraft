import path from 'node:path';

import {isSubPathOrSelf} from './path-helpers.js';

export type BlockedPathReason =
  | 'blocked-root'
  | 'blocked-segment'
  | 'blocked-basename'
  | 'blocked-pattern';

export type FileAccessPolicyResult =
  | {allowed: true}
  | {allowed: false; blockedPath: string; reason: BlockedPathReason};

export interface SensitivePathPolicy {
  blockedRoots: readonly string[];
  blockedSegments: ReadonlySet<string>;
  blockedBasenames: ReadonlySet<string>;
}

const HOME_RELATIVE_BLOCKED_ROOTS = [
  '.ssh',
  '.gnupg',
  '.pki',
  '.aws',
  '.azure',
  path.join('.config', 'gcloud'),
  path.join('.config', 'gh'),
  '.kube',
  '.docker',
  '.terraform.d',
  path.join('Library', 'Keychains'),
  path.join('Library', 'Application Support', 'Google', 'Chrome'),
  path.join('Library', 'Application Support', 'Chromium'),
  path.join('Library', 'Application Support', 'BraveSoftware'),
  path.join('Library', 'Application Support', 'Firefox'),
] as const;

const BLOCKED_SEGMENTS = new Set(['.git', '.hg', '.svn']);

const BLOCKED_BASENAMES = new Set([
  '.netrc',
  '.git-credentials',
  '.npmrc',
  '.pypirc',
  '.pgpass',
  '.my.cnf',
  '.bash_history',
  '.zsh_history',
  '.fish_history',
  '.psql_history',
  '.mysql_history',
  '.sqlite_history',
  'credentials.json',
  'id_rsa',
  'id_dsa',
  'id_ecdsa',
  'id_ed25519',
]);

const ALLOWED_ENV_BASENAMES = new Set([
  '.env.example',
  '.env.sample',
  '.env.template',
]);

export function createSensitivePathPolicy(options: {
  homeDir: string;
  dataDir: string;
}): SensitivePathPolicy {
  const homeDir = path.resolve(options.homeDir);
  const dataDir = path.resolve(options.dataDir);

  return {
    blockedRoots: [
      ...HOME_RELATIVE_BLOCKED_ROOTS.map((relativeRoot) =>
        path.resolve(homeDir, relativeRoot),
      ),
      dataDir,
    ],
    blockedSegments: BLOCKED_SEGMENTS,
    blockedBasenames: BLOCKED_BASENAMES,
  };
}

export function checkSensitivePathAccess(
  absolutePath: string,
  policy: SensitivePathPolicy,
): FileAccessPolicyResult {
  const normalizedPath = path.resolve(absolutePath);

  for (const blockedRoot of policy.blockedRoots) {
    if (isSubPathOrSelf(blockedRoot, normalizedPath)) {
      return {
        allowed: false,
        blockedPath: blockedRoot,
        reason: 'blocked-root',
      };
    }
  }

  const blockedSegmentPath = findBlockedSegmentPath(
    normalizedPath,
    policy.blockedSegments,
  );
  if (blockedSegmentPath !== undefined) {
    return {
      allowed: false,
      blockedPath: blockedSegmentPath,
      reason: 'blocked-segment',
    };
  }

  const basename = path.basename(normalizedPath);

  if (isBlockedExactBasename(basename, policy)) {
    return {
      allowed: false,
      blockedPath: normalizedPath,
      reason: 'blocked-basename',
    };
  }

  if (isBlockedBasenamePattern(basename)) {
    return {
      allowed: false,
      blockedPath: normalizedPath,
      reason: 'blocked-pattern',
    };
  }

  return {allowed: true};
}

function findBlockedSegmentPath(
  absolutePath: string,
  blockedSegments: ReadonlySet<string>,
): string | undefined {
  const root = path.parse(absolutePath).root;
  const relativeParts = absolutePath.slice(root.length).split(path.sep);
  const pathParts: string[] = [];

  for (const part of relativeParts) {
    if (part.length === 0) continue;
    pathParts.push(part);

    if (blockedSegments.has(part)) {
      return path.join(root, ...pathParts);
    }
  }

  return undefined;
}

function isBlockedExactBasename(
  basename: string,
  policy: SensitivePathPolicy,
): boolean {
  return policy.blockedBasenames.has(basename.toLowerCase());
}

function isBlockedBasenamePattern(basename: string): boolean {
  const normalizedBasename = basename.toLowerCase();

  if (
    (normalizedBasename === '.env' || normalizedBasename.startsWith('.env.')) &&
    !ALLOWED_ENV_BASENAMES.has(normalizedBasename)
  ) {
    return true;
  }

  return (
    normalizedBasename.endsWith('.pem') ||
    normalizedBasename.endsWith('.key') ||
    normalizedBasename.endsWith('.p12') ||
    normalizedBasename.endsWith('.pfx') ||
    (normalizedBasename.includes('service-account') &&
      normalizedBasename.endsWith('.json'))
  );
}
