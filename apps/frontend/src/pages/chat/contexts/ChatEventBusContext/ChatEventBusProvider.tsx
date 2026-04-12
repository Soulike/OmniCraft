import type {ReactNode} from 'react';
import {useState} from 'react';

import {EventBus} from '@/helpers/event-bus.js';

import type {ChatEventMap} from '../../components/StreamingMessageDisplay/index.js';
import {ChatEventBusContext} from './ChatEventBusContext.js';

interface ChatEventBusProviderProps {
  children: ReactNode;
}

export function ChatEventBusProvider({children}: ChatEventBusProviderProps) {
  const [bus] = useState(() => new EventBus<ChatEventMap>());
  return <ChatEventBusContext value={bus}>{children}</ChatEventBusContext>;
}
