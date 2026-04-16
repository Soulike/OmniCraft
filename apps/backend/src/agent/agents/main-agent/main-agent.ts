import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  ClientToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  SubAgentToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {AgentSnapshot} from '@/agent-core/agent/types.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/**
 * Primary agent with all tools and skills.
 * Used as the main entry point for chat sessions.
 * Includes subagent dispatch capability.
 */
export class MainAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      getConfig,
      {
        toolRegistries: [
          CoreToolRegistry.getInstance(),
          FileToolRegistry.getInstance(),
          WebToolRegistry.getInstance(),
          BashToolRegistry.getInstance(),
          SubAgentToolRegistry.getInstance(),
          ClientToolRegistry.getInstance(),
        ],
        skillRegistries: [CoreSkillRegistry.getInstance()],
        baseSystemPrompt: 'You are a helpful assistant.',
        getMaxToolRounds: async () => {
          const settings = await settingsService.getAll();
          return settings.agent.maxToolRounds;
        },
        getLightConfig: async () => {
          const settings = await settingsService.getAll();
          const {apiFormat, apiKey, baseUrl, model, lightModel} = settings.llm;
          return {apiFormat, apiKey, baseUrl, model: lightModel || model};
        },
        workingDirectory,
        extraAllowedPaths,
        sessionsDir,
      },
      snapshot,
    );
  }

  static async restore(
    getConfig: () => Promise<LlmConfig>,
    sessionsDir: string,
    id: string,
  ): Promise<MainAgent> {
    const snapshot = await Agent.loadSnapshotFromDisk(sessionsDir, id);
    await Agent.reconcileEventsFile(sessionsDir, id, snapshot.sseEventCount);
    return new MainAgent(
      getConfig,
      snapshot.options.workingDirectory,
      snapshot.options.extraAllowedPaths ?? [],
      sessionsDir,
      snapshot,
    );
  }
}
