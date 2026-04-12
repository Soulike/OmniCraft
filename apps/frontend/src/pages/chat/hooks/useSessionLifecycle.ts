import {useCallback} from 'react';

interface UseSessionLifecycleOptions {
  stopGeneration: () => void;
  clearSessionId: () => void;
  resetDisplay: () => void;
  clearTitle: () => void;
  clearStreamError: () => void;
  clearMaxRoundsReached: () => void;
}

/** Orchestrates session transitions (new session, future: switch session). */
export function useSessionLifecycle({
  stopGeneration,
  clearSessionId,
  resetDisplay,
  clearTitle,
  clearStreamError,
  clearMaxRoundsReached,
}: UseSessionLifecycleOptions) {
  const startNewSession = useCallback(() => {
    stopGeneration();
    clearSessionId();
    resetDisplay();
    clearTitle();
    clearStreamError();
    clearMaxRoundsReached();
  }, [
    stopGeneration,
    clearSessionId,
    resetDisplay,
    clearTitle,
    clearStreamError,
    clearMaxRoundsReached,
  ]);

  return {startNewSession};
}
