import {useCallback} from 'react';

interface UseSessionLifecycleOptions {
  stopGeneration: () => void;
  clearSessionId: () => void;
  clearMessages: () => void;
  clearTitle: () => void;
  clearStreamError: () => void;
  clearMaxRoundsReached: () => void;
  clearToolOutput: () => void;
}

/** Orchestrates session transitions (new session, future: switch session). */
export function useSessionLifecycle({
  stopGeneration,
  clearSessionId,
  clearMessages,
  clearTitle,
  clearStreamError,
  clearMaxRoundsReached,
  clearToolOutput,
}: UseSessionLifecycleOptions) {
  const startNewSession = useCallback(() => {
    stopGeneration();
    clearSessionId();
    clearMessages();
    clearTitle();
    clearStreamError();
    clearMaxRoundsReached();
    clearToolOutput();
  }, [
    stopGeneration,
    clearSessionId,
    clearMessages,
    clearTitle,
    clearStreamError,
    clearMaxRoundsReached,
    clearToolOutput,
  ]);

  return {startNewSession};
}
