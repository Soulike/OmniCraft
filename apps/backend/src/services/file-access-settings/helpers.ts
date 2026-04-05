import {constants} from 'node:fs';
import path from 'node:path';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {checkDirectoryAccess} from '@/helpers/fs.js';

import {type InvalidPathEntry, PathValidationError} from './types.js';

/**
 * Validates path entries for duplicates and filesystem access.
 * Normalizes absolute paths before dedup and storage.
 * Returns the normalized entries and an array of errors (empty if all valid).
 */
export async function normalizeAndValidatePaths(
  entries: readonly AllowedPathEntry[],
): Promise<{normalized: AllowedPathEntry[]; errors: InvalidPathEntry[]}> {
  const errors: InvalidPathEntry[] = [];
  const seen = new Set<string>();
  const normalized: AllowedPathEntry[] = [];

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

    const reason = await validateSinglePath(resolvedPath, entry.mode);
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
  mode: AllowedPathEntry['mode'],
): Promise<PathValidationError | null> {
  const requiredFlags =
    mode === 'read-write' ? constants.R_OK | constants.W_OK : constants.R_OK;

  const fsError = await checkDirectoryAccess(resolvedPath, requiredFlags);
  if (fsError === 'not_found') return PathValidationError.NOT_FOUND;
  if (fsError === 'not_directory') return PathValidationError.NOT_DIRECTORY;
  if (fsError === 'not_accessible') {
    return mode === 'read-write'
      ? PathValidationError.NOT_READABLE_AND_WRITABLE
      : PathValidationError.NOT_READABLE;
  }

  return null;
}
