import {toast} from '@heroui/react';
import {useCallback, useMemo} from 'react';
import {useNavigate} from 'react-router';

import {useNow} from '@/hooks/useNow.js';
import {useSessionConfig, useSessionId} from '@/modules/chat-session/index.js';

import {
  sessionGroupKey,
  UNGROUPED_KEY,
  workspaceGroupKey,
} from './helpers/group-key.js';
import {useAllCodingSessions} from './hooks/useAllCodingSessions.js';
import {useExpandedGroups} from './hooks/useExpandedGroups.js';
import {useSyncSelectedWorkspace} from './hooks/useSyncSelectedWorkspace.js';
import {useWorkspaceGroups} from './hooks/useWorkspaceGroups.js';
import type {WorkspaceGroupEntry} from './WorkspaceSessionListView.js';
import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

interface WorkspaceSessionListProps {
  readonly onNewSession: (workspacePath: string) => void;
}

export function WorkspaceSessionList({
  onNewSession,
}: WorkspaceSessionListProps) {
  const {
    workspaces,
    isLoading: workspacesLoading,
    loadError: workspacesError,
    reload: reloadWorkspaces,
    setSelectedWorkspace,
  } = useSessionConfig();
  const {
    sessions,
    isLoading: sessionsLoading,
    error: sessionsError,
    reload: reloadSessions,
    removeSession,
  } = useAllCodingSessions();
  const {sessionId, buildSessionRoute, baseRoute} = useSessionId();
  const navigate = useNavigate();
  const now = useNow();

  useSyncSelectedWorkspace(sessions, sessionId, setSelectedWorkspace);

  const groups = useWorkspaceGroups(workspaces, sessions);

  const entries = useMemo<readonly WorkspaceGroupEntry[]>(
    () =>
      groups.map((group) => ({
        key: group.workspace
          ? workspaceGroupKey(group.workspace.path)
          : UNGROUPED_KEY,
        group,
      })),
    [groups],
  );

  // Key of the group holding the active session; orphan sessions seed Ungrouped.
  // Wait until both workspaces and sessions have loaded — seeding off a partial
  // load would wrongly resolve the active session to Ungrouped and leave its
  // real group collapsed.
  const activeKey = useMemo(() => {
    if (workspacesLoading || sessionsLoading) {
      return null;
    }
    const active = sessions.find((s) => s.id === sessionId);
    if (active === undefined) {
      return null;
    }
    return sessionGroupKey(active.workingDirectory, workspaces);
  }, [workspacesLoading, sessionsLoading, sessions, sessionId, workspaces]);

  // When no session is active, seed expansion with the group holding the most
  // recently updated session (sessions are returned mtime-desc), so the panel
  // never opens fully collapsed.
  const mostRecentGroupKey = useMemo(() => {
    if (workspacesLoading || sessionsLoading) {
      return null;
    }
    const mostRecent = sessions.at(0);
    if (mostRecent === undefined) {
      return null;
    }
    return sessionGroupKey(mostRecent.workingDirectory, workspaces);
  }, [workspacesLoading, sessionsLoading, sessions, workspaces]);

  const {expandedGroups, toggleGroup, expandGroup} = useExpandedGroups(
    activeKey,
    mostRecentGroupKey,
  );

  const handleNewSession = useCallback(
    (workspacePath: string) => {
      expandGroup(workspaceGroupKey(workspacePath));
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
      isLoading={workspacesLoading || sessionsLoading}
      workspacesFailed={workspacesError !== null}
      sessionsFailed={sessionsError !== null}
      currentSessionId={sessionId}
      now={now}
      onReloadWorkspaces={() => void reloadWorkspaces()}
      onReloadSessions={() => void reloadSessions(false)}
      onToggle={toggleGroup}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onNewSession={handleNewSession}
    />
  );
}
