import {toast} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback} from 'react';

import {FileAccessSectionView} from './FileAccessSectionView.js';
import {type SaveResult, useAllowedPaths} from './hooks/useAllowedPaths.js';

function showSaveResultToast(result: SaveResult) {
  if (result.success) {
    toast.success('Allowed paths saved');
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
  const {paths, isLoading, loadError, isSaving, addPath, removePath, reload} =
    useAllowedPaths();

  const handleAdd = useCallback(
    async (entry: AllowedPathEntry) => {
      showSaveResultToast(await addPath(entry));
    },
    [addPath],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      showSaveResultToast(await removePath(index));
    },
    [removePath],
  );

  return (
    <FileAccessSectionView
      paths={paths}
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
