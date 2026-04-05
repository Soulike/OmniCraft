import {ExtraAllowedPathsSelectView} from './ExtraAllowedPathsSelectView.js';
import {useExtraAllowedPathsSelect} from './hooks/useExtraAllowedPathsSelect.js';

export function ExtraAllowedPathsSelect() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    selectedExtraAllowedPaths,
    setSelectedExtraAllowedPaths,
  } = useExtraAllowedPathsSelect();

  return (
    <ExtraAllowedPathsSelectView
      allAllowedPathEntriesFromSettings={allAllowedPathEntriesFromSettings}
      isLoading={isLoading}
      selectedExtraAllowedPaths={selectedExtraAllowedPaths}
      onSelectionChange={setSelectedExtraAllowedPaths}
    />
  );
}
