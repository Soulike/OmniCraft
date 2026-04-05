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
  const [saveError, setSaveError] = useState<string | null>(null);
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
      setSaveError(null);
      setInvalidPaths([]);
      try {
        await putAllowedPaths(entries);
        await load();
        return true;
      } catch (e) {
        if (e instanceof InvalidPathsError) {
          setInvalidPaths([...e.invalidPaths]);
        } else {
          setSaveError(e instanceof Error ? e.message : 'Failed to save');
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addPath = useCallback((entry: AllowedPathEntry) => {
    setPaths((prev) => [...prev, entry]);
    setInvalidPaths([]);
  }, []);

  const removePath = useCallback((index: number) => {
    setPaths((prev) => prev.filter((_, i) => i !== index));
    setInvalidPaths([]);
  }, []);

  return {
    paths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    invalidPaths,
    save,
    addPath,
    removePath,
    reload: load,
  };
}
