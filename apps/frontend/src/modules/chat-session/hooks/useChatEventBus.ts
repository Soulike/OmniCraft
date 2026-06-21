import {use} from 'react';

import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {ChatEventBusContext} from '../contexts/ChatEventBusContext/index.js';

export function useChatEventBus(): ChatEventBus {
  const bus = use(ChatEventBusContext);
  if (!bus) {
    throw new Error('useChatEventBus must be used within ChatEventBusProvider');
  }
  return bus;
}
