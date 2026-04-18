import {useSessionConfig} from '@/modules/chat-session/index.js';

import {SessionSetupView} from './SessionSetupView.js';

export function SessionSetup() {
  const {
    allAllowedPathEntriesFromSettings,
    isLoading,
    loadError,
    selectedWorkspace,
  } = useSessionConfig();

  const hasConfiguredPaths =
    !isLoading && !loadError && allAllowedPathEntriesFromSettings.length > 0;

  return (
    <SessionSetupView
      isLoading={isLoading}
      loadError={loadError}
      hasConfiguredPaths={hasConfiguredPaths}
      selectedWorkspace={selectedWorkspace}
    />
  );
}
