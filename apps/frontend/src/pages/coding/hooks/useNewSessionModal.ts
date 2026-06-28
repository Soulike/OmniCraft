import {useCallback, useState} from 'react';

interface UseNewSessionModalOptions {
  /** Creates a new session in the given workspace and sends the first task. */
  readonly sendMessageToNewSession: (
    content: string,
    options: {workspace: string},
  ) => Promise<unknown>;
  /**
   * Called after a session is successfully created in the given workspace —
   * e.g. to record it as the active workspace for the VSCode link and to scroll.
   */
  readonly onCreated?: (workspacePath: string) => void;
}

interface UseNewSessionModalResult {
  /** The workspace the modal targets, or null when closed. */
  readonly workspace: string | null;
  readonly open: (workspacePath: string) => void;
  readonly close: () => void;
  readonly submit: (task: string) => Promise<void>;
}

/**
 * Owns the "new task" modal: which workspace it targets, opening/closing, and
 * creating the session on submit. Keeps the page container to thin wiring.
 */
export function useNewSessionModal({
  sendMessageToNewSession,
  onCreated,
}: UseNewSessionModalOptions): UseNewSessionModalResult {
  const [workspace, setWorkspace] = useState<string | null>(null);

  const open = useCallback((workspacePath: string) => {
    setWorkspace(workspacePath);
  }, []);

  const close = useCallback(() => {
    setWorkspace(null);
  }, []);

  const submit = useCallback(
    async (task: string) => {
      if (workspace === null) {
        return;
      }
      // Create first; only close (and mark the workspace active) on success,
      // so a failure surfaces in the still-open modal rather than being
      // swallowed, and cancelling never mutates the active workspace.
      await sendMessageToNewSession(task, {workspace});
      setWorkspace(null);
      onCreated?.(workspace);
    },
    [workspace, sendMessageToNewSession, onCreated],
  );

  return {workspace, open, close, submit};
}
