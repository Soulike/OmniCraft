import type {ThinkingLevel} from '@omnicraft/api-schema';

import {CoreSkillRegistry} from '@/agent/skills/index.js';
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

import {mainAgentSystemPrompt} from './system-prompt.js';

/**
 * Primary agent with all tools and skills.
 * Used as the main entry point for chat sessions.
 * Includes subagent dispatch capability.
 */
export class MainAgent extends Agent {
  constructor(
    workingDirectory: string | undefined,
    thinkingLevel: ThinkingLevel,
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      async () => {
        const settings = await settingsService.getAll();
        const {apiFormat, apiKey, baseUrl, model} = settings.llm;
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
        skillRegistries: [CoreSkillRegistry.getInstance()],
        baseSystemPrompt: mainAgentSystemPrompt,
        getMaxToolRounds: async () => {
          const settings = await settingsService.getAll();
          return settings.agent.maxToolRounds;
        },
        getLightConfig: async () => {
          const settings = await settingsService.getAll();
          const {apiFormat, apiKey, baseUrl, model, lightModel} = settings.llm;
          return {apiFormat, apiKey, baseUrl, model: lightModel || model};
        },
        thinkingLevel,
        workingDirectory,
        sessionsDir,
      },
      snapshot,
    );
  }

  static async restore(sessionsDir: string, id: string): Promise<MainAgent> {
    const snapshot = await agentPersistence.loadSnapshot(sessionsDir, id);
    await agentPersistence.reconcileEventsFile(
      sessionsDir,
      id,
      snapshot.sseEventCount,
    );
    return new MainAgent(
      snapshot.options.workingDirectory,
      snapshot.options.thinkingLevel,
      sessionsDir,
      snapshot,
    );
  }
}
