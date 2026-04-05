import {Button, Label, ListBox, Select, Tooltip} from '@heroui/react';
import {Info} from 'lucide-react';
import {useMemo} from 'react';

import {useSessionConfig} from '../../../../hooks/useSessionConfig.js';
import styles from './styles.module.css';

export function WorkspaceSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    selectedWorkspace,
    setSelectedWorkspace,
  } = useSessionConfig();

  const readWritePaths = useMemo(
    () =>
      allAllowedPathEntriesFromSettings.filter((p) => p.mode === 'read-write'),
    [allAllowedPathEntriesFromSettings],
  );

  return (
    <Select
      value={selectedWorkspace ?? ''}
      onChange={(value) => {
        setSelectedWorkspace(value ? String(value) : undefined);
      }}
    >
      <Label>
        <span className={styles.labelContent}>
          Workspace
          <Tooltip delay={0}>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Workspace info'
            >
              <Info size={12} />
            </Button>
            <Tooltip.Content>
              <p>Read-write directory the agent works in</p>
            </Tooltip.Content>
          </Tooltip>
        </span>
      </Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          {readWritePaths.map((entry) => (
            <ListBox.Item
              key={entry.path}
              id={entry.path}
              textValue={entry.path}
            >
              {entry.path}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
