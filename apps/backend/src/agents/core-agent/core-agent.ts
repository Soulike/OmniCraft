import type {LlmConfig} from '@/api/llm/index.js';
import {CoreSkillRegistry} from '@/skills/index.js';
import {CoreToolRegistry} from '@/tools/index.js';

import {Agent} from '../types.js';

/**
 * Default agent with core tools and skills.
 * Used as the standard agent type for chat sessions.
 */
export class CoreAgent extends Agent {
  constructor(getConfig: () => Promise<LlmConfig>) {
    super(getConfig, {
      toolRegistries: [CoreToolRegistry.getInstance()],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: 'You are a helpful assistant.',
    });
  }
}
