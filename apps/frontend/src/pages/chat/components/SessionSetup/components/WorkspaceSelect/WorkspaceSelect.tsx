import {Description, Label, ListBox, Select} from '@heroui/react';
import {useMemo} from 'react';

import {useSessionConfig} from '../../../../hooks/useSessionConfig.js';

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
      <Label>Workspace</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Description>Read-write directory the agent works in</Description>
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
