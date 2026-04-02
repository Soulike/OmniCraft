import {z} from 'zod';

import type {ToolDefinition, ToolExecutionContext} from '../tool/types.js';

const parameters = z.object({
  name: z.string().describe('Name of the tool set to load'),
});

/** Built-in tool that loads a tool set's tools into the agent. */
export const loadToolSetTool: ToolDefinition<typeof parameters> = {
  name: 'load_toolset',
  displayName: 'Load ToolSet',
  description:
    'Loads a tool set by name, making its tools available to the agent. Use this to access tools listed in the Available ToolSets section of the system prompt.',
  parameters,
  execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): string {
    const toolSet = context.availableToolSets.get(args.name);
    if (!toolSet) {
      return `Error: ToolSet "${args.name}" not found.`;
    }

    if (context.loadedToolSets.has(toolSet)) {
      return `ToolSet "${args.name}" is already loaded.`;
    }

    context.loadToolSetToAgent(toolSet);

    const toolNames = toolSet.getAll().map((t) => t.name);
    return `Loaded tool set "${args.name}" with tools: ${toolNames.join(', ')}`;
  },
};
