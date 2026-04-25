import {Skeleton} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';

import {LoadError} from '@/components/LoadError/index.js';

import {AddPathForm} from './components/AddPathForm/index.js';
import {PathList} from './components/PathList/index.js';
import styles from './styles.module.css';

interface WorkspacesSectionViewProps {
  workspaces: Workspace[];
  isLoading: boolean;
  loadError: string | null;
  isSaving: boolean;
  onAdd: (entry: Workspace) => void;
  onRemove: (index: number) => void;
  onRetry: () => void;
}

export function WorkspacesSectionView({
  workspaces,
  isLoading,
  loadError,
  isSaving,
  onAdd,
  onRemove,
  onRetry,
}: WorkspacesSectionViewProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.title}>Workspaces</h2>
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
          <PathList
            workspaces={workspaces}
            isSaving={isSaving}
            onRemove={onRemove}
          />
          <AddPathForm onAdd={onAdd} isSaving={isSaving} />
        </>
      )}
    </div>
  );
}
