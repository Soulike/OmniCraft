import type {ThinkingLevel} from '@omnicraft/api-schema';

import {coreSkillRegistry} from '@/agent/skills/index.js';
import {
  mathRenderingInstructions,
  preambleInstructions,
} from '@/agent/system-prompts/index.js';
import {
  bashToolRegistry,
  coreToolRegistry,
  fileToolRegistry,
  webToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/**
 * General-purpose subagent dispatched by the main agent.
 * Has the same tools/skills as MainAgent but cannot dispatch subagents itself.
 */
export class GeneralSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    thinkingLevel: ThinkingLevel,
    sessionsDir?: string,
  ) {
    super(getConfig, {
      toolRegistries: [
        coreToolRegistry,
        fileToolRegistry,
        webToolRegistry,
        bashToolRegistry,
      ],
      skillRegistries: [coreSkillRegistry],
      baseSystemPrompt: [
        'You are a helpful assistant working on a delegated subtask. ' +
          'After completing your task, provide a concise summary of what you did and the results.',
        '',
        preambleInstructions,
        '',
        mathRenderingInstructions,
      ].join('\n'),
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      thinkingLevel,
      workingDirectory,
      sessionsDir,
    });
  }
}
