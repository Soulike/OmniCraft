import type {TodoItem, TodoStore} from '@/agent-core/agent/todo-store.js';
import type {TodoState} from '@/agent-core/tool/index.js';

/** Formats the todo list as a human-readable string for the LLM. */
export function formatTodoContent(items: readonly TodoItem[]): string {
  if (items.length === 0) {
    return 'Todo list is empty.';
  }

  const completed = items.filter((i) => i.status === 'completed').length;
  const header = `Todo List (${completed}/${items.length} completed):`;
  const lines = items.map(
    (item) =>
      `[${item.status}] #${item.index}: ${item.subject} - ${item.description}`,
  );

  return [header, ...lines].join('\n');
}

/**
 * Checks that the store version matches the last observed version.
 * Returns a failure message if stale, or `null` if up to date.
 */
export function checkStale(store: TodoStore, state: TodoState): string | null {
  if (
    state.lastObservedVersion === undefined ||
    state.lastObservedVersion !== store.version
  ) {
    return 'Retrieve the current todo list before making changes.';
  }
  return null;
}

/** Marks the current store version as observed. */
export function markObserved(store: TodoStore, state: TodoState): void {
  state.lastObservedVersion = store.version;
}
