import {
  todoListParametersSchema,
  todoResultSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {formatTodoContent} from './helpers.js';

type TodoResult = z.infer<typeof todoResultSchema>;

export const todoListTool: ToolDefinition<
  typeof todoListParametersSchema,
  TodoResult
> = {
  name: TOOL_NAME.TODO_LIST,
  displayName: 'Todo List',
  description:
    'Returns all items in the todo list with their current status. ' +
    'Use this to review progress or to see the list ' +
    'before making updates.',
  parameters: todoListParametersSchema,
  suppressToolEvents: true,
  execute(_args, context) {
    const items = context.todoStore.list();
    return {
      data: {items},
      content: formatTodoContent(items),
      status: 'success',
    };
  },
};
