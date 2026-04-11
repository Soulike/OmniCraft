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
  ) {
    super(getConfig, {
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
      workingDirectory,
      extraAllowedPaths,
    });
  }
}
