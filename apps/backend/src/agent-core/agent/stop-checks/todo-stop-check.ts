import type {StopCheck} from './types.js';

export const todoStopCheck: StopCheck = {
  name: 'incomplete-todos',
  evaluate({runtimeState}) {
    const todos = runtimeState.listTodos();
    if (todos.length === 0) return null;
    const unfinished = todos.filter((todo) => todo.status !== 'completed');
    if (unfinished.length === 0) return null;
    return {
      stateToken: String(runtimeState.todoVersion),
      content:
        `Note: the TODO list still has ${unfinished.length} unfinished ` +
        `item(s):\n` +
        unfinished
          .map((todo) => `- [${todo.status}] ${todo.subject}`)
          .join('\n') +
        `\nThis is just a reminder of the current state. If they are done, ` +
        `update their status; if they are intentionally being left for later ` +
        `or are no longer needed, you can proceed.`,
    };
  },
};
