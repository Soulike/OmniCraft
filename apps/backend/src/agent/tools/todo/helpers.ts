import type {TodoItem} from '@/agent-core/agent/todo-store.js';

/** Formats the todo list as a human-readable string for the LLM. */
export function formatTodoContent(items: readonly TodoItem[]): string {
  if (items.length === 0) {
    return 'Todo list is empty.';
  }

  const completed = items.filter((i) => i.status === 'completed').length;
  const header = `Todo List (${completed}/${items.length} completed):`;
  const lines = items.map(
    (item) => `[${item.status}] #${item.index}: ${item.subject}`,
  );

  return [header, ...lines].join('\n');
}
