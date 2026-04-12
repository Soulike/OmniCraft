import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import {useChatEventBus} from './useChatEventBus.js';

/** Tracks cumulative token usage from done events. */
export function useUsage() {
  const [usage, setUsage] = useState<SseUsage | null>(null);
  const eventBus = useChatEventBus();

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
