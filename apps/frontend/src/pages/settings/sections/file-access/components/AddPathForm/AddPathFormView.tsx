import {Button, Input, Label, TextField} from '@heroui/react';

import styles from './styles.module.css';

interface AddPathFormViewProps {
  readonly newPath: string;
  readonly isSaving: boolean;
  readonly onPathChange: (value: string) => void;
  readonly onAdd: () => void;
}

export function AddPathFormView({
  newPath,
  isSaving,
  onPathChange,
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
      <Button isDisabled={!newPath.trim() || isSaving} onPress={onAdd}>
        Add
      </Button>
    </div>
  );
}
