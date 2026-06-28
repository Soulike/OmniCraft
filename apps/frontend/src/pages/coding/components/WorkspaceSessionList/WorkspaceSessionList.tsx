import {useWorkspaceSessionList} from './hooks/useWorkspaceSessionList.js';
import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

interface WorkspaceSessionListProps {
  readonly onNewSession: (workspacePath: string) => void;
}

export function WorkspaceSessionList({
  onNewSession,
}: WorkspaceSessionListProps) {
  const props = useWorkspaceSessionList({onNewSession});
  return <WorkspaceSessionListView {...props} />;
}
