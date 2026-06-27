import type {Selection} from '@heroui/react';
import {ListBox, Spinner} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {RefObject} from 'react';
import {useMemo} from 'react';

import {SessionItem} from './components/SessionItem/index.js';
import styles from './styles.module.css';

interface SessionListViewProps {
  sessions: readonly SessionMetadata[];
  isLoadingInitial: boolean;
  isLoadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  sentinelRef: RefObject<HTMLDivElement | null>;
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<void>;
}

export function SessionListView({
  sessions,
  isLoadingInitial,
  isLoadingMore,
  error,
  hasMore,
  sentinelRef,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: SessionListViewProps) {
  const selectedKeys = useMemo(
    () =>
      currentSessionId !== null
        ? new Set([currentSessionId])
        : new Set<string>(),
    [currentSessionId],
  );

  if (isLoadingInitial) {
    return (
      <div className={styles.centered}>
        <Spinner size='sm' />
      </div>
    );
  }

  if (error !== null) {
    return (
      <div className={styles.centered}>
        <p className={styles.errorText}>Failed to load sessions</p>
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className={styles.centered}>
        <p className={styles.emptyText}>No sessions yet</p>
      </div>
    );
  }

  return (
    <>
      <ListBox
        aria-label='Session list'
        className={styles.listBox}
        items={sessions}
        selectedKeys={selectedKeys}
        selectionMode='single'
        onSelectionChange={(keys: Selection) => {
          if (keys === 'all') {
            return;
          }
          const selected = [...keys][0];
          if (typeof selected === 'string') {
            onSelectSession(selected);
          }
        }}
      >
        {(session) => (
          <ListBox.Item
            key={session.id}
            id={session.id}
            textValue={session.title}
          >
            <SessionItem
              title={session.title}
              onDelete={async () => onDeleteSession(session.id)}
            />
          </ListBox.Item>
        )}
      </ListBox>
      {hasMore && (
        <div ref={sentinelRef} className={styles.centered}>
          {isLoadingMore && <Spinner size='sm' />}
        </div>
      )}
    </>
  );
}
