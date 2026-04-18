import {
  todoClearParametersSchema,
  todoResultSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {formatTodoContent} from './helpers.js';

type TodoResult = z.infer<typeof todoResultSchema>;

export const todoClearTool: ToolDefinition<
  typeof todoClearParametersSchema,
  TodoResult
> = {
  name: TOOL_NAME.TODO_CLEAR,
  displayName: 'Todo Clear',
  description:
    'Clears all items from the todo list. ' +
    'Requires that the current list has been retrieved first. ' +
    'Use this to discard the current plan and start fresh ' +
    'when the approach has changed significantly.',
  parameters: todoClearParametersSchema,
  suppressToolEvents: true,
  execute(_args, context) {
    try {
      const items = context.todoStore.clear();
      return {
        data: {items},
        content: formatTodoContent(items),
        status: 'success',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {data: {message}, content: message, status: 'failure'};
    }
  },
};
