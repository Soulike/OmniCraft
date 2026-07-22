import {AgentType} from '@omnicraft/settings-schema';

import {resolveModelConfig} from '@/agent/model-tier/index.js';
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
import {getMcpToolRegistry} from '@/agent/tools/mcp/index.js';
import {
  Agent,
  agentPersistence,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';
import {todoStopCheck} from '@/agent-core/agent/stop-checks/index.js';
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
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      async () => {
        const settings = await settingsService.getAll();
        return resolveModelConfig(
          settings.codingLlm,
          settings.codingLlm.defaultTier,
        );
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
          getMcpToolRegistry(AgentType.CODING),
        ],
        skillRegistries: [coreSkillRegistry],
        stopChecks: [todoStopCheck],
        baseSystemPrompt: codingAgentSystemPrompt,
        getMaxToolRounds: async () => {
          const settings = await settingsService.getAll();
          return settings.agent.maxToolRounds;
        },
        getTierConfig: async (tier) => {
          const settings = await settingsService.getAll();
          return resolveModelConfig(settings.codingLlm, tier);
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
