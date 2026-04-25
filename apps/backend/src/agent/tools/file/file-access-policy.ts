import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';

import {getDefaultSensitivePathPolicy} from '@/helpers/default-sensitive-path-policy.js';
import {
  checkSensitivePathAccess,
  type FileAccessPolicyResult,
  type SensitivePathPolicy,
} from '@/helpers/sensitive-path-policy.js';

interface SymbolicLinkPathOptions {
  readonly missingPathIsSymbolicLink?: boolean;
}

export function checkLexicalFileAccess(
  absolutePath: string,
  policy: SensitivePathPolicy = getDefaultSensitivePathPolicy(),
): FileAccessPolicyResult {
  return checkSensitivePathAccess(path.resolve(absolutePath), policy);
}

export async function checkExistingFileAccess(
  absolutePath: string,
  policy: SensitivePathPolicy = getDefaultSensitivePathPolicy(),
): Promise<FileAccessPolicyResult> {
  const lexicalResult = checkLexicalFileAccess(absolutePath, policy);
  if (!lexicalResult.allowed) return lexicalResult;

  const realPath = await fs.realpath(absolutePath);
  const realResult = checkLexicalFileAccess(realPath, policy);
  if (realResult.allowed) return realResult;

  const linkTargetResult = await checkSymbolicLinkTargetAccess(
    absolutePath,
    policy,
  );
  if (linkTargetResult !== undefined && !linkTargetResult.allowed) {
    return linkTargetResult;
  }

  return realResult;
}

export async function checkNewFileAccess(
  absolutePath: string,
  policy: SensitivePathPolicy = getDefaultSensitivePathPolicy(),
): Promise<FileAccessPolicyResult> {
  const resolvedPath = path.resolve(absolutePath);
  const lexicalResult = checkLexicalFileAccess(resolvedPath, policy);
  if (!lexicalResult.allowed) return lexicalResult;

  const {existingParent, missingParts} =
    await findNearestExistingParent(resolvedPath);
  const realParent = await fs.realpath(existingParent);
  const intendedRealPath = path.join(realParent, ...missingParts);

  return checkLexicalFileAccess(intendedRealPath, policy);
}

export async function isSymbolicLinkPath(
  absolutePath: string,
): Promise<boolean> {
  try {
    const stat = await fs.lstat(absolutePath);
    return stat.isSymbolicLink();
  } catch {
    return false;
  }
}

export async function isPathThroughSymbolicLink(
  baseDir: string,
  absolutePath: string,
  options: SymbolicLinkPathOptions = {},
): Promise<boolean> {
  const missingPathIsSymbolicLink = options.missingPathIsSymbolicLink ?? true;
  const resolvedBaseDir = path.resolve(baseDir);
  const resolvedPath = path.resolve(absolutePath);
  const relativePath = path.relative(resolvedBaseDir, resolvedPath);

  if (relativePath === '') {
    return pathHasSymbolicLinkComponent(
      resolvedBaseDir,
      missingPathIsSymbolicLink,
    );
  }

  return pathHasSymbolicLinkComponent(resolvedPath, missingPathIsSymbolicLink);
}

export function getFileAccessPolicyGlobIgnorePatterns(
  searchDir: string,
  policy: SensitivePathPolicy = getDefaultSensitivePathPolicy(),
): string[] {
  const patterns = new Set<string>();

  for (const blockedSegment of [...policy.blockedSegments].sort()) {
    const segmentPattern = toPosixPath(blockedSegment);
    patterns.add(segmentPattern);
    patterns.add(`${segmentPattern}/**`);
    patterns.add(`**/${segmentPattern}`);
    patterns.add(`**/${segmentPattern}/**`);
  }

  const resolvedSearchDir = path.resolve(searchDir);
  for (const blockedRoot of policy.blockedRoots) {
    const relativeRoot = path.relative(
      resolvedSearchDir,
      path.resolve(blockedRoot),
    );
    if (
      relativeRoot === '' ||
      relativeRoot === '..' ||
      relativeRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeRoot)
    ) {
      continue;
    }

    const rootPattern = toPosixPath(relativeRoot);
    patterns.add(rootPattern);
    patterns.add(`${rootPattern}/**`);
  }

  return [...patterns];
}

export async function hasFileAccessPolicyIgnoredDescendant(
  searchDir: string,
  policy: SensitivePathPolicy = getDefaultSensitivePathPolicy(),
): Promise<boolean> {
  const resolvedSearchDir = path.resolve(searchDir);

  for (const blockedRoot of policy.blockedRoots) {
    const relativeRoot = path.relative(
      resolvedSearchDir,
      path.resolve(blockedRoot),
    );
    if (
      relativeRoot === '' ||
      relativeRoot === '..' ||
      relativeRoot.startsWith(`..${path.sep}`) ||
      path.isAbsolute(relativeRoot)
    ) {
      continue;
    }

    try {
      await fs.lstat(blockedRoot);
      return true;
    } catch {
      // Missing blocked roots did not prune anything.
    }
  }

  const blockedSegmentPatterns = [...policy.blockedSegments]
    .sort()
    .flatMap((blockedSegment) => {
      const segmentPattern = toPosixPath(blockedSegment);
      return [segmentPattern, `**/${segmentPattern}`];
    });

  if (blockedSegmentPatterns.length === 0) return false;

  const stream = fg.stream(blockedSegmentPatterns, {
    cwd: resolvedSearchDir,
    onlyFiles: false,
    dot: true,
    followSymbolicLinks: false,
    unique: true,
  });

  for await (const entry of stream) {
    if (typeof entry === 'string') return true;
  }

  return false;
}

async function findNearestExistingParent(absolutePath: string): Promise<{
  existingParent: string;
  missingParts: string[];
}> {
  const root = path.parse(absolutePath).root;
  let currentPath = absolutePath;
  const missingParts: string[] = [];

  while (currentPath !== root) {
    try {
      await fs.lstat(currentPath);
      return {existingParent: currentPath, missingParts};
    } catch (error) {
      if (!isNotFoundError(error)) throw error;
      missingParts.unshift(path.basename(currentPath));
      currentPath = path.dirname(currentPath);
    }
  }

  return {existingParent: root, missingParts};
}

async function checkSymbolicLinkTargetAccess(
  absolutePath: string,
  policy: SensitivePathPolicy,
): Promise<FileAccessPolicyResult | undefined> {
  try {
    const stat = await fs.lstat(absolutePath);
    if (!stat.isSymbolicLink()) return undefined;

    const linkTarget = await fs.readlink(absolutePath);
    const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
    return checkLexicalFileAccess(resolvedTarget, policy);
  } catch {
    return undefined;
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join('/');
}

async function pathHasSymbolicLinkComponent(
  absolutePath: string,
  missingPathIsSymbolicLink: boolean,
): Promise<boolean> {
  const resolvedPath = path.resolve(absolutePath);
  const root = path.parse(resolvedPath).root;
  const pathParts = resolvedPath
    .slice(root.length)
    .split(path.sep)
    .filter((part) => part !== '');

  let currentPath = root;
  for (const [index, pathPart] of pathParts.entries()) {
    currentPath = path.join(currentPath, pathPart);
    try {
      const stat = await fs.lstat(currentPath);
      if (stat.isSymbolicLink()) {
        if (index === 0) {
          const linkTarget = await fs.readlink(currentPath);
          if (isAllowedOsRootAliasSymlinkPath(currentPath, linkTarget)) {
            continue;
          }
        }
        return true;
      }
    } catch {
      return missingPathIsSymbolicLink;
    }
  }

  return false;
}

export function isAllowedOsRootAliasSymlinkPath(
  linkPath: string,
  linkTarget: string,
): boolean {
  if (process.platform !== 'darwin') return false;

  const resolvedLinkPath = path.resolve(linkPath);
  const resolvedTarget = path.resolve(
    path.dirname(resolvedLinkPath),
    linkTarget,
  );

  return (
    (resolvedLinkPath === '/var' && resolvedTarget === '/private/var') ||
    (resolvedLinkPath === '/tmp' && resolvedTarget === '/private/tmp')
  );
}
