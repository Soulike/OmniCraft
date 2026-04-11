import path from 'node:path';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

/** Returns true if `child` is strictly inside `parent` (not equal to it). */
export function isSubPath(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  return resolvedChild.startsWith(resolvedParent + path.sep);
}

/** Returns true if `child` is `parent` itself or strictly inside it. */
export function isSubPathOrSelf(parent: string, child: string): boolean {
  return (
    path.resolve(parent) === path.resolve(child) || isSubPath(parent, child)
  );
}

export enum AccessCheckResult {
  OK = 'ok',
  ERROR_OUTSIDE_ALLOWED_DIRECTORIES = 'error_outside_allowed_directories',
  ERROR_READ_ONLY = 'error_read_only',
}

/**
 * Checks if a resolved absolute path is accessible with the required mode.
 * workingDirectory is always read-write.
 */
export function checkAccess(
  targetPath: string,
  requiredMode: 'read',
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
): AccessCheckResult.OK | AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES;
export function checkAccess(
  targetPath: string,
  requiredMode: 'read-write',
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
): AccessCheckResult;
export function checkAccess(
  targetPath: string,
  requiredMode: 'read' | 'read-write',
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
): AccessCheckResult {
  if (isSubPathOrSelf(workingDirectory, targetPath)) {
    return AccessCheckResult.OK;
  }

  const matchedEntry = extraAllowedPaths.find((entry) =>
    isSubPathOrSelf(entry.path, targetPath),
  );

  if (!matchedEntry) {
    return AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES;
  }

  if (requiredMode === 'read-write' && matchedEntry.mode === 'read') {
    return AccessCheckResult.ERROR_READ_ONLY;
  }

  return AccessCheckResult.OK;
}
