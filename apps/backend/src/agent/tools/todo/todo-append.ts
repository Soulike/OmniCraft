import type {ToolDefinition} from '@/agent-core/tool/index.js';

import {formatTodoContent} from './helpers.js';
import {todoAppendParametersSchema, type TodoResult} from './schemas.js';

export const todoAppendTool: ToolDefinition<
  typeof todoAppendParametersSchema,
  TodoResult
> = {
  name: 'todo_append',
  displayName: 'Todo Append',
  description:
    'Appends a new todo item to the end of the list with status pending. ' +
    'Use this to break down work into trackable steps ' +
    'when handling a multi-step task.',
  parameters: todoAppendParametersSchema,
  suppressToolEvents: true,
  execute(args, context) {
    const items = context.todoStore.append(args.subject, args.description);
    return {
      data: {items},
      content: formatTodoContent(items),
      status: 'success',
    };
  },
};
