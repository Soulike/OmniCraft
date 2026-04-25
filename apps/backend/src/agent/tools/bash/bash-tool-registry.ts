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

  override getSystemPromptSection(): string {
    return [
      '## Shell Tools',
      '',
      'Shell tools execute local commands from the agent shell context.',
      '',
      'The shell working directory may persist when commands change directories inside the workspace. Process-local shell state such as aliases, functions, and environment mutations does not persist across calls.',
    ].join('\n');
  }
}
