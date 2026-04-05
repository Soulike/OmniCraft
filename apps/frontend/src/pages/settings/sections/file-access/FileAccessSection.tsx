import {toast} from '@heroui/react';
import {useCallback} from 'react';

import {FileAccessSectionView} from './FileAccessSectionView.js';
import {useAllowedPaths} from './hooks/useAllowedPaths.js';

export function FileAccessSection() {
  const {
    paths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    save,
    addPath,
    removePath,
    reload,
  } = useAllowedPaths();

  const handleSave = useCallback(async () => {
    const success = await save(paths);
    if (success) {
      toast.success('Allowed paths saved');
    } else {
      toast.danger('Failed to save allowed paths');
    }
  }, [save, paths]);

  return (
    <FileAccessSectionView
      paths={paths}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      saveError={saveError}
      onAdd={addPath}
      onRemove={removePath}
      onSave={() => {
        void handleSave();
      }}
      onRetry={() => {
        void reload();
      }}
    />
  );
}
