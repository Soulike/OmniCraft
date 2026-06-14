import {ToolRegistry} from '@/agent-core/tool/index.js';

import {getCurrentTimeTool} from './get-current-time.js';

/** Registry for always-available core tools. */
export class CoreToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(getCurrentTimeTool);
  }
}

export const coreToolRegistry = new CoreToolRegistry();
