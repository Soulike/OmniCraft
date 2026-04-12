import {createContext} from 'react';

import type {ChatEventBus} from '../../components/StreamingMessageDisplay/index.js';

export const ChatEventBusContext = createContext<ChatEventBus | null>(null);
