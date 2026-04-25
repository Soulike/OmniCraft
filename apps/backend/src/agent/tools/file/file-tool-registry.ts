import {ToolRegistry} from '@/agent-core/tool/index.js';

import {editFileTool} from './edit-file.js';
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
    instance.register(editFileTool);
    return instance;
  }

  override getSystemPromptSection(): string {
    return [
      '## File Tools',
      '',
      'File tools operate on workspace text files relative to the working directory.',
      '',
      'The file tools share read/modify safety state. If a modification tool reports that a file must be read first or has changed since the last read, read the file again before retrying.',
    ].join('\n');
  }
}
