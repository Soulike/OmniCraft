import {useMemo} from 'react';

import {useSessionConfig} from '../../../../../hooks/useSessionConfig.js';

export function useWorkspaceSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    selectedWorkspace,
    setSelectedWorkspace,
  } = useSessionConfig();

  const readWritePaths = useMemo(
    () =>
      allAllowedPathEntriesFromSettings.filter((p) => p.mode === 'read-write'),
    [allAllowedPathEntriesFromSettings],
  );

  return {
    isLoading,
    readWritePaths,
    selectedWorkspace,
    setSelectedWorkspace,
  };
}
