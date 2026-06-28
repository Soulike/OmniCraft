import {toast} from '@heroui/react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router';

import {stripTrailingSlash} from '@/helpers/path.js';
import {useSessionConfig, useSessionId} from '@/modules/chat-session/index.js';

import {useAllCodingSessions} from './hooks/useAllCodingSessions.js';
import {useWorkspaceGroups} from './hooks/useWorkspaceGroups.js';
import type {WorkspaceGroupEntry} from './WorkspaceSessionListView.js';
import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

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

  // The group holding the active session, used to seed the expanded set once.
  const activeKey = useMemo(() => {
    const active = sessions.find((s) => s.id === sessionId);
    return active?.workingDirectory
      ? stripTrailingSlash(active.workingDirectory)
      : null;
  }, [sessions, sessionId]);

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

  const handleNewSession = useCallback(
    (workspacePath: string) => {
      setExpanded((prev) =>
        new Set(prev).add(stripTrailingSlash(workspacePath)),
      );
      onNewSession(workspacePath);
    },
    [onNewSession],
  );

  const handleToggle = useCallback((key: string, isExpanded: boolean) => {
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
      expanded={expanded}
      isLoading={isLoading}
      error={error}
      currentSessionId={sessionId}
      onToggle={handleToggle}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onNewSession={handleNewSession}
    />
  );
}
