import type {AskUserBridgeResponse} from '@omnicraft/tool-schemas';
import {useCallback} from 'react';

import {useChatSessionApi} from './useChatSessionApi.js';
import {useSessionId} from './useSessionId.js';

/** Builds the ask_user submit handler for a page: delivers the user's response
 *  to the active session via the session API. Returns the delivery promise so
 *  the card can reset its state and let the user retry on failure. Error
 *  handling is owned by the ask UI, not the page. */
export function useAskUserSubmit(): (
  callId: string,
  result: AskUserBridgeResponse,
) => Promise<void> {
  const {sessionId} = useSessionId();
  const {submitToolResponse} = useChatSessionApi();

  return useCallback(
    (callId: string, result: AskUserBridgeResponse) => {
      if (sessionId === null) return Promise.resolve();
      return submitToolResponse(sessionId, callId, result);
    },
    [sessionId, submitToolResponse],
  );
}
