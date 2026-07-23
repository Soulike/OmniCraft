import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {checkStale, formatTodoContent, markObserved} from './helpers.js';
import {todoClearParametersSchema, type TodoResult} from './schemas.js';

export const todoClearTool: ToolDefinition<
  typeof todoClearParametersSchema,
  TodoResult
> = {
  kind: 'internal',
  name: 'todo_clear',
  displayName: 'Todo Clear',
  description:
    'Clears all items from the todo list. ' +
    'Requires that the current list has been retrieved first. ' +
    'Use this to discard the current plan and start fresh ' +
    'when the approach has changed significantly.',
  parameters: todoClearParametersSchema,
  suppressToolEvents: true,
  compactResult({content, status}) {
    const lines = content.split('\n').filter(Boolean);
    return [`todo state ${status}`, ...lines.slice(0, 30)].join('\n');
  },
  execute(_args, context) {
    const {todoStore, todoState} = context;
    const staleMessage = checkStale(todoStore, todoState);
    if (staleMessage) {
      return {
        data: {message: staleMessage},
        content: [{type: 'text', text: staleMessage}],
        status: 'failure',
      };
    }

    todoStore.clear();
    const items = todoStore.list();
    markObserved(todoStore, todoState);
    return {
      data: {items},
      content: [{type: 'text', text: formatTodoContent(items)}],
      status: 'success',
    };
  },
};
