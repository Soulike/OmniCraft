import {constants} from 'node:fs';
import fs from 'node:fs/promises';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {CreateSessionError} from './types.js';

/**
 * Validates workspace and extra paths against settings and filesystem.
 * Returns null if valid, or the first error found.
 */
export async function validateSessionPaths(
  workspace: string | undefined,
  extraPaths: readonly string[],
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  if (workspace) {
    const workspaceError = await validateWorkspace(workspace, allowedPaths);
    if (workspaceError) return workspaceError;
  }

  const extraError = await validateExtraPaths(extraPaths, allowedPaths);
  if (extraError) return extraError;

  return null;
}

async function validateWorkspace(
  workspace: string,
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  const entry = allowedPaths.find((e) => e.path === workspace);
  if (!entry) return CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS;
  if (entry.mode !== 'read-write')
    return CreateSessionError.WORKSPACE_NOT_READ_WRITE;

  const fsError = await checkDirectoryAccess(
    workspace,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found')
    return CreateSessionError.WORKSPACE_PATH_NOT_FOUND;
  if (fsError === 'not_directory')
    return CreateSessionError.WORKSPACE_PATH_NOT_DIRECTORY;
  if (fsError === 'not_accessible')
    return CreateSessionError.WORKSPACE_PATH_NOT_ACCESSIBLE;

  return null;
}

async function validateExtraPaths(
  extraPaths: readonly string[],
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  for (const extraPath of extraPaths) {
    const entry = allowedPaths.find((e) => e.path === extraPath);
    if (!entry) return CreateSessionError.EXTRA_PATH_NOT_IN_ALLOWED_PATHS;

    const requiredFlags =
      entry.mode === 'read-write'
        ? constants.R_OK | constants.W_OK
        : constants.R_OK;

    const fsError = await checkDirectoryAccess(extraPath, requiredFlags);
    if (fsError === 'not_found') return CreateSessionError.EXTRA_PATH_NOT_FOUND;
    if (fsError === 'not_directory')
      return CreateSessionError.EXTRA_PATH_NOT_DIRECTORY;
    if (fsError === 'not_accessible')
      return CreateSessionError.EXTRA_PATH_NOT_ACCESSIBLE;
  }

  return null;
}

type FilesystemError = 'not_found' | 'not_directory' | 'not_accessible';

async function checkDirectoryAccess(
  dirPath: string,
  flags: number,
): Promise<FilesystemError | null> {
  let stat;
  try {
    stat = await fs.stat(dirPath);
  } catch {
    return 'not_found';
  }
  if (!stat.isDirectory()) return 'not_directory';
  try {
    await fs.access(dirPath, flags);
  } catch {
    return 'not_accessible';
  }
  return null;
}
