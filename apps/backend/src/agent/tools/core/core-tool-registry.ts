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

  override getSystemPromptSection(): string {
    return [
      '## Core Tools',
      '',
      'Use core tools for runtime facts provided by the system. Use the current-time tool when exact current date or time matters for the task, especially for relative dates, scheduling, logs, or time-sensitive reasoning.',
    ].join('\n');
  }
}
