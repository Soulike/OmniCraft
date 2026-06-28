import {toast} from '@heroui/react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router';

import {stripTrailingSlash} from '@/helpers/path.js';
import {useSessionConfig, useSessionId} from '@/modules/chat-session/index.js';

import type {WorkspaceGroupEntry} from '../WorkspaceSessionListView.js';
import {useAllCodingSessions} from './useAllCodingSessions.js';
import {useWorkspaceGroups} from './useWorkspaceGroups.js';

/** Sentinel key for the trailing "Ungrouped" group (orphan sessions). */
const UNGROUPED_KEY = '\x00ungrouped';

interface UseWorkspaceSessionListOptions {
  readonly onNewSession: (workspacePath: string) => void;
}

interface UseWorkspaceSessionListResult {
  readonly entries: readonly WorkspaceGroupEntry[];
  readonly expanded: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly currentSessionId: string | null;
  readonly onToggle: (key: string, isExpanded: boolean) => void;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => Promise<void>;
  readonly onNewSession: (workspacePath: string) => void;
}

/** View model for the workspace-grouped coding sidebar. */
export function useWorkspaceSessionList({
  onNewSession,
}: UseWorkspaceSessionListOptions): UseWorkspaceSessionListResult {
  const {workspaces} = useSessionConfig();
  const {sessions, isLoading, error, removeSession} = useAllCodingSessions();
  const {sessionId, buildSessionRoute, baseRoute} = useSessionId();
  const navigate = useNavigate();

  const groups = useWorkspaceGroups(workspaces, sessions);

  const entries = useMemo<readonly WorkspaceGroupEntry[]>(
    () =>
      groups.map((group) => ({
        key: group.workspace
          ? stripTrailingSlash(group.workspace.path)
          : UNGROUPED_KEY,
        group,
      })),
    [groups],
  );

  // Key of the group holding the active session — used to seed the expanded set
  // once. Sessions without a configured workspace fall into the Ungrouped group.
  const activeKey = useMemo(() => {
    const active = sessions.find((s) => s.id === sessionId);
    if (active === undefined) {
      return null;
    }
    const key = active.workingDirectory
      ? stripTrailingSlash(active.workingDirectory)
      : null;
    if (
      key !== null &&
      workspaces.some((w) => stripTrailingSlash(w.path) === key)
    ) {
      return key;
    }
    return UNGROUPED_KEY;
  }, [sessions, sessionId, workspaces]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || activeKey === null) {
      return;
    }
    setExpanded(new Set([activeKey]));
    setSeeded(true);
  }, [seeded, activeKey]);

  const onToggle = useCallback((key: string, isExpanded: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const handleNewSession = useCallback(
    (workspacePath: string) => {
      setExpanded((prev) =>
        new Set(prev).add(stripTrailingSlash(workspacePath)),
      );
      onNewSession(workspacePath);
    },
    [onNewSession],
  );

  const onSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(buildSessionRoute(id));
      }
    },
    [navigate, sessionId, buildSessionRoute],
  );

  const onDeleteSession = useCallback(
    async (id: string) => {
      try {
        await removeSession(id);
      } catch (e: unknown) {
        console.error('Failed to delete session:', e);
        toast.danger('Failed to delete session');
        return;
      }
      toast.success('Session deleted');
      if (id === sessionId) {
        void navigate(baseRoute, {replace: true});
      }
    },
    [removeSession, sessionId, navigate, baseRoute],
  );

  return {
    entries,
    expanded,
    isLoading,
    error,
    currentSessionId: sessionId,
    onToggle,
    onSelectSession,
    onDeleteSession,
    onNewSession: handleNewSession,
  };
}
