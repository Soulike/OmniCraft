import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import type {ChatEventBus} from '../components/StreamingMessageDisplay/index.js';

/** Tracks token usage from done events on the given event bus. */
export function useUsage(eventBus: ChatEventBus) {
  const [usage, setUsage] = useState<SseUsage | null>(null);

  useEffect(() => {
    const handler = (data: {usage: SseUsage}) => {
      setUsage(data.usage);
    };
    eventBus.on('done', handler);
    return () => {
      eventBus.off('done', handler);
    };
  }, [eventBus]);

  return {usage};
}
