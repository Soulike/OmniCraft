import {useSessionConfig} from '../../../../../hooks/useSessionConfig.js';

export function useExtraAllowedPathsSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    selectedExtraAllowedPaths,
    setSelectedExtraAllowedPaths,
  } = useSessionConfig();

  return {
    allAllowedPathEntriesFromSettings,
    isLoading,
    selectedExtraAllowedPaths,
    setSelectedExtraAllowedPaths,
  };
}
