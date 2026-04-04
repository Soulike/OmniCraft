import {ToolRegistry} from '@/agent-core/tool/index.js';

import {runCommandTool} from './run-command.js';

/** Registry for shell command tools. */
export class BashToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all bash tools. */
  static override create(): BashToolRegistry {
    const instance = super.create() as BashToolRegistry;
    instance.register(runCommandTool);
    return instance;
  }
}
