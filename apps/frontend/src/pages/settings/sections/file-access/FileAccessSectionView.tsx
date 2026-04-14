import {Alert, Skeleton} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {LoadError} from '@/components/LoadError/index.js';

import {AddPathForm} from './components/AddPathForm/index.js';
import {PathList} from './components/PathList/index.js';
import styles from './styles.module.css';

interface FileAccessSectionViewProps {
  paths: AllowedPathEntry[];
  isLoading: boolean;
  loadError: string | null;
  isSaving: boolean;
  onAdd: (entry: AllowedPathEntry) => void;
  onRemove: (index: number) => void;
  onRetry: () => void;
}

export function FileAccessSectionView({
  paths,
  isLoading,
  loadError,
  isSaving,
  onAdd,
  onRemove,
  onRetry,
}: FileAccessSectionViewProps) {
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
          <PathList paths={paths} isSaving={isSaving} onRemove={onRemove} />
          <AddPathForm onAdd={onAdd} isSaving={isSaving} />
        </>
      )}
    </div>
  );
}
