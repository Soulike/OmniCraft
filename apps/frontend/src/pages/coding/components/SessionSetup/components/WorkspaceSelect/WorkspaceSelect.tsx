import {useWorkspaceSelect} from './hooks/useWorkspaceSelect.js';
import {WorkspaceSelectView} from './WorkspaceSelectView.js';

export function WorkspaceSelect() {
  const {isLoading, readWritePaths, selectedWorkspace, setSelectedWorkspace} =
    useWorkspaceSelect();

  return (
    <WorkspaceSelectView
      isLoading={isLoading}
      readWritePaths={readWritePaths}
      selectedWorkspace={selectedWorkspace}
      onWorkspaceChange={setSelectedWorkspace}
    />
  );
}
