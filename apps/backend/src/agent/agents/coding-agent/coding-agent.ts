import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  ClientToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  SubAgentToolRegistry,
  TodoToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {Agent, agentPersistence} from '@/agent-core/agent/index.js';
import type {AgentSnapshot} from '@/agent-core/agent/types.js';
import {settingsService} from '@/services/settings/index.js';

/**
 * Coding agent with all tools and skills.
 * Used as the entry point for coding sessions.
 * Includes subagent dispatch capability.
 */
export class CodingAgent extends Agent {
  constructor(
    workingDirectory: string | undefined,
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
          CoreToolRegistry.getInstance(),
          FileToolRegistry.getInstance(),
          WebToolRegistry.getInstance(),
          BashToolRegistry.getInstance(),
          SubAgentToolRegistry.getInstance(),
          ClientToolRegistry.getInstance(),
          TodoToolRegistry.getInstance(),
        ],
        skillRegistries: [CoreSkillRegistry.getInstance()],
        baseSystemPrompt: 'You are a helpful assistant.',
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
      sessionsDir,
      snapshot,
    );
  }
}
