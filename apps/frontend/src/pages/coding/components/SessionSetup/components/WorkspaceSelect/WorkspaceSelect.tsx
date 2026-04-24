import {useWorkspaceSelect} from './hooks/useWorkspaceSelect.js';
import {WorkspaceSelectView} from './WorkspaceSelectView.js';

export function WorkspaceSelect() {
  const {isLoading, workspaces, selectedWorkspace, setSelectedWorkspace} =
    useWorkspaceSelect();

  return (
    <WorkspaceSelectView
      isLoading={isLoading}
      workspaces={workspaces}
      selectedWorkspace={selectedWorkspace}
      onWorkspaceChange={setSelectedWorkspace}
    />
  );
}
