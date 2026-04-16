import {ListBox} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Key} from 'react';

import {CollapsibleSidebar} from '@/components/CollapsibleSidebar/index.js';

import {SessionItem} from './components/SessionItem/index.js';
import styles from './styles.module.css';

interface SessionSidebarViewProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  sessions: readonly SessionMetadata[];
  currentSessionId: string | null;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => Promise<void>;
}

export function SessionSidebarView({
  isOpen,
  onOpenChange,
  sessions,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
}: SessionSidebarViewProps) {
  const selectedKeys =
    currentSessionId !== null ? new Set([currentSessionId]) : new Set<string>();

  return (
    <CollapsibleSidebar
      isOpen={isOpen}
      onOpenChange={onOpenChange}
      title='Sessions'
    >
      <ListBox
        aria-label='Session list'
        className={styles.listBox}
        items={sessions}
        selectedKeys={selectedKeys}
        selectionMode='single'
        onAction={(key: Key) => {
          onSelectSession(String(key));
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
    </CollapsibleSidebar>
  );
}
