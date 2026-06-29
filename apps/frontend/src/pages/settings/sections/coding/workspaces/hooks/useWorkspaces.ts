import type {Workspace} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getWorkspaces,
  type InvalidPathEntry,
  InvalidPathsError,
  putWorkspaces,
} from '@/api/settings/file-access/index.js';

export type SaveResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]}
  | {success: false; error: string};

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getWorkspaces();
      setWorkspaces(data);
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
    async (entries: Workspace[]): Promise<SaveResult> => {
      setIsSaving(true);
      try {
        await putWorkspaces(entries);
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

  const addWorkspace = useCallback(
    (entry: Workspace) => save([...workspaces, entry]),
    [workspaces, save],
  );

  const removeWorkspace = useCallback(
    (index: number) => save(workspaces.filter((_, i) => i !== index)),
    [workspaces, save],
  );

  return {
    workspaces,
    isLoading,
    loadError,
    isSaving,
    addWorkspace,
    removeWorkspace,
    reload: load,
  };
}
