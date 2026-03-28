import type {LlmConfig} from '@/api/llm/index.js';
import type {SkillRegistry} from '@/skills/index.js';
import type {ToolRegistry} from '@/tools/index.js';

import {Agent} from '../types.js';

/**
 * A simple agent with the standard Agent Loop.
 *
 * Uses the base class tool-calling loop with whatever tool and skill
 * registries are provided. No additional behavior is added.
 */
export class SimpleAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: {
      toolRegistries?: ToolRegistry[];
      skillRegistries?: SkillRegistry[];
      baseSystemPrompt?: string;
    } = {},
  ) {
    super(getConfig, {
      toolRegistries: options.toolRegistries ?? [],
      skillRegistries: options.skillRegistries ?? [],
      baseSystemPrompt: options.baseSystemPrompt ?? '',
    });
  }
}
