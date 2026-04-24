import {Button, Label, ListBox, Select, Spinner, Tooltip} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';
import {Info} from 'lucide-react';

import styles from './styles.module.css';

interface WorkspaceSelectViewProps {
  readonly isLoading: boolean;
  readonly workspaces: readonly Workspace[];
  readonly selectedWorkspace: string | undefined;
  readonly onWorkspaceChange: (value: string | undefined) => void;
}

export function WorkspaceSelectView({
  isLoading,
  workspaces,
  selectedWorkspace,
  onWorkspaceChange,
}: WorkspaceSelectViewProps) {
  return (
    <Select
      isDisabled={isLoading || workspaces.length === 0}
      value={selectedWorkspace ?? ''}
      onChange={(value) => {
        onWorkspaceChange(value ? String(value) : undefined);
      }}
    >
      <Label>
        <span className={styles.labelContent}>
          Workspace
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
              <p>Directory the agent works in</p>
            </Tooltip.Content>
          </Tooltip>
          {isLoading && <Spinner size='sm' />}
        </span>
      </Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id='' textValue='None'>
            None
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {workspaces.map((entry) => (
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
