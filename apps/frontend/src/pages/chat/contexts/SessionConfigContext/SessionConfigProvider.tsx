import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';

import {getAllowedPaths} from '@/api/settings/file-access/index.js';

import {SessionConfigContext} from './SessionConfigContext.js';

export function SessionConfigProvider({children}: {children: ReactNode}) {
  const [
    allAllowedPathEntriesFromSettings,
    setAllAllowedPathEntriesFromSettings,
  ] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
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
      setAllAllowedPathEntriesFromSettings(await getAllowedPaths());
    } catch (e) {
      setLoadError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedExtraAllowedPathEntries = useMemo(
    () =>
      allAllowedPathEntriesFromSettings.filter((p) =>
        selectedExtraAllowedPaths.includes(p.path),
      ),
    [allAllowedPathEntriesFromSettings, selectedExtraAllowedPaths],
  );

  const value = useMemo(
    () => ({
      allAllowedPathEntriesFromSettings,
      isLoading,
      loadError,
      selectedWorkspace,
      selectedExtraAllowedPaths,
      selectedExtraAllowedPathEntries,
      setSelectedWorkspace,
      setSelectedExtraAllowedPaths,
    }),
    [
      allAllowedPathEntriesFromSettings,
      isLoading,
      loadError,
      selectedWorkspace,
      selectedExtraAllowedPaths,
      selectedExtraAllowedPathEntries,
    ],
  );

  return <SessionConfigContext value={value}>{children}</SessionConfigContext>;
}
