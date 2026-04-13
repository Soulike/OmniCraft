import {useCallback, useEffect, useState} from 'react';

import {getVscodeStatus} from '@/api/vscode/index.js';

/** Polls the VSCode server status on mount. */
export function useVscodeStatus(): {available: boolean; loading: boolean} {
  const [available, setAvailable] = useState(false);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const {available} = await getVscodeStatus();
      setAvailable(available);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return {available, loading};
}
