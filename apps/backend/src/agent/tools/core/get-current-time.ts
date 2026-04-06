import {z} from 'zod';

import type {ToolDefinition} from '@/agent-core/tool/index.js';

const parameters = z.object({});

/** Built-in tool that returns the current date and time. */
export const getCurrentTimeTool: ToolDefinition<typeof parameters> = {
  name: 'get_current_time',
  displayName: 'Get Current Time',
  description:
    'Returns the current date and time in ISO 8601 format. ' +
    'You do not have access to the current time by default — ' +
    'call this tool whenever the user asks anything that depends on the current date, time, day of week, or timezone.',
  parameters,
  execute(): string {
    return new Date().toISOString();
  },
};
