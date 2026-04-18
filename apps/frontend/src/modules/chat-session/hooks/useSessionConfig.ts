import {use} from 'react';

import type {SessionConfigContextValue} from '../contexts/SessionConfigContext/index.js';
import {SessionConfigContext} from '../contexts/SessionConfigContext/index.js';

export function useSessionConfig(): SessionConfigContextValue {
  const value = use(SessionConfigContext);
  if (!value) {
    throw new Error(
      'useSessionConfig must be used within SessionConfigProvider',
    );
  }
  return value;
}
