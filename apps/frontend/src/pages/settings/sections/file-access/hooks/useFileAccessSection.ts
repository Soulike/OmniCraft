import {toast} from '@heroui/react';
import {useCallback} from 'react';

import {useAllowedPaths} from './useAllowedPaths.js';

export function useFileAccessSection() {
  const {
    paths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    invalidPaths,
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

  const onSave = useCallback(() => {
    void handleSave();
  }, [handleSave]);

  const onRetry = useCallback(() => {
    void reload();
  }, [reload]);

  return {
    paths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    invalidPaths,
    addPath,
    removePath,
    onSave,
    onRetry,
  };
}
