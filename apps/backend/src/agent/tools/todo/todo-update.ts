import {
  todoResultSchema,
  todoUpdateParametersSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {formatTodoContent} from './helpers.js';

type TodoResult = z.infer<typeof todoResultSchema>;

export const todoUpdateTool: ToolDefinition<
  typeof todoUpdateParametersSchema,
  TodoResult
> = {
  name: TOOL_NAME.TODO_UPDATE,
  displayName: 'Todo Update',
  description:
    'Updates an existing todo item by its index. ' +
    'Use this to change the status of an item when starting or finishing work, ' +
    'or to revise its subject or description.',
  parameters: todoUpdateParametersSchema,
  suppressToolEvents: true,
  execute(args, context) {
    try {
      const {index, ...fields} = args;
      const items = context.todoStore.update(index, fields);
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
