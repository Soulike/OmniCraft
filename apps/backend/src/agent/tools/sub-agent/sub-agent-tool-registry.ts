import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';
import {listResumableAgentsTool} from './list-resumable-agents-tool.js';

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all subagent tools. */
  static override create(): SubAgentToolRegistry {
    const instance = super.create() as SubAgentToolRegistry;
    instance.register(listResumableAgentsTool);
    instance.register(dispatchAgentTool);
    return instance;
  }
}
