import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';
import {listLiveAgentsTool} from './list-live-agents-tool.js';

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all subagent tools. */
  static override create(): SubAgentToolRegistry {
    const instance = super.create() as SubAgentToolRegistry;
    instance.register(listLiveAgentsTool);
    instance.register(dispatchAgentTool);
    return instance;
  }
}
