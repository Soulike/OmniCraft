import {useCallback, useEffect, useState} from 'react';

import type {ChatEventMap} from '../components/StreamingMessageDisplay/index.js';
import {useChatEventBus} from './useChatEventBus.js';

/** Tracks the session title from backend-generated `session-title` SSE events. */
export function useSessionTitle() {
  const [title, setTitle] = useState<string | null>(null);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const onSessionTitle = (data: ChatEventMap['session-title']) => {
      setTitle(data.title);
    };

    eventBus.on('session-title', onSessionTitle);
    return () => {
      eventBus.off('session-title', onSessionTitle);
    };
  }, [eventBus]);

  const clearTitle = useCallback(() => {
    setTitle(null);
  }, []);

  return {title, clearTitle};
}
