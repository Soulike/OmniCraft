import {constants} from 'node:fs';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {checkDirectoryAccess} from '@/helpers/fs.js';

import {CreateSessionError} from './types.js';

/**
 * Validates workspace against settings and filesystem.
 * Returns null if valid, or the error found.
 */
export async function validateSessionPaths(
  workspace: string | undefined,
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  if (!workspace) return null;

  const entry = allowedPaths.find((e) => e.path === workspace);
  if (!entry) return CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS;
  if (entry.mode !== 'read-write') {
    return CreateSessionError.WORKSPACE_NOT_READ_WRITE;
  }

  const fsError = await checkDirectoryAccess(
    workspace,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found') {
    return CreateSessionError.WORKSPACE_PATH_NOT_FOUND;
  }
  if (fsError === 'not_directory') {
    return CreateSessionError.WORKSPACE_PATH_NOT_DIRECTORY;
  }
  if (fsError === 'not_accessible') {
    return CreateSessionError.WORKSPACE_PATH_NOT_ACCESSIBLE;
  }

  return null;
}
