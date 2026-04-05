import {
  Alert,
  Button,
  Chip,
  Input,
  Label,
  ListBox,
  Select,
  Skeleton,
  Spinner,
  TextField,
} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useState} from 'react';

import {LoadError} from '@/components/LoadError/index.js';

import styles from './styles.module.css';

interface FileAccessSectionViewProps {
  paths: AllowedPathEntry[];
  isLoading: boolean;
  loadError: string | null;
  isSaving: boolean;
  saveError: string | null;
  onAdd: (entry: AllowedPathEntry) => void;
  onRemove: (index: number) => void;
  onSave: () => void;
  onRetry: () => void;
}

export function FileAccessSectionView({
  paths,
  isLoading,
  loadError,
  isSaving,
  saveError,
  onAdd,
  onRemove,
  onSave,
  onRetry,
}: FileAccessSectionViewProps) {
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
    <div className={styles.section}>
      <h2 className={styles.title}>File Access</h2>
      <Alert status={'accent'}>
        <Alert.Indicator />
        <Alert.Content>
          The system temporary directory is always accessible with read-write
          permission.
        </Alert.Content>
      </Alert>
      {isLoading ? (
        <div className={styles.skeletonContainer}>
          {Array.from({length: 3}).map((_, i) => (
            <Skeleton
              key={`skeleton-${i.toString()}`}
              className={styles.skeletonRow}
            />
          ))}
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={onRetry} />
      ) : (
        <>
          {paths.length === 0 ? (
            <p className={styles.emptyState}>
              No allowed paths configured yet.
            </p>
          ) : (
            <ListBox aria-label='Allowed paths' selectionMode='none'>
              {paths.map((entry, i) => (
                <ListBox.Item
                  key={entry.path}
                  id={entry.path}
                  textValue={entry.path}
                >
                  <Label className={styles.entryPath}>{entry.path}</Label>
                  <Chip
                    size='sm'
                    color={entry.mode === 'read-write' ? 'accent' : 'default'}
                  >
                    {entry.mode}
                  </Chip>
                  <Button
                    size='sm'
                    variant='danger'
                    onPress={() => {
                      onRemove(i);
                    }}
                  >
                    Remove
                  </Button>
                </ListBox.Item>
              ))}
            </ListBox>
          )}
          <div className={styles.addRow}>
            <TextField
              value={newPath}
              onChange={setNewPath}
              className={styles.addPathField}
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
              className={styles.addModeSelect}
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
          <div className={styles.footer}>
            {saveError !== null && (
              <p className={styles.saveError}>{saveError}</p>
            )}
            <Button isPending={isSaving} isDisabled={isSaving} onPress={onSave}>
              {({isPending}) => (
                <>
                  {isPending && <Spinner color='current' size='sm' />}
                  Save
                </>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
