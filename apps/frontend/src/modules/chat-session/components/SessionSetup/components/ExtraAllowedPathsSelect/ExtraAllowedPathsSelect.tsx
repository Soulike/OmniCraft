import {useSessionConfig} from '../../../../hooks/useSessionConfig.js';
import {ExtraAllowedPathsSelectView} from './ExtraAllowedPathsSelectView.js';

export function ExtraAllowedPathsSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    selectedExtraAllowedPaths,
    setSelectedExtraAllowedPaths,
  } = useSessionConfig();

  return (
    <ExtraAllowedPathsSelectView
      allAllowedPathEntriesFromSettings={allAllowedPathEntriesFromSettings}
      isLoading={isLoading}
      selectedExtraAllowedPaths={selectedExtraAllowedPaths}
      onSelectionChange={setSelectedExtraAllowedPaths}
    />
  );
}
