import {ToolRegistry} from '@/agent-core/tool/index.js';

import {askUserTool} from './ask-user.js';

/** Registry for client-side tools that require user interaction. */
export class ClientToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(askUserTool);
  }
}

export const clientToolRegistry = new ClientToolRegistry();
