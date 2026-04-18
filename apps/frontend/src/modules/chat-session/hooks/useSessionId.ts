import {use} from 'react';

import {
  SessionIdContext,
  type SessionIdContextValue,
} from '../contexts/SessionIdContext/index.js';

/**
 * Returns the session ID and lifecycle methods.
 * Must be used within a SessionIdProvider.
 */
export function useSessionId(): SessionIdContextValue {
  const value = use(SessionIdContext);
  if (!value) {
    throw new Error('useSessionId must be used within a SessionIdProvider');
  }
  return value;
}
