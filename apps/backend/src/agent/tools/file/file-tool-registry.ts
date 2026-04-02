import {ToolRegistry} from '@/agent-core/tool/index.js';

import {readFileTool} from './read-file.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    instance.register(readFileTool);
    return instance;
  }
}
