import {toast} from '@heroui/react';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getAllowedPaths,
  type InvalidPathEntry,
  InvalidPathsError,
  putAllowedPaths,
} from '@/api/settings/file-access/index.js';

export function useAllowedPaths() {
  const [paths, setPaths] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [invalidPaths, setInvalidPaths] = useState<InvalidPathEntry[]>([]);

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
      setInvalidPaths([]);
      try {
        await putAllowedPaths(entries);
        await load();
        toast.success('Allowed paths saved');
      } catch (e) {
        if (e instanceof InvalidPathsError) {
          setInvalidPaths([...e.invalidPaths]);
        }
        toast.danger('Failed to save allowed paths');
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addPath = useCallback(
    (entry: AllowedPathEntry) => {
      const next = [...paths, entry];
      setPaths(next);
      void save(next);
    },
    [paths, save],
  );

  const removePath = useCallback(
    (index: number) => {
      const next = paths.filter((_, i) => i !== index);
      setPaths(next);
      void save(next);
    },
    [paths, save],
  );

  return {
    paths,
    isLoading,
    loadError,
    isSaving,
    invalidPaths,
    addPath,
    removePath,
    reload: load,
  };
}
