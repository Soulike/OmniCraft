import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {useMemo} from 'react';

import {workspaceGroupKey} from '../helpers/group-key.js';

export interface WorkspaceGroup {
  /** undefined ⇒ the orphan "Ungrouped" group (rendered without a `+`). */
  readonly workspace?: Workspace;
  readonly sessions: readonly SessionMetadata[];
}

/**
 * Buckets sessions under their configured workspace (matched by normalized
 * workingDirectory). Sessions whose workspace is not configured — or that have
 * no workingDirectory — collect into a single trailing "Ungrouped" group, which
 * is omitted when empty.
 */
export function groupSessionsByWorkspace(
  workspaces: readonly Workspace[],
  sessions: readonly SessionMetadata[],
): WorkspaceGroup[] {
  const byPath = new Map<string, SessionMetadata[]>();
  for (const workspace of workspaces) {
    byPath.set(workspaceGroupKey(workspace.path), []);
  }

  const orphans: SessionMetadata[] = [];
  for (const session of sessions) {
    const key =
      session.workingDirectory === undefined
        ? undefined
        : workspaceGroupKey(session.workingDirectory);
    const bucket = key === undefined ? undefined : byPath.get(key);
    if (bucket) {
      bucket.push(session);
      continue;
    }
    orphans.push(session);
  }

  const groups: WorkspaceGroup[] = workspaces.map((workspace) => ({
    workspace,
    sessions: byPath.get(workspaceGroupKey(workspace.path)) ?? [],
  }));

  if (orphans.length > 0) {
    groups.push({sessions: orphans});
  }

  return groups;
}

/** Memoized hook wrapper around {@link groupSessionsByWorkspace}. */
export function useWorkspaceGroups(
  workspaces: readonly Workspace[],
  sessions: readonly SessionMetadata[],
): readonly WorkspaceGroup[] {
  return useMemo(
    () => groupSessionsByWorkspace(workspaces, sessions),
    [workspaces, sessions],
  );
}
