import type {Workspace} from '@omnicraft/settings-schema';

import {stripTrailingSlash} from '@/helpers/path.js';

/** Sentinel key for the trailing "Ungrouped" group (orphan sessions). */
export const UNGROUPED_KEY = '\x00ungrouped';

/** A workspace's group key is its normalized path. */
export function workspaceGroupKey(path: string): string {
  return stripTrailingSlash(path);
}

/**
 * The key of the group a session belongs to: its configured workspace's key,
 * or `UNGROUPED_KEY` when it has no working directory or none matches.
 */
export function sessionGroupKey(
  workingDirectory: string | undefined,
  workspaces: readonly Workspace[],
): string {
  if (workingDirectory === undefined) {
    return UNGROUPED_KEY;
  }
  const key = workspaceGroupKey(workingDirectory);
  return workspaces.some(
    (workspace) => workspaceGroupKey(workspace.path) === key,
  )
    ? key
    : UNGROUPED_KEY;
}
