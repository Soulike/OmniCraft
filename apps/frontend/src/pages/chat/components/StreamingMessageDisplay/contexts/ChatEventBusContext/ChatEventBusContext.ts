import {createContext} from 'react';

import type {ChatEventBus} from '../../types.js';

export const ChatEventBusContext = createContext<ChatEventBus | null>(null);
