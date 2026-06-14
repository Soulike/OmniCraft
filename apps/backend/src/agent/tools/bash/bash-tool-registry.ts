import {ToolRegistry} from '@/agent-core/tool/index.js';

import {runCommandTool} from './run-command.js';

/** Registry for shell command tools. */
export class BashToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(runCommandTool);
  }
}

export const bashToolRegistry = new BashToolRegistry();
