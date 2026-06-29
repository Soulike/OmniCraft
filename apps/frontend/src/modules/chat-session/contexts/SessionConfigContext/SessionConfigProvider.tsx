import type {Workspace} from '@omnicraft/settings-schema';
import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';

import {getWorkspaces} from '@/api/settings/file-access/index.js';

import {SessionConfigContext} from './SessionConfigContext.js';

export function SessionConfigProvider({children}: {children: ReactNode}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<
    string | undefined
  >(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setWorkspaces(await getWorkspaces());
    } catch (e) {
      setLoadError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(
    () => ({
      workspaces,
      isLoading,
      loadError,
      reload: load,
      selectedWorkspace,
      setSelectedWorkspace,
    }),
    [workspaces, isLoading, loadError, load, selectedWorkspace],
  );

  return <SessionConfigContext value={value}>{children}</SessionConfigContext>;
}
