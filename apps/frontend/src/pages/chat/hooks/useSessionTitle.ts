import {useCallback, useState} from 'react';

import {generateTitle} from '@/api/chat/index.js';

/**
 * Manages the session title. Calls the generate-title API and stores the result.
 * Title generation is fire-and-forget — errors are logged but not surfaced to the user.
 */
export function useSessionTitle() {
  const [title, setTitle] = useState<string | null>(null);

  const requestTitle = useCallback(
    async (
      sessionId: string,
      userMessage: string,
      assistantMessage: string,
    ) => {
      try {
        const generated = await generateTitle(
          sessionId,
          userMessage,
          assistantMessage,
        );
        setTitle(generated);
      } catch (e) {
        console.error('Failed to generate session title', e);
      }
    },
    [],
  );

  return {title, requestTitle};
}
