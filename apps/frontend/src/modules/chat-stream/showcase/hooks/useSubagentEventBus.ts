import {useState} from 'react';

import type {ChatEventBus} from '@/modules/chat-events/index.js';

import {makeSubagentEventBus} from '../mock-data.js';

/** Creates a stable mock event bus for the showcase's subagent specimens. */
export function useSubagentEventBus(): ChatEventBus {
  const [subagentEventBus] = useState(makeSubagentEventBus);

  return subagentEventBus;
}
