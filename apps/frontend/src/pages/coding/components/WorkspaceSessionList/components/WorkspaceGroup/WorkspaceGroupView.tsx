import type {Selection} from '@heroui/react';
import {Button, Disclosure, ListBox, Tooltip} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Plus} from 'lucide-react';
import {useMemo} from 'react';

import {basename} from '@/helpers/path.js';
import {SessionItem} from '@/modules/chat-session/index.js';

import styles from './styles.module.css';

interface WorkspaceGroupViewProps {
  readonly workspace?: Workspace;
  readonly sessions: readonly SessionMetadata[];
  readonly isExpanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly currentSessionId: string | null;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => Promise<void>;
  readonly onNewSession?: (workspacePath: string) => void;
}

export function WorkspaceGroupView({
  workspace,
  sessions,
  isExpanded,
  onExpandedChange,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}: WorkspaceGroupViewProps) {
  const label = workspace ? basename(workspace.path) : 'Ungrouped';

  const selectedKeys = useMemo(
    () =>
      currentSessionId !== null
        ? new Set([currentSessionId])
        : new Set<string>(),
    [currentSessionId],
  );

  return (
    <Disclosure
      className={styles.group}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      <Disclosure.Heading className={styles.heading}>
        <Button slot='trigger' variant='ghost' className={styles.trigger}>
          <Disclosure.Indicator className={styles.indicator} />
          <span className={styles.label} title={workspace?.path}>
            {label}
          </span>
          <span className={styles.count}>·{sessions.length}</span>
        </Button>
        {!!onNewSession && !!workspace && (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label={`New task in ${label}`}
                className={styles.plus}
                onPress={() => {
                  onNewSession(workspace.path);
                }}
              >
                <Plus size={15} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>New task</p>
            </Tooltip.Content>
          </Tooltip>
        )}
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className={styles.body}>
          {sessions.length === 0 ? (
            <p className={styles.empty}>No sessions yet</p>
          ) : (
            <ListBox
              aria-label={`${label} sessions`}
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
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
