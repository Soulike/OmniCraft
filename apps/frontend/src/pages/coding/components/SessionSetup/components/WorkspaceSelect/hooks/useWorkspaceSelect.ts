import {useSessionConfig} from '@/modules/chat-session/index.js';

export function useWorkspaceSelect() {
  const {workspaces, isLoading, selectedWorkspace, setSelectedWorkspace} =
    useSessionConfig();

  return {
    isLoading,
    workspaces,
    selectedWorkspace,
    setSelectedWorkspace,
  };
}
