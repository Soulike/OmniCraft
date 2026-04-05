import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';

import {getAllowedPaths} from '@/api/settings/file-access/index.js';

import {SessionConfigContext} from './SessionConfigContext.js';

export function SessionConfigProvider({children}: {children: ReactNode}) {
  const [allAllowedPathsFromSettings, setAllAllowedPathsFromSettings] =
    useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<
    string | undefined
  >(undefined);
  const [selectedExtraAllowedPaths, setSelectedExtraAllowedPaths] = useState<
    string[]
  >([]);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setAllAllowedPathsFromSettings(await getAllowedPaths());
    } catch (e) {
      setLoadError(
        e instanceof Error ? e.message : 'Failed to load allowed paths',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedExtraAllowedPathEntries = useMemo(
    () =>
      allAllowedPathsFromSettings.filter((p) =>
        selectedExtraAllowedPaths.includes(p.path),
      ),
    [allAllowedPathsFromSettings, selectedExtraAllowedPaths],
  );

  const value = useMemo(
    () => ({
      allAllowedPathsFromSettings,
      isLoading,
      loadError,
      selectedWorkspace,
      selectedExtraAllowedPaths,
      selectedExtraAllowedPathEntries,
      setSelectedWorkspace,
      setSelectedExtraAllowedPaths,
    }),
    [
      allAllowedPathsFromSettings,
      isLoading,
      loadError,
      selectedWorkspace,
      selectedExtraAllowedPaths,
      selectedExtraAllowedPathEntries,
    ],
  );

  return <SessionConfigContext value={value}>{children}</SessionConfigContext>;
}
