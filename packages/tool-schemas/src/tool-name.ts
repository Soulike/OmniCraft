import {z} from 'zod';

/** Canonical tool name constants — single source of truth. */
export const TOOL_NAME = {
  READ_FILE: 'read_file',
  WRITE_FILE: 'write_file',
  EDIT_FILE: 'edit_file',
  FIND_FILES: 'find_files',
  SEARCH_FILES: 'search_files',
  RUN_COMMAND: 'run_command',
  GET_CURRENT_TIME: 'get_current_time',
  WEB_FETCH: 'web_fetch',
  WEB_FETCH_RAW: 'web_fetch_raw',
  WEB_SEARCH: 'web_search',
  LOAD_SKILL: 'load_skill',
} as const;

export type ToolName = (typeof TOOL_NAME)[keyof typeof TOOL_NAME];

/** Zod schema for runtime validation of tool names. */
export const toolNameSchema = z.enum(
  Object.values(TOOL_NAME) as [string, ...string[]],
);
