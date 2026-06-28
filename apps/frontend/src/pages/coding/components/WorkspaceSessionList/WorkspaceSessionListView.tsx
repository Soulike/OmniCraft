import {Spinner} from '@heroui/react';
import {Settings2} from 'lucide-react';
import {Link} from 'react-router';

import {ROUTES} from '@/routes.js';

import {WorkspaceGroupView} from './components/WorkspaceGroup/index.js';
import type {WorkspaceGroup} from './hooks/useWorkspaceGroups.js';
import styles from './styles.module.css';

export interface WorkspaceGroupEntry {
  readonly key: string;
  readonly group: WorkspaceGroup;
}

interface WorkspaceSessionListViewProps {
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

export function WorkspaceSessionListView({
  entries,
  expanded,
  isLoading,
  error,
  currentSessionId,
  onToggle,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}: WorkspaceSessionListViewProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.scroll}>
        {isLoading && (
          <div className={styles.centered}>
            <Spinner size='sm' />
          </div>
        )}
        {!isLoading && error !== null && (
          <p className={styles.errorText}>Failed to load sessions</p>
        )}
        {!isLoading && error === null && entries.length === 0 && (
          <p className={styles.emptyText}>No workspaces configured</p>
        )}
        {!isLoading &&
          error === null &&
          entries.map(({key, group}) => (
            <WorkspaceGroupView
              key={key}
              workspace={group.workspace}
              sessions={group.sessions}
              isExpanded={expanded.has(key)}
              onExpandedChange={(isExpanded) => {
                onToggle(key, isExpanded);
              }}
              currentSessionId={currentSessionId}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              onNewSession={group.workspace ? onNewSession : undefined}
            />
          ))}
      </div>
      <Link
        className={styles.manageLink}
        to={ROUTES.settings.coding.workspaces()}
      >
        <Settings2 size={14} />
        Manage workspaces…
      </Link>
    </div>
  );
}
