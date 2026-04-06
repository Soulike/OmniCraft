import {useCallback} from 'react';

interface UseSessionLifecycleOptions {
  stopGeneration: () => void;
  clearSessionId: () => void;
  clearMessages: () => void;
  clearTitle: () => void;
  clearStreamError: () => void;
  clearMaxRoundsReached: () => void;
}

/** Orchestrates session transitions (new session, future: switch session). */
export function useSessionLifecycle({
  stopGeneration,
  clearSessionId,
  clearMessages,
  clearTitle,
  clearStreamError,
  clearMaxRoundsReached,
}: UseSessionLifecycleOptions) {
  const startNewSession = useCallback(() => {
    stopGeneration();
    clearSessionId();
    clearMessages();
    clearTitle();
    clearStreamError();
    clearMaxRoundsReached();
  }, [
    stopGeneration,
    clearSessionId,
    clearMessages,
    clearTitle,
    clearStreamError,
    clearMaxRoundsReached,
  ]);

  return {startNewSession};
}
