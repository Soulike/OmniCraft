import {toast} from '@heroui/react';
import {useCallback, useMemo} from 'react';
import {useNavigate} from 'react-router';

import {stripTrailingSlash} from '@/helpers/path.js';
import {useSessionConfig, useSessionId} from '@/modules/chat-session/index.js';

import {useAllCodingSessions} from './hooks/useAllCodingSessions.js';
import {useExpandedGroups} from './hooks/useExpandedGroups.js';
import {useWorkspaceGroups} from './hooks/useWorkspaceGroups.js';
import type {WorkspaceGroupEntry} from './WorkspaceSessionListView.js';
import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

/** Sentinel key for the trailing "Ungrouped" group (orphan sessions). */
const UNGROUPED_KEY = '\x00ungrouped';

interface WorkspaceSessionListProps {
  readonly onNewSession: (workspacePath: string) => void;
}

export function WorkspaceSessionList({
  onNewSession,
}: WorkspaceSessionListProps) {
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

  // Key of the group holding the active session; orphan sessions seed Ungrouped.
  const activeKey = useMemo(() => {
    const active = sessions.find((s) => s.id === sessionId);
    if (active === undefined) {
      return null;
    }
    const key = active.workingDirectory
      ? stripTrailingSlash(active.workingDirectory)
      : null;
    return key !== null &&
      workspaces.some((w) => stripTrailingSlash(w.path) === key)
      ? key
      : UNGROUPED_KEY;
  }, [sessions, sessionId, workspaces]);

  const {expandedGroups, toggleGroup, expandGroup} =
    useExpandedGroups(activeKey);

  const handleNewSession = useCallback(
    (workspacePath: string) => {
      expandGroup(stripTrailingSlash(workspacePath));
      onNewSession(workspacePath);
    },
    [expandGroup, onNewSession],
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(buildSessionRoute(id));
      }
    },
    [navigate, sessionId, buildSessionRoute],
  );

  const handleDeleteSession = useCallback(
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

  return (
    <WorkspaceSessionListView
      entries={entries}
      expanded={expandedGroups}
      isLoading={isLoading}
      error={error}
      currentSessionId={sessionId}
      onToggle={toggleGroup}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onNewSession={handleNewSession}
    />
  );
}
