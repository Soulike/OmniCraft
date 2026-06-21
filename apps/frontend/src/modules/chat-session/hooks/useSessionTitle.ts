import {useEffect, useState} from 'react';

import type {ChatEventMap} from '@/modules/chat-events/index.js';

import {useChatEventBus} from './useChatEventBus.js';

/** Tracks the session title from backend-generated `session-title` SSE events. */
export function useSessionTitle() {
  const [title, setTitle] = useState<string | null>(null);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const onSessionTitle = (data: ChatEventMap['session-title']) => {
      setTitle(data.title);
    };

    const onReset = () => {
      setTitle(null);
    };

    eventBus.on('session-title', onSessionTitle);
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('session-title', onSessionTitle);
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus]);

  return {title};
}
