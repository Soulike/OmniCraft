import {ToolSetRegistry} from '@/agent-core/tool-set/index.js';

import {WebToolSet} from '../web/index.js';

/** Registry for core tool sets. */
export class CoreToolSetRegistry extends ToolSetRegistry {
  /** Creates the singleton and registers all core tool sets. */
  static override create(): CoreToolSetRegistry {
    const instance = super.create() as CoreToolSetRegistry;
    instance.register(new WebToolSet());
    return instance;
  }
}
