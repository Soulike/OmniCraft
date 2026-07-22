import {z} from 'zod';

import {
  askUserResultSchema,
  editFileResultSchema,
  findFilesResultSchema,
  getCurrentTimeResultSchema,
  loadSkillResultSchema,
  mcpToolResultSchema,
  readFileResultSchema,
  runCommandResultSchema,
  searchFilesResultSchema,
  toolFailureDataSchema,
  webFetchRawResultSchema,
  webFetchResultSchema,
  webSearchResultSchema,
  writeFileResultSchema,
} from './result-schemas.js';
import {INTERNAL_TOOL_NAME, type InternalToolName} from './tool-name.js';

/** Maps each tool name to its success result schema. */
export const toolResultSchemas = {
  [INTERNAL_TOOL_NAME.READ_FILE]: readFileResultSchema,
  [INTERNAL_TOOL_NAME.WRITE_FILE]: writeFileResultSchema,
  [INTERNAL_TOOL_NAME.EDIT_FILE]: editFileResultSchema,
  [INTERNAL_TOOL_NAME.FIND_FILES]: findFilesResultSchema,
  [INTERNAL_TOOL_NAME.SEARCH_FILES]: searchFilesResultSchema,
  [INTERNAL_TOOL_NAME.RUN_COMMAND]: runCommandResultSchema,
  [INTERNAL_TOOL_NAME.GET_CURRENT_TIME]: getCurrentTimeResultSchema,
  [INTERNAL_TOOL_NAME.WEB_FETCH]: webFetchResultSchema,
  [INTERNAL_TOOL_NAME.WEB_FETCH_RAW]: webFetchRawResultSchema,
  [INTERNAL_TOOL_NAME.WEB_SEARCH]: webSearchResultSchema,
  [INTERNAL_TOOL_NAME.LOAD_SKILL]: loadSkillResultSchema,
  [INTERNAL_TOOL_NAME.ASK_USER]: askUserResultSchema,
} as const;

/** Infer the success result data type for a given tool name. */
export type ToolResultData<K extends InternalToolName> = z.infer<
  (typeof toolResultSchemas)[K]
>;

export type ToolFailureData = z.infer<typeof toolFailureDataSchema>;

/** Union of all valid tool result data shapes (success + failure). */
export const toolResultDataSchema = z.union([
  readFileResultSchema,
  writeFileResultSchema,
  editFileResultSchema,
  findFilesResultSchema,
  searchFilesResultSchema,
  runCommandResultSchema,
  getCurrentTimeResultSchema,
  webFetchResultSchema,
  webFetchRawResultSchema,
  webSearchResultSchema,
  loadSkillResultSchema,
  askUserResultSchema,
  mcpToolResultSchema,
  toolFailureDataSchema,
]);

export type AnyToolResultData = z.infer<typeof toolResultDataSchema>;
