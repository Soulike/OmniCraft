import {Button, Chip, Label, ListBox, Surface} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import styles from './styles.module.css';

interface PathListProps {
  paths: readonly AllowedPathEntry[];
  onRemove: (index: number) => void;
}

export function PathList({paths, onRemove}: PathListProps) {
  if (paths.length === 0) {
    return (
      <p className={styles.emptyState}>No allowed paths configured yet.</p>
    );
  }

  return (
    <Surface className={styles.container}>
      <ListBox aria-label='Allowed paths' selectionMode='none'>
        {paths.map((entry, i) => (
          <ListBox.Item key={entry.path} id={entry.path} textValue={entry.path}>
            <Label className={styles.entryPath}>{entry.path}</Label>
            <div className={styles.entryActions}>
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
            </div>
          </ListBox.Item>
        ))}
      </ListBox>
    </Surface>
  );
}
