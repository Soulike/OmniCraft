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
  DISPATCH_AGENT: 'dispatch_agent',
} as const;

export type ToolName = (typeof TOOL_NAME)[keyof typeof TOOL_NAME];

/** Zod schema for runtime validation of tool names. */
export const toolNameSchema = z.enum([
  TOOL_NAME.READ_FILE,
  TOOL_NAME.WRITE_FILE,
  TOOL_NAME.EDIT_FILE,
  TOOL_NAME.FIND_FILES,
  TOOL_NAME.SEARCH_FILES,
  TOOL_NAME.RUN_COMMAND,
  TOOL_NAME.GET_CURRENT_TIME,
  TOOL_NAME.WEB_FETCH,
  TOOL_NAME.WEB_FETCH_RAW,
  TOOL_NAME.WEB_SEARCH,
  TOOL_NAME.LOAD_SKILL,
  TOOL_NAME.DISPATCH_AGENT,
]);
