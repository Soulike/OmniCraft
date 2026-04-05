import {Button, Chip, Label, ListBox, Surface} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import type {InvalidPathEntry} from '@/api/settings/file-access/index.js';

import styles from './styles.module.css';

interface PathListProps {
  paths: readonly AllowedPathEntry[];
  invalidPaths: readonly InvalidPathEntry[];
  onRemove: (index: number) => void;
}

export function PathList({paths, invalidPaths, onRemove}: PathListProps) {
  if (paths.length === 0) {
    return (
      <p className={styles.emptyState}>No allowed paths configured yet.</p>
    );
  }

  const invalidByPath = new Map(
    invalidPaths.map((entry) => [entry.path, entry.reason]),
  );

  return (
    <Surface className={styles.container}>
      <ListBox aria-label='Allowed paths' selectionMode='none'>
        {paths.map((entry, i) => {
          const error = invalidByPath.get(entry.path);
          return (
            <ListBox.Item key={i} id={i} textValue={entry.path}>
              <div className={styles.entryContent}>
                <Label className={styles.entryPath}>{entry.path}</Label>
                {error && <p className={styles.entryError}>{error}</p>}
              </div>
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
          );
        })}
      </ListBox>
    </Surface>
  );
}
