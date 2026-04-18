import {useMemo} from 'react';

import {useSessionConfig} from '@/modules/chat-session/index.js';

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
