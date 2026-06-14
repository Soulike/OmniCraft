import {ToolRegistry} from '@/agent-core/tool/index.js';

import {dispatchAgentTool} from './dispatch-agent-tool.js';
import {listResumableAgentsTool} from './list-resumable-agents-tool.js';
import {resumeAgentTool} from './resume-agent-tool.js';

/** Registry for subagent-related tools. */
export class SubAgentToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(listResumableAgentsTool);
    this.register(resumeAgentTool);
    this.register(dispatchAgentTool);
  }
}

export const subAgentToolRegistry = new SubAgentToolRegistry();
