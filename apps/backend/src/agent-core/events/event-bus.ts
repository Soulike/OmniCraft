import {EventEmitter} from 'node:events';

import type {Agent} from '../agent/agent.js';
import type {LlmSession} from '../llm-session/index.js';

interface EventBusEvents {
  'agent-created': [agent: Agent];
  'llm-session-created': [session: LlmSession];
}

class AgentEventBus extends EventEmitter<EventBusEvents> {}

/** Event bus for agent-core cross-module communication. */
export const agentEventBus = new AgentEventBus();
