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
      'Use shell tools for commands that are better handled by the local environment: package scripts, test runs, type checks, builds, version checks, git inspection, and filesystem exploration that is awkward through structured file tools.',
      '',
      'Shell behavior:',
      '- The working directory persists across shell tool calls when a command changes directories inside the workspace.',
      '- Environment variables, aliases, shell functions, and other process-local state do not persist across shell tool calls.',
      '- Long-running commands should use an explicit timeout that matches the expected runtime.',
      '',
      'Safety:',
      '- Prefer read-only inspection commands before mutating commands.',
      '- Do not run destructive git or filesystem commands unless the user explicitly requested that operation.',
      '- Use the repository package manager and scripts instead of inventing command lines when scripts are available.',
    ].join('\n');
  }
}
