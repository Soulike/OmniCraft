import {Button, Input, Label, ListBox, Select, TextField} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useState} from 'react';

import styles from './styles.module.css';

interface AddPathFormProps {
  onAdd: (entry: AllowedPathEntry) => void;
}

export function AddPathForm({onAdd}: AddPathFormProps) {
  const [newPath, setNewPath] = useState('');
  const [newMode, setNewMode] = useState<'read' | 'read-write'>('read');

  function handleAdd() {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    onAdd({path: trimmed, mode: newMode});
    setNewPath('');
    setNewMode('read');
  }

  return (
    <div className={styles.container}>
      <TextField
        value={newPath}
        onChange={setNewPath}
        className={styles.pathField}
      >
        <Label>Path</Label>
        <Input placeholder='/absolute/path/to/directory' />
      </TextField>
      <Select
        value={newMode}
        onChange={(value) => {
          if (value === 'read' || value === 'read-write') {
            setNewMode(value);
          }
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
      <Button isDisabled={!newPath.trim()} onPress={handleAdd}>
        Add
      </Button>
    </div>
  );
}
