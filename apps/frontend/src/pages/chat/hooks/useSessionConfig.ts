import {useState} from 'react';

export function useSessionConfig() {
  const [workspace, setWorkspace] = useState<string | undefined>(undefined);
  const [extraAllowedPaths, setExtraAllowedPaths] = useState<string[]>([]);

  return {
    workspace,
    setWorkspace,
    extraAllowedPaths,
    setExtraAllowedPaths,
  };
}
