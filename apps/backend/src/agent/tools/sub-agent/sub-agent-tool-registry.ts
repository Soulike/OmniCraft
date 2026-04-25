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
      'Use subagent tools for bounded subtasks that can run independently and return a concise result for you to integrate.',
      '',
      'Delegation guidance:',
      '- Delegate side work that does not block your immediate next step, such as independent codebase exploration, isolated implementation slices, or parallel verification.',
      '- Keep each delegated task concrete and self-contained. Include the goal, relevant paths, expected output, and any constraints the subagent must follow.',
      '- Do not delegate work that requires tight coordination with your current edits or that you need to complete directly on the critical path.',
      '- Review and integrate subagent results before presenting them as final work.',
    ].join('\n');
  }
}
