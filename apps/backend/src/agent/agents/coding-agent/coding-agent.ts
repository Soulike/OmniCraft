import type {ThinkingLevel} from '@omnicraft/api-schema';

import {coreSkillRegistry} from '@/agent/skills/index.js';
import {
  bashToolRegistry,
  clientToolRegistry,
  coreToolRegistry,
  fileToolRegistry,
  subAgentToolRegistry,
  todoToolRegistry,
  webToolRegistry,
} from '@/agent/tools/index.js';
import {
  Agent,
  agentPersistence,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';
import {settingsService} from '@/services/settings/index.js';

import {codingAgentSystemPrompt} from './system-prompt.js';

/**
 * Coding agent with all tools and skills.
 * Used as the entry point for coding sessions.
 * Includes subagent dispatch capability.
 */
export class CodingAgent extends Agent {
  constructor(
    workingDirectory: string | undefined,
    thinkingLevel: ThinkingLevel,
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      async () => {
        const settings = await settingsService.getAll();
        const {apiFormat, apiKey, baseUrl, model} = settings.codingLlm;
        return {apiFormat, apiKey, baseUrl, model};
      },
      {
        toolRegistries: [
          coreToolRegistry,
          fileToolRegistry,
          webToolRegistry,
          bashToolRegistry,
          subAgentToolRegistry,
          clientToolRegistry,
          todoToolRegistry,
        ],
        skillRegistries: [coreSkillRegistry],
        baseSystemPrompt: codingAgentSystemPrompt,
        getMaxToolRounds: async () => {
          const settings = await settingsService.getAll();
          return settings.agent.maxToolRounds;
        },
        getLightConfig: async () => {
          const settings = await settingsService.getAll();
          const {apiFormat, apiKey, baseUrl, model, lightModel} =
            settings.codingLlm;
          return {apiFormat, apiKey, baseUrl, model: lightModel || model};
        },
        thinkingLevel,
        workingDirectory,
        sessionsDir,
      },
      snapshot,
    );
  }

  static async restore(sessionsDir: string, id: string): Promise<CodingAgent> {
    const snapshot = await agentPersistence.loadSnapshot(sessionsDir, id);
    await agentPersistence.reconcileEventsFile(
      sessionsDir,
      id,
      snapshot.sseEventCount,
    );
    return new CodingAgent(
      snapshot.options.workingDirectory,
      snapshot.options.thinkingLevel,
      sessionsDir,
      snapshot,
    );
  }
}
