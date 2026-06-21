import {createContext} from 'react';

import type {ChatEventBus} from '@/modules/chat-stream/index.js';

export const ChatEventBusContext = createContext<ChatEventBus | null>(null);
