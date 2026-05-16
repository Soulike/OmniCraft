import type {ToolName} from '@omnicraft/tool-schemas';
import {ZodError} from 'zod';

import {editFileToolPillContent} from './adapters/edit-file.js';
import {findFilesToolPillContent} from './adapters/find-files.js';
import {getCurrentTimeToolPillContent} from './adapters/get-current-time.js';
import {loadSkillToolPillContent} from './adapters/load-skill.js';
import {readFileToolPillContent} from './adapters/read-file.js';
import {runCommandToolPillContent} from './adapters/run-command.js';
import {searchFilesToolPillContent} from './adapters/search-files.js';
import {webFetchToolPillContent} from './adapters/web-fetch.js';
import {webFetchRawToolPillContent} from './adapters/web-fetch-raw.js';
import {webSearchToolPillContent} from './adapters/web-search.js';
import {writeFileToolPillContent} from './adapters/write-file.js';
import {fallbackToolPillContent} from './fallbackToolPillContent.js';
import type {ToolExecutionPillContent} from './types.js';

interface GetToolPillContentInput {
  toolName: ToolName;
  toolArguments: string;
}

export function getToolPillContent(
  input: GetToolPillContentInput,
): ToolExecutionPillContent {
  if (input.toolName === 'ask_user') {
    return fallbackToolPillContent(input);
  }

  try {
    const parsed = JSON.parse(input.toolArguments) as unknown;

    switch (input.toolName) {
      case 'read_file':
        return readFileToolPillContent(parsed);
      case 'write_file':
        return writeFileToolPillContent(parsed);
      case 'edit_file':
        return editFileToolPillContent(parsed);
      case 'find_files':
        return findFilesToolPillContent(parsed);
      case 'search_files':
        return searchFilesToolPillContent(parsed);
      case 'run_command':
        return runCommandToolPillContent(parsed);
      case 'web_search':
        return webSearchToolPillContent(parsed);
      case 'web_fetch':
        return webFetchToolPillContent(parsed);
      case 'web_fetch_raw':
        return webFetchRawToolPillContent(parsed);
      case 'load_skill':
        return loadSkillToolPillContent(parsed);
      case 'get_current_time':
        return getCurrentTimeToolPillContent();
      case 'ask_user':
        return fallbackToolPillContent(input);
    }
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ZodError) {
      return fallbackToolPillContent(input);
    }

    throw error;
  }
}
