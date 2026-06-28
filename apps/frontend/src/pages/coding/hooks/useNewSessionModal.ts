import {useCallback, useState} from 'react';

interface UseNewSessionModalOptions {
  /** Creates a new session in the given workspace and sends the first task. */
  readonly sendMessageToNewSession: (
    content: string,
    options: {workspace: string},
  ) => Promise<unknown>;
  /**
   * Called when the modal opens for a workspace — e.g. to record it as the
   * active workspace for the VSCode link.
   */
  readonly onOpen?: (workspacePath: string) => void;
  /** Called after a task is submitted — e.g. to scroll the message list. */
  readonly onSubmitted?: () => void;
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
  onOpen,
  onSubmitted,
}: UseNewSessionModalOptions): UseNewSessionModalResult {
  const [workspace, setWorkspace] = useState<string | null>(null);

  const open = useCallback(
    (workspacePath: string) => {
      onOpen?.(workspacePath);
      setWorkspace(workspacePath);
    },
    [onOpen],
  );

  const close = useCallback(() => {
    setWorkspace(null);
  }, []);

  const submit = useCallback(
    async (task: string) => {
      if (workspace === null) {
        return;
      }
      setWorkspace(null);
      await sendMessageToNewSession(task, {workspace});
      onSubmitted?.();
    },
    [workspace, sendMessageToNewSession, onSubmitted],
  );

  return {workspace, open, close, submit};
}
