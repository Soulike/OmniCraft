import type {StopCheck} from './types.js';

/** Cap on how many unfinished items are listed verbatim in one reminder. A
 *  large todo list would otherwise auto-inject a multi-megabyte reminder on
 *  every stop (cost / context exhaustion); the rest are summarized as a count. */
const MAX_LISTED = 20;

/** Collapses line breaks in a todo subject to a single space so it renders as
 *  one bullet. Subjects come only from the LLM via tool calls, so plain
 *  CR/LF is all we expect; this is purely cosmetic (injection is handled by
 *  HTML-escaping the reminder content, not here). */
function toSingleLine(subject: string): string {
  return subject.replace(/[\r\n]+/g, ' ');
}

export const todoStopCheck: StopCheck = {
  name: 'incomplete-todos',
  evaluate({runtimeState}) {
    const todos = runtimeState.listTodos();
    if (todos.length === 0) return null;
    const unfinished = todos.filter((todo) => todo.status !== 'completed');
    if (unfinished.length === 0) return null;

    const listed = unfinished.slice(0, MAX_LISTED);
    const overflow = unfinished.length - listed.length;
    const lines = listed.map(
      (todo) => `- [${todo.status}] ${toSingleLine(todo.subject)}`,
    );
    if (overflow > 0) {
      lines.push(`- …and ${overflow} more unfinished item(s).`);
    }

    return {
      stateToken: String(runtimeState.todoVersion),
      content:
        `Note: the TODO list still has ${unfinished.length} unfinished ` +
        `item(s):\n` +
        lines.join('\n') +
        `\nThis is just a reminder of the current state. If they are done, ` +
        `update their status; if they are no longer needed, clear or remove ` +
        `them; if they are intentionally being left for later, you can proceed.`,
    };
  },
};
