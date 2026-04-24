import {toast} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';
import {useCallback} from 'react';

import {FileAccessSectionView} from './FileAccessSectionView.js';
import {type SaveResult, useWorkspaces} from './hooks/useWorkspaces.js';

function showSaveResultToast(result: SaveResult) {
  if (result.success) {
    toast.success('Workspaces saved');
    return;
  }
  if ('invalidPaths' in result) {
    const details = result.invalidPaths
      .map((p) => `${p.path}: ${p.reason}`)
      .join('\n');
    toast.danger(details);
    return;
  }
  toast.danger(result.error);
}

export function FileAccessSection() {
  const {
    workspaces,
    isLoading,
    loadError,
    isSaving,
    addWorkspace,
    removeWorkspace,
    reload,
  } = useWorkspaces();

  const handleAdd = useCallback(
    async (entry: Workspace) => {
      showSaveResultToast(await addWorkspace(entry));
    },
    [addWorkspace],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      showSaveResultToast(await removeWorkspace(index));
    },
    [removeWorkspace],
  );

  return (
    <FileAccessSectionView
      workspaces={workspaces}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      onAdd={(entry) => {
        void handleAdd(entry);
      }}
      onRemove={(index) => {
        void handleRemove(index);
      }}
      onRetry={() => {
        void reload();
      }}
    />
  );
}
