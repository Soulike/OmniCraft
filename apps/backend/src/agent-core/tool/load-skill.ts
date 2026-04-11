import {loadSkillResultSchema, TOOL_NAME} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from './types.js';

const parameters = z.object({
  name: z.string().describe('Name of the skill to load'),
});

type LoadSkillResult = z.infer<typeof loadSkillResultSchema>;

/** Built-in tool that loads a skill's full Markdown content into the conversation. */
export const loadSkillTool: ToolDefinition<typeof parameters, LoadSkillResult> =
  {
    name: TOOL_NAME.LOAD_SKILL,
    displayName: 'Load Skill',
    description:
      'Loads the full content of a skill by name. Use this to access detailed instructions for a specific skill listed in the system prompt.',
    parameters,
    suppressToolEvents: false,
    async execute(
      args: z.infer<typeof parameters>,
      context: ToolExecutionContext,
    ): Promise<ToolExecuteResult<LoadSkillResult>> {
      const skill = context.availableSkills.get(args.name);
      if (!skill) {
        return {
          data: {message: `Skill "${args.name}" not found.`},
          content: `Error: Skill "${args.name}" not found.`,
          status: 'failure',
        };
      }
      const content = await skill.getContent();
      const data: LoadSkillResult = {name: args.name, content};
      return {data, content, status: 'success'};
    },
  };
