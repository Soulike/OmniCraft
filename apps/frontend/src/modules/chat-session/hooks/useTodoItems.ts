import type {SseTodoUpdateEvent} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import {useChatEventBus} from './useChatEventBus.js';

/** Subscribes to todo-update events and returns the current todo item list. */
export function useTodoItems() {
  const [items, setItems] = useState<SseTodoUpdateEvent['items']>([]);
  const eventBus = useChatEventBus();

  useEffect(() => {
    const onTodoUpdate = (data: SseTodoUpdateEvent) => {
      setItems(data.items);
    };
    const onReset = () => {
      setItems([]);
    };

    eventBus.on('todo-update', onTodoUpdate);
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('todo-update', onTodoUpdate);
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus]);

  return {items};
}
