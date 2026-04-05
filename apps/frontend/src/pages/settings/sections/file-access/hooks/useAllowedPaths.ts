import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getAllowedPaths,
  putAllowedPaths,
} from '@/api/settings/file-access/index.js';

export function useAllowedPaths() {
  const [paths, setPaths] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getAllowedPaths();
      setPaths(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (entries: AllowedPathEntry[]) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await putAllowedPaths(entries);
        return true;
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Failed to save');
        return false;
      } finally {
        setIsSaving(false);
        await load();
      }
    },
    [load],
  );

  const addPath = useCallback((entry: AllowedPathEntry) => {
    setPaths((prev) => [...prev, entry]);
  }, []);

  const removePath = useCallback((index: number) => {
    setPaths((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    paths,
    setPaths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    save,
    addPath,
    removePath,
    reload: load,
  };
}
