import {z} from 'zod';

import {
  editFileResultSchema,
  findFilesResultSchema,
  getCurrentTimeResultSchema,
  loadSkillResultSchema,
  readFileResultSchema,
  runCommandResultSchema,
  searchFilesResultSchema,
  toolFailureDataSchema,
  webFetchRawResultSchema,
  webFetchResultSchema,
  webSearchResultSchema,
  writeFileResultSchema,
} from './result-schemas.js';
import {TOOL_NAME, type ToolName} from './tool-name.js';

/** Maps each tool name to its success result schema. */
export const toolResultSchemas = {
  [TOOL_NAME.READ_FILE]: readFileResultSchema,
  [TOOL_NAME.WRITE_FILE]: writeFileResultSchema,
  [TOOL_NAME.EDIT_FILE]: editFileResultSchema,
  [TOOL_NAME.FIND_FILES]: findFilesResultSchema,
  [TOOL_NAME.SEARCH_FILES]: searchFilesResultSchema,
  [TOOL_NAME.RUN_COMMAND]: runCommandResultSchema,
  [TOOL_NAME.GET_CURRENT_TIME]: getCurrentTimeResultSchema,
  [TOOL_NAME.WEB_FETCH]: webFetchResultSchema,
  [TOOL_NAME.WEB_FETCH_RAW]: webFetchRawResultSchema,
  [TOOL_NAME.WEB_SEARCH]: webSearchResultSchema,
  [TOOL_NAME.LOAD_SKILL]: loadSkillResultSchema,
} as const;

/** Infer the success result data type for a given tool name. */
export type ToolResultData<K extends ToolName> = z.infer<
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
  toolFailureDataSchema,
]);

export type AnyToolResultData = z.infer<typeof toolResultDataSchema>;
