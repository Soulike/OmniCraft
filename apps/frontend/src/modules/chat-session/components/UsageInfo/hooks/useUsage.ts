import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

/** Tracks token usage from done events on the given event bus. */
export function useUsage(eventBus: ChatEventBus) {
  const [usage, setUsage] = useState<SseUsage | null>(null);

  useEffect(() => {
    const handler = (data: {usage: SseUsage}) => {
      setUsage(data.usage);
    };

    const onReset = () => {
      setUsage(null);
    };

    eventBus.on('done', handler);
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('done', handler);
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus]);

  return {usage};
}
