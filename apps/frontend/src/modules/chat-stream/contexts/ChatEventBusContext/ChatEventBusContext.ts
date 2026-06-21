import {createContext} from 'react';

import type {ChatEventBus} from '@/modules/chat-events/index.js';

export const ChatEventBusContext = createContext<ChatEventBus | null>(null);
