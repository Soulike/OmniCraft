import {ToolRegistry} from '@/agent-core/tool/index.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    // Tools will be registered here as they are implemented.
    return instance;
  }
}
