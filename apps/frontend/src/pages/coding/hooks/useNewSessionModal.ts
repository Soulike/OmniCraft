import {useCallback, useState} from 'react';

interface UseNewSessionModalOptions {
  /**
   * Creates a new session in the given workspace and sends the first task.
   * Resolves the new session id, or null if creation/send did not happen.
   */
  readonly sendMessageToNewSession: (
    content: string,
    options: {workspace: string},
  ) => Promise<string | null>;
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
      // Only close (and mark the workspace active) when a session was actually
      // created. sendMessageToNewSession resolves null on failure, so leaving
      // the modal open lets the failure surface there instead of vanishing.
      const created = await sendMessageToNewSession(task, {workspace});
      if (created === null) {
        return;
      }
      setWorkspace(null);
      onCreated?.(workspace);
    },
    [workspace, sendMessageToNewSession, onCreated],
  );

  return {workspace, open, close, submit};
}
