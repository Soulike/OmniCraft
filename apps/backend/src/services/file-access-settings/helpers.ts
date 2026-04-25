import {constants} from 'node:fs';
import path from 'node:path';

import type {Workspace} from '@omnicraft/settings-schema';

import {getDefaultSensitivePathPolicy} from '@/helpers/default-sensitive-path-policy.js';
import {checkDirectoryAccess} from '@/helpers/fs.js';
import {checkSensitivePathAccess} from '@/helpers/sensitive-path-policy.js';

import {type InvalidPathEntry, PathValidationError} from './types.js';

/**
 * Validates workspace entries for duplicates and filesystem access.
 * Normalizes absolute paths before dedup and storage.
 * Returns the normalized entries and an array of errors (empty if all valid).
 */
export async function normalizeAndValidatePaths(
  entries: readonly Workspace[],
): Promise<{normalized: Workspace[]; errors: InvalidPathEntry[]}> {
  const errors: InvalidPathEntry[] = [];
  const seen = new Set<string>();
  const normalized: Workspace[] = [];

  for (const entry of entries) {
    if (!path.isAbsolute(entry.path)) {
      errors.push({path: entry.path, reason: PathValidationError.NOT_ABSOLUTE});
      continue;
    }

    const resolvedPath = path.resolve(entry.path);
    if (seen.has(resolvedPath)) {
      errors.push({path: entry.path, reason: PathValidationError.DUPLICATE});
      continue;
    }
    seen.add(resolvedPath);

    const policy = checkSensitivePathAccess(
      resolvedPath,
      getDefaultSensitivePathPolicy(),
    );
    if (!policy.allowed) {
      errors.push({path: entry.path, reason: PathValidationError.BLOCKED});
      continue;
    }

    const reason = await validateSinglePath(resolvedPath);
    if (reason) {
      errors.push({path: entry.path, reason});
      continue;
    }

    normalized.push({...entry, path: resolvedPath});
  }

  return {normalized, errors};
}

async function validateSinglePath(
  resolvedPath: string,
): Promise<PathValidationError | null> {
  const fsError = await checkDirectoryAccess(
    resolvedPath,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found') return PathValidationError.NOT_FOUND;
  if (fsError === 'not_directory') return PathValidationError.NOT_DIRECTORY;
  if (fsError === 'not_accessible') return PathValidationError.NOT_ACCESSIBLE;

  return null;
}
