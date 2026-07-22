import type {Selection} from '@heroui/react';
import {Button, Chip, Disclosure, ListBox, Tooltip} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Folder, Plus} from 'lucide-react';
import {useMemo} from 'react';

import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';
import {basename} from '@/helpers/path.js';

import {TaskListItem} from './components/TaskListItem/index.js';
import styles from './styles.module.css';

interface WorkspaceGroupViewProps {
  readonly workspace?: Workspace;
  readonly sessions: readonly SessionMetadata[];
  readonly statuses: ReadonlyMap<string, TaskStatus>;
  readonly isExpanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly currentSessionId: string | null;
  readonly now: number;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => Promise<void>;
  readonly onNewSession?: (workspacePath: string) => void;
}

export function WorkspaceGroupView({
  workspace,
  sessions,
  statuses,
  isExpanded,
  onExpandedChange,
  currentSessionId,
  now,
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
        <Disclosure.Trigger className={styles.trigger}>
          <Disclosure.Indicator className={styles.indicator} />
          <Folder className={styles.folder} size={14} />
          <span className={styles.label} title={workspace?.path}>
            {label}
          </span>
          <Chip className={styles.count} size='sm' variant='soft'>
            {sessions.length}
          </Chip>
        </Disclosure.Trigger>
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
            <p className={styles.empty}>No tasks yet</p>
          ) : (
            <ListBox
              aria-label={`${label} tasks`}
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
                  className={styles.item}
                >
                  {({isSelected}) => (
                    <TaskListItem
                      title={session.title}
                      updatedAt={session.updatedAt}
                      status={statuses.get(session.id) ?? 'idle'}
                      isSelected={isSelected}
                      now={now}
                      onDelete={async () => onDeleteSession(session.id)}
                    />
                  )}
                </ListBox.Item>
              )}
            </ListBox>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
