import {
  Button,
  Chip,
  Label,
  ListBox,
  Select,
  SelectRoot,
  Tooltip,
} from '@heroui/react';
import {Info} from 'lucide-react';

import {useSessionConfig} from '../../../../hooks/useSessionConfig.js';
import styles from './styles.module.css';

export function ExtraAllowedPathsSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    selectedExtraAllowedPaths,
    setSelectedExtraAllowedPaths,
  } = useSessionConfig();

  return (
    <SelectRoot<object, 'multiple'>
      isDisabled={allAllowedPathEntriesFromSettings.length === 0}
      selectionMode='multiple'
      value={selectedExtraAllowedPaths}
      onChange={(value) => {
        setSelectedExtraAllowedPaths(value.map(String));
      }}
    >
      <Label>
        <span className={styles.labelContent}>
          Extra Allowed Paths
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='Workspace info'
              >
                <Info size={12} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>Additional directories the agent may access</p>
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
          {allAllowedPathEntriesFromSettings.map((entry) => (
            <ListBox.Item
              key={entry.path}
              id={entry.path}
              textValue={`${entry.path} (${entry.mode})`}
            >
              {entry.path}
              <Chip>{entry.mode}</Chip>
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </SelectRoot>
  );
}
