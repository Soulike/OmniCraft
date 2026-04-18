import {useSessionConfig} from '@/modules/chat-session/index.js';

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
