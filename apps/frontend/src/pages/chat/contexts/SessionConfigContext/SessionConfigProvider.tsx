import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';

import {getAllowedPaths} from '@/api/settings/file-access/index.js';

import {SessionConfigContext} from './SessionConfigContext.js';

export function SessionConfigProvider({children}: {children: ReactNode}) {
  const [allowedPaths, setAllowedPaths] = useState<AllowedPathEntry[]>([]);
  const [pathsLoading, setPathsLoading] = useState(true);
  const [pathsError, setPathsError] = useState<string | null>(null);
  const [workspace, setWorkspace] = useState<string | undefined>(undefined);
  const [extraAllowedPaths, setExtraAllowedPaths] = useState<string[]>([]);

  const load = useCallback(async () => {
    setPathsLoading(true);
    setPathsError(null);
    try {
      setAllowedPaths(await getAllowedPaths());
    } catch (e) {
      setPathsError(
        e instanceof Error ? e.message : 'Failed to load allowed paths',
      );
    } finally {
      setPathsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const resolvedExtraPaths = useMemo(
    () => allowedPaths.filter((p) => extraAllowedPaths.includes(p.path)),
    [allowedPaths, extraAllowedPaths],
  );

  const value = useMemo(
    () => ({
      allowedPaths,
      pathsLoading,
      pathsError,
      workspace,
      extraAllowedPaths,
      resolvedExtraPaths,
      setWorkspace,
      setExtraAllowedPaths,
    }),
    [
      allowedPaths,
      pathsLoading,
      pathsError,
      workspace,
      extraAllowedPaths,
      resolvedExtraPaths,
    ],
  );

  return <SessionConfigContext value={value}>{children}</SessionConfigContext>;
}
