import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all subagent tools. */
  static override create(): SubAgentToolRegistry {
    const instance = super.create() as SubAgentToolRegistry;
    instance.register(dispatchAgentTool);
    return instance;
  }

  override getSystemPromptSection(): string {
    return [
      '## Subagent Tools',
      '',
      'Subagent tools run delegated work in a separate agent context and return a summary for the parent agent to integrate.',
      '',
      'Delegate only bounded, independent subtasks. The parent agent remains responsible for reviewing results and deciding how they affect the final answer or code changes.',
    ].join('\n');
  }
}
