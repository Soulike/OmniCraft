import {ToolRegistry} from '@/agent-core/tool/index.js';

import {todoAppendTool} from './todo-append.js';
import {todoClearTool} from './todo-clear.js';
import {todoListTool} from './todo-list.js';
import {todoUpdateTool} from './todo-update.js';

/** Registry for todo tracking tools. */
export class TodoToolRegistry extends ToolRegistry {
  static override create(): TodoToolRegistry {
    const instance = super.create() as TodoToolRegistry;
    instance.register(todoAppendTool);
    instance.register(todoUpdateTool);
    instance.register(todoClearTool);
    instance.register(todoListTool);
    return instance;
  }
}
