import {createContext} from 'react';

import type {AskUserSubmitHandler} from '@/modules/chat-events/index.js';

/** null means this stream has no submit capability — ask_user cards render
 *  read-only/disabled. */
export const AskUserSubmitContext = createContext<AskUserSubmitHandler | null>(
  null,
);
