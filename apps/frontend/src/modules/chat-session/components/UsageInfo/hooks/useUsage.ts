import type {SseUsage, SseUsageUpdateEvent} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

/** Tracks token usage from real-time usage-update events on the given event bus. */
export function useUsage(eventBus: ChatEventBus) {
  const [usage, setUsage] = useState<SseUsage | null>(null);

  useEffect(() => {
    const handler = (event: SseUsageUpdateEvent) => {
      setUsage(event.usage);
    };

    const onReset = () => {
      setUsage(null);
    };

    eventBus.on('usage-update', handler);
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('usage-update', handler);
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus]);

  return {usage};
}
