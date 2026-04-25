import fs from 'node:fs/promises';
import path from 'node:path';

import {getDefaultSensitivePathPolicy} from '@/helpers/default-sensitive-path-policy.js';
import {
  checkSensitivePathAccess,
  type FileAccessPolicyResult,
} from '@/helpers/sensitive-path-policy.js';

export function checkLexicalFileAccess(
  absolutePath: string,
): FileAccessPolicyResult {
  return checkSensitivePathAccess(
    path.resolve(absolutePath),
    getDefaultSensitivePathPolicy(),
  );
}

export async function checkExistingFileAccess(
  absolutePath: string,
): Promise<FileAccessPolicyResult> {
  const lexicalResult = checkLexicalFileAccess(absolutePath);
  if (!lexicalResult.allowed) return lexicalResult;

  const realPath = await fs.realpath(absolutePath);
  const realResult = checkLexicalFileAccess(realPath);
  if (realResult.allowed) return realResult;

  const linkTargetResult = await checkSymbolicLinkTargetAccess(absolutePath);
  if (linkTargetResult !== undefined && !linkTargetResult.allowed) {
    return linkTargetResult;
  }

  return realResult;
}

export async function checkNewFileAccess(
  absolutePath: string,
): Promise<FileAccessPolicyResult> {
  const resolvedPath = path.resolve(absolutePath);
  const lexicalResult = checkLexicalFileAccess(resolvedPath);
  if (!lexicalResult.allowed) return lexicalResult;

  const {existingParent, missingParts} =
    await findNearestExistingParent(resolvedPath);
  const realParent = await fs.realpath(existingParent);
  const intendedRealPath = path.join(realParent, ...missingParts);

  return checkLexicalFileAccess(intendedRealPath);
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
): Promise<FileAccessPolicyResult | undefined> {
  try {
    const stat = await fs.lstat(absolutePath);
    if (!stat.isSymbolicLink()) return undefined;

    const linkTarget = await fs.readlink(absolutePath);
    const resolvedTarget = path.resolve(path.dirname(absolutePath), linkTarget);
    return checkLexicalFileAccess(resolvedTarget);
  } catch {
    return undefined;
  }
}

function isNotFoundError(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
