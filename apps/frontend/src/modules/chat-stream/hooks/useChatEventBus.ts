import {use} from 'react';

import {ChatEventBusContext} from '../contexts/ChatEventBusContext/index.js';
import type {ChatEventBus} from '../types.js';

export function useChatEventBus(): ChatEventBus {
  const bus = use(ChatEventBusContext);
  if (!bus) {
    throw new Error('useChatEventBus must be used within ChatEventBusProvider');
  }
  return bus;
}
