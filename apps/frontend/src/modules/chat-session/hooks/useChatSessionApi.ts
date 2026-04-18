import {use} from 'react';

import type {ChatSessionApi} from '../contexts/ChatSessionApiContext/index.js';
import {ChatSessionApiContext} from '../contexts/ChatSessionApiContext/index.js';

export function useChatSessionApi(): ChatSessionApi {
  const api = use(ChatSessionApiContext);
  if (!api) {
    throw new Error(
      'useChatSessionApi must be used within a ChatSessionApiContext provider',
    );
  }
  return api;
}
