import {type ReactNode, useState} from 'react';

import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventBus, ChatEventMap} from '../../types.js';
import {ChatEventBusContext} from './ChatEventBusContext.js';

export function ChatEventBusProvider({children}: {children: ReactNode}) {
  const [bus] = useState<ChatEventBus>(() => new EventBus<ChatEventMap>());

  return <ChatEventBusContext value={bus}>{children}</ChatEventBusContext>;
}
