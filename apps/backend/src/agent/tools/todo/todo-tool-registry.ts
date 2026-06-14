import {ToolRegistry} from '@/agent-core/tool/index.js';

import {todoAppendTool} from './todo-append.js';
import {todoClearTool} from './todo-clear.js';
import {todoListTool} from './todo-list.js';
import {todoUpdateTool} from './todo-update.js';

/** Registry for todo tracking tools. */
export class TodoToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(todoAppendTool);
    this.register(todoUpdateTool);
    this.register(todoClearTool);
    this.register(todoListTool);
  }

  override getSystemPromptSection(): string {
    return [
      '## Task Tracking',
      '',
      'You have todo tools to track progress on multi-step work.',
      '',
      'When to use: The task involves multiple distinct steps that benefit from progress tracking.',
      'When not to use: Simple tasks that can be completed in one or two straightforward steps.',
      '',
      'Workflow:',
      `1. Break the task into steps with ${todoAppendTool.name}.`,
      '2. Set an item to in_progress when you start working on it.',
      '3. Set it to completed when done, then move to the next item.',
      `4. Always call ${todoListTool.name} before using ${todoUpdateTool.name} or ${todoClearTool.name} — they require an up-to-date view and will fail otherwise.`,
      '',
      'Keep items actionable and update status as you work, not in bulk at the end.',
      '',
      `Before ending a turn, the list must contain no item left in pending or in_progress. Mark each finished item completed, update items whose status no longer reflects reality, or call ${todoClearTool.name} if the list is no longer relevant.`,
    ].join('\n');
  }
}

export const todoToolRegistry = new TodoToolRegistry();
