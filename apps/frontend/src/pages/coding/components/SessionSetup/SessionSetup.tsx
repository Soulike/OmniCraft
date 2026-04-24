import {useSessionConfig} from '@/modules/chat-session/index.js';

import {SessionSetupView} from './SessionSetupView.js';

export function SessionSetup() {
  const {workspaces, isLoading, loadError, selectedWorkspace} =
    useSessionConfig();

  const hasConfiguredWorkspaces =
    !isLoading && !loadError && workspaces.length > 0;

  return (
    <SessionSetupView
      isLoading={isLoading}
      loadError={loadError}
      hasConfiguredWorkspaces={hasConfiguredWorkspaces}
      selectedWorkspace={selectedWorkspace}
    />
  );
}
