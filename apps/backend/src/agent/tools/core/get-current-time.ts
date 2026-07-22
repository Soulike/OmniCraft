import {getCurrentTimeResultSchema, TOOL_NAME} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {ToolDefinition} from '@/agent-core/tool/index.js';

const parameters = z.object({});

type GetCurrentTimeResult = z.infer<typeof getCurrentTimeResultSchema>;

/** Built-in tool that returns the current date and time. */
export const getCurrentTimeTool: ToolDefinition<
  typeof parameters,
  GetCurrentTimeResult
> = {
  kind: 'internal',
  name: TOOL_NAME.GET_CURRENT_TIME,
  displayName: 'Get Current Time',
  description:
    'Returns the current date and time in ISO 8601 format. ' +
    'You do not have access to the current time by default — ' +
    'call this tool whenever the user asks anything that depends on the current date, time, day of week, or timezone.',
  parameters,
  suppressToolEvents: false,
  execute() {
    const iso = new Date().toISOString();
    return {data: {iso}, content: iso, status: 'success'};
  },
};
