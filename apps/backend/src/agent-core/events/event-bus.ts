import {EventEmitter} from 'node:events';

import type {Agent} from '../agent/agent.js';

interface EventBusEvents {
  'agent-created': [agent: Agent];
}

class AgentEventBus extends EventEmitter<EventBusEvents> {}

/** Event bus for agent-core cross-module communication. */
export const agentEventBus = new AgentEventBus();
