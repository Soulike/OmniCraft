import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {checkStale, formatTodoContent, markObserved} from './helpers.js';
import {type TodoResult, todoUpdateParametersSchema} from './schemas.js';

export const todoUpdateTool: ToolDefinition<
  typeof todoUpdateParametersSchema,
  TodoResult
> = {
  kind: 'internal',
  name: 'todo_update',
  displayName: 'Todo Update',
  description:
    'Updates an existing todo item by its index. ' +
    'Requires that the current list has been retrieved first. ' +
    'Use this to change the status of an item when starting or finishing work, ' +
    'or to revise its subject or description.',
  parameters: todoUpdateParametersSchema,
  suppressToolEvents: true,
  compactResult({content, status}) {
    const lines = content.split('\n').filter(Boolean);
    return [`todo state ${status}`, ...lines.slice(0, 30)].join('\n');
  },
  execute(args, context) {
    const {todoStore, todoState} = context;
    const staleMessage = checkStale(todoStore, todoState);
    if (staleMessage) {
      return {
        data: {message: staleMessage},
        content: [{type: 'text', text: staleMessage}],
        status: 'failure',
      };
    }

    try {
      const {index, ...fields} = args;
      todoStore.update(index, fields);
      const items = todoStore.list();
      markObserved(todoStore, todoState);
      return {
        data: {items},
        content: [{type: 'text', text: formatTodoContent(items)}],
        status: 'success',
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {message},
        content: [{type: 'text', text: message}],
        status: 'failure',
      };
    }
  },
};
