import {ToolRegistry} from '@/agent-core/tool/index.js';

import {editFileTool} from './edit-file.js';
import {findFilesTool} from './find-files.js';
import {readFileTool} from './read-file.js';
import {searchFilesTool} from './search-files.js';
import {writeFileTool} from './write-file.js';

/** Registry for file-operation tools. */
export class FileToolRegistry extends ToolRegistry {
  constructor() {
    super();
    this.register(readFileTool);
    this.register(findFilesTool);
    this.register(searchFilesTool);
    this.register(writeFileTool);
    this.register(editFileTool);
  }

  override getSystemPromptSection(): string {
    return [
      '## File Tools',
      '',
      'The file tools share read/modify safety state. If a modification tool reports that a file must be read first or has changed since the last read, read the file again before retrying.',
    ].join('\n');
  }
}

export const fileToolRegistry = new FileToolRegistry();
