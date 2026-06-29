import {toast} from '@heroui/react';
import {useCallback, useMemo} from 'react';
import {useNavigate} from 'react-router';

import {useSessionConfig, useSessionId} from '@/modules/chat-session/index.js';

import {
  sessionGroupKey,
  UNGROUPED_KEY,
  workspaceGroupKey,
} from './helpers/group-key.js';
import {useAllCodingSessions} from './hooks/useAllCodingSessions.js';
import {useExpandedGroups} from './hooks/useExpandedGroups.js';
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
  const activeKey = useMemo(() => {
    const active = sessions.find((s) => s.id === sessionId);
    if (active === undefined) {
      return null;
    }
    return sessionGroupKey(active.workingDirectory, workspaces);
  }, [sessions, sessionId, workspaces]);

  const {expandedGroups, toggleGroup, expandGroup} =
    useExpandedGroups(activeKey);

  const handleNewSession = useCallback(
    (workspacePath: string) => {
      expandGroup(workspaceGroupKey(workspacePath));
      onNewSession(workspacePath);
    },
    [expandGroup, onNewSession],
  );

  const handleSelectSession = useCallback(
    (id: string) => {
      // Keep the active workspace in sync so the title-bar VSCode link points
      // at the selected session's directory, not only at freshly created ones.
      const selected = sessions.find((s) => s.id === id);
      setSelectedWorkspace(selected?.workingDirectory);
      if (id !== sessionId) {
        void navigate(buildSessionRoute(id));
      }
    },
    [sessions, setSelectedWorkspace, navigate, sessionId, buildSessionRoute],
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
      onReloadWorkspaces={() => void reloadWorkspaces()}
      onReloadSessions={() => void reloadSessions()}
      onToggle={toggleGroup}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onNewSession={handleNewSession}
    />
  );
}
