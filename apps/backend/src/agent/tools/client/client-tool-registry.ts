import {ToolRegistry} from '@/agent-core/tool/index.js';

import {askUserTool} from './ask-user.js';

/** Registry for client-side tools that require user interaction. */
export class ClientToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all client-side tools. */
  static override create(): ClientToolRegistry {
    const instance = super.create() as ClientToolRegistry;
    instance.register(askUserTool);
    return instance;
  }
}
