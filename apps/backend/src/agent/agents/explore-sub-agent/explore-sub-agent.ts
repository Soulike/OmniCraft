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

import {exploreSubAgentSystemPrompt} from './system-prompt.js';

/**
 * Research-focused subagent dispatched by the main agent.
 * It can inspect the workspace and return reports, but its prompt forbids mutations.
 */
export class ExploreSubAgent extends Agent {
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
      baseSystemPrompt: exploreSubAgentSystemPrompt,
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      sessionsDir,
    });
  }
}
