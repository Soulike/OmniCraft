import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import {useChatEventBus} from './useChatEventBus.js';

/** Tracks cumulative token usage from stream-done events. */
export function useUsage() {
  const [usage, setUsage] = useState<SseUsage | null>(null);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const handler = (data: {usage: SseUsage}) => {
      setUsage(data.usage);
    };
    eventBus.on('stream-done', handler);
    return () => {
      eventBus.off('stream-done', handler);
    };
  }, [eventBus]);

  return {usage};
}
