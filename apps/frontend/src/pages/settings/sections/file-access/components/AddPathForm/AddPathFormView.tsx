import {Button, Input, Label, ListBox, Select, TextField} from '@heroui/react';

import styles from './styles.module.css';

interface AddPathFormViewProps {
  readonly newPath: string;
  readonly newMode: 'read' | 'read-write';
  readonly onPathChange: (value: string) => void;
  readonly onModeChange: (value: string) => void;
  readonly onAdd: () => void;
}

export function AddPathFormView({
  newPath,
  newMode,
  onPathChange,
  onModeChange,
  onAdd,
}: AddPathFormViewProps) {
  return (
    <div className={styles.container}>
      <TextField
        value={newPath}
        onChange={onPathChange}
        className={styles.pathField}
      >
        <Label>Path</Label>
        <Input placeholder='/absolute/path/to/directory' />
      </TextField>
      <Select
        value={newMode}
        onChange={(value) => {
          onModeChange(String(value));
        }}
        className={styles.modeSelect}
      >
        <Label>Mode</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id='read' textValue='Read'>
              Read
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id='read-write' textValue='Read-Write'>
              Read-Write
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
      </Select>
      <Button isDisabled={!newPath.trim()} onPress={onAdd}>
        Add
      </Button>
    </div>
  );
}
