import {useCallback, useEffect, useState} from 'react';

import {getVscodeStatus} from '@/api/vscode/index.js';

interface VscodeStatus {
  available: boolean;
  port: number;
  connectionToken: string;
  loading: boolean;
}

/** Polls the VSCode server status on mount. */
export function useVscodeStatus(): VscodeStatus {
  const [available, setAvailable] = useState(false);
  const [port, setPort] = useState(0);
  const [connectionToken, setConnectionToken] = useState('');
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    setLoading(true);
    try {
      const status = await getVscodeStatus();
      setAvailable(status.available);
      setPort(status.port);
      setConnectionToken(status.connectionToken);
    } catch {
      setAvailable(false);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return {available, port, connectionToken, loading};
}
