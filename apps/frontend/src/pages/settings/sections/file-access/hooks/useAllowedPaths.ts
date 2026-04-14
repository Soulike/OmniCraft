import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getAllowedPaths,
  type InvalidPathEntry,
  InvalidPathsError,
  putAllowedPaths,
} from '@/api/settings/file-access/index.js';

export type SaveResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]}
  | {success: false; error: string};

export function useAllowedPaths() {
  const [paths, setPaths] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

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
    async (entries: AllowedPathEntry[]): Promise<SaveResult> => {
      setIsSaving(true);
      try {
        await putAllowedPaths(entries);
        await load();
        return {success: true};
      } catch (e) {
        if (e instanceof InvalidPathsError) {
          await load();
          return {success: false, invalidPaths: [...e.invalidPaths]};
        }
        await load();
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to save',
        };
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addPath = useCallback(
    (entry: AllowedPathEntry) => save([...paths, entry]),
    [paths, save],
  );

  const removePath = useCallback(
    (index: number) => save(paths.filter((_, i) => i !== index)),
    [paths, save],
  );

  return {
    paths,
    isLoading,
    loadError,
    isSaving,
    addPath,
    removePath,
    reload: load,
  };
}
