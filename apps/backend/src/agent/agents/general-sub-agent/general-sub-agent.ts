import {coreSkillRegistry} from '@/agent/skills/index.js';
import {
  bashToolRegistry,
  coreToolRegistry,
  fileToolRegistry,
  todoToolRegistry,
  webToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import {todoStopCheck} from '@/agent-core/agent/stop-checks/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

import {generalSubAgentSystemPrompt} from './system-prompt.js';

/**
 * General-purpose subagent dispatched by the main agent.
 * Has the same tools/skills as MainAgent but cannot dispatch subagents itself.
 */
export class GeneralSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    sessionsDir?: string,
  ) {
    super(getConfig, {
      toolRegistries: [
        coreToolRegistry,
        fileToolRegistry,
        webToolRegistry,
        bashToolRegistry,
        todoToolRegistry,
      ],
      skillRegistries: [coreSkillRegistry],
      stopChecks: [todoStopCheck],
      baseSystemPrompt: generalSubAgentSystemPrompt,
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      sessionsDir,
    });
  }
}
