import {Description, Label, ListBox, Select, SelectRoot} from '@heroui/react';

import {useSessionConfig} from '../../../../hooks/useSessionConfig.js';

export function ExtraAllowedPathsSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    selectedExtraAllowedPaths,
    setSelectedExtraAllowedPaths,
  } = useSessionConfig();

  return (
    <SelectRoot<object, 'multiple'>
      selectionMode='multiple'
      value={selectedExtraAllowedPaths}
      onChange={(value) => {
        setSelectedExtraAllowedPaths(value.map(String));
      }}
    >
      <Label>Extra Allowed Paths</Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Description>Additional directories the agent may access</Description>
      <Select.Popover>
        <ListBox>
          {allAllowedPathEntriesFromSettings.map((entry) => (
            <ListBox.Item
              key={entry.path}
              id={entry.path}
              textValue={`${entry.path} (${entry.mode})`}
            >
              {entry.path} ({entry.mode})
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </SelectRoot>
  );
}
