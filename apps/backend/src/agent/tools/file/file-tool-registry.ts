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
      'Use file tools for workspace file discovery, reading, searching, creation, and targeted text edits.',
      '',
      'Workflow:',
      '- Use file discovery and content search before assuming where code lives.',
      '- Read an existing file before modifying it. If a modification tool reports that the file changed since it was read, read it again before retrying.',
      '- Prefer targeted edits for small changes to existing files. Use full-file writes for new files or when replacing the complete file is clearer and proportionate.',
      '- Use partial reads for large files or when only a known region is relevant.',
      '- Keep generated file content consistent with existing formatting, naming, and import style.',
    ].join('\n');
  }
}
