import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {formatTodoContent, markObserved} from './helpers.js';
import {todoAppendParametersSchema, type TodoResult} from './schemas.js';

export const todoAppendTool: ToolDefinition<
  typeof todoAppendParametersSchema,
  TodoResult
> = {
  name: 'todo_append',
  displayName: 'Todo Append',
  description:
    'Appends one or more todo items to the end of the list with status pending. ' +
    'Use this to break down work into trackable steps ' +
    'when handling a multi-step task. ' +
    'Do not create items for simple tasks that need no progress tracking.',
  parameters: todoAppendParametersSchema,
  suppressToolEvents: true,
  execute(args, context) {
    const {todoStore, todoState} = context;
    todoStore.append(args.items);
    const items = todoStore.list();
    markObserved(todoStore, todoState);
    return {
      data: {items},
      content: formatTodoContent(items),
      status: 'success',
    };
  },
};
