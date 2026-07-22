import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {formatTodoContent, markObserved} from './helpers.js';
import {todoListParametersSchema, type TodoResult} from './schemas.js';

export const todoListTool: ToolDefinition<
  typeof todoListParametersSchema,
  TodoResult
> = {
  kind: 'internal',
  name: 'todo_list',
  displayName: 'Todo List',
  description:
    'Returns all items in the todo list with their current status. ' +
    'Always call this before making any changes — ' +
    'updates and clears require an up-to-date view of the list.',
  parameters: todoListParametersSchema,
  suppressToolEvents: true,
  compactResult({content, status}) {
    const lines = content.split('\n').filter(Boolean);
    return [`todo state ${status}`, ...lines.slice(0, 30)].join('\n');
  },
  execute(_args, context) {
    const {todoStore, todoState} = context;
    const items = todoStore.list();
    markObserved(todoStore, todoState);
    return {
      data: {items},
      content: formatTodoContent(items),
      status: 'success',
    };
  },
};
