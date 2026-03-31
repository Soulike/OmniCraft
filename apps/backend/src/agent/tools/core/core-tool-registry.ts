import {ToolRegistry} from '@/agent-core/tool/index.js';

import {getCurrentTimeTool} from './get-current-time.js';

/** Registry for always-available core tools. */
export class CoreToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all core tools. */
  static override create(): CoreToolRegistry {
    const instance = super.create() as CoreToolRegistry;
    instance.register(getCurrentTimeTool);
    return instance;
  }
}
