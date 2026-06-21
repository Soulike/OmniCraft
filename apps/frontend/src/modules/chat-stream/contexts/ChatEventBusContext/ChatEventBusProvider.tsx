import type {ReactNode} from 'react';

import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {ChatEventBusContext} from './ChatEventBusContext.js';

interface ChatEventBusProviderProps {
  children: ReactNode;
  eventBus: ChatEventBus;
}

export function ChatEventBusProvider({
  children,
  eventBus,
}: ChatEventBusProviderProps) {
  return <ChatEventBusContext value={eventBus}>{children}</ChatEventBusContext>;
}
