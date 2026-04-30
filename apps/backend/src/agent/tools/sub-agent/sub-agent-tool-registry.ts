import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';
import {resumeSubagentTool} from './resume-subagent-tool.js';

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all subagent tools. */
  static override create(): SubAgentToolRegistry {
    const instance = super.create() as SubAgentToolRegistry;
    instance.register(dispatchAgentTool);
    instance.register(resumeSubagentTool);
    return instance;
  }
}
