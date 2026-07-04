import {Button, Label, ListBox, Surface} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';

import styles from './styles.module.css';

interface PathListProps {
  workspaces: readonly Workspace[];
  isSaving: boolean;
  onRemove: (index: number) => void;
}

export function PathList({workspaces, isSaving, onRemove}: PathListProps) {
  if (workspaces.length === 0) {
    return <p className={styles.emptyState}>No workspaces configured yet.</p>;
  }

  return (
    <Surface className={styles.container}>
      <ListBox aria-label='Workspaces' selectionMode='none'>
        {workspaces.map((entry, i) => (
          <ListBox.Item key={entry.path} id={entry.path} textValue={entry.path}>
            <div className={styles.entryContent}>
              <Label className={styles.entryPath}>{entry.path}</Label>
            </div>
            <div className={styles.entryActions}>
              <Button
                size='sm'
                variant='danger'
                isDisabled={isSaving}
                onPress={() => {
                  onRemove(i);
                }}
              >
                Remove
              </Button>
            </div>
          </ListBox.Item>
        ))}
      </ListBox>
    </Surface>
  );
}
