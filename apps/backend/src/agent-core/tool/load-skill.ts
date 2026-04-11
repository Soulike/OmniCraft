import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from './types.js';

const parameters = z.object({
  name: z.string().describe('Name of the skill to load'),
});

/** Built-in tool that loads a skill's full Markdown content into the conversation. */
export const loadSkillTool: ToolDefinition<typeof parameters> = {
  name: 'load_skill',
  displayName: 'Load Skill',
  description:
    'Loads the full content of a skill by name. Use this to access detailed instructions for a specific skill listed in the system prompt.',
  parameters,
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult> {
    const skill = context.availableSkills.get(args.name);
    if (!skill) {
      return {
        content: `Error: Skill "${args.name}" not found.`,
        status: 'failure',
      };
    }
    return {content: await skill.getContent(), status: 'success'};
  },
};
