import {createContext} from 'react';

import type {AskUserSubmitHandler} from '../../types.js';

/** null means this stream has no submit capability — ask_user cards render
 *  read-only/disabled. */
export const AskUserSubmitContext = createContext<AskUserSubmitHandler | null>(
  null,
);
