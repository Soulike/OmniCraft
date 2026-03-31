import {EventEmitter} from 'node:events';

import type {Agent} from '@/agent-core/agent/index.js';
import type {LlmSession} from '@/agent-core/llm-session/index.js';

interface EventBusEvents {
  'agent-created': [agent: Agent];
  'llm-session-created': [session: LlmSession];
}

class AppEventBus extends EventEmitter<EventBusEvents> {}

/** Global event bus for cross-module communication. */
export const eventBus = new AppEventBus();
