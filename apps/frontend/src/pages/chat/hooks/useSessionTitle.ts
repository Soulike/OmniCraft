import {useEffect, useRef, useState} from 'react';

import {generateTitle} from '@/api/chat/index.js';

import type {ChatEventMap} from '../types.js';
import {useChatEventBus} from './useChatEventBus.js';

/**
 * Manages the session title. Subscribes to `stream-done` and generates
 * a title after the first assistant reply. Fire-and-forget — errors are
 * logged but not surfaced to the user.
 */
export function useSessionTitle() {
  const [title, setTitle] = useState<string | null>(null);
  const eventBus = useChatEventBus();
  const titleRequestedRef = useRef(false);

  useEffect(() => {
    const onStreamDone = (data: ChatEventMap['stream-done']) => {
      if (titleRequestedRef.current) return;
      if (!data.assistantMessage) return;

      titleRequestedRef.current = true;
      void generateTitle(
        data.sessionId,
        data.userMessage,
        data.assistantMessage,
      ).then(
        (generated) => {
          setTitle(generated);
        },
        (e: unknown) => {
          console.error('Failed to generate session title', e);
        },
      );
    };

    eventBus.on('stream-done', onStreamDone);
    return () => {
      eventBus.off('stream-done', onStreamDone);
    };
  }, [eventBus]);

  return {title};
}
