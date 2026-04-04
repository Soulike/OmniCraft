import {ToolRegistry} from '@/agent-core/tool/index.js';

import {findFilesTool} from './find-files.js';
import {readFileTool} from './read-file.js';
import {searchFilesTool} from './search-files.js';
import {writeFileTool} from './write-file.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  /** Creates the singleton and registers all file tools. */
  static override create(): FileToolRegistry {
    const instance = super.create() as FileToolRegistry;
    instance.register(readFileTool);
    instance.register(findFilesTool);
    instance.register(searchFilesTool);
    instance.register(writeFileTool);
    return instance;
  }
}
