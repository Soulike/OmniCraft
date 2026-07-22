import {z} from 'zod';

/** Canonical built-in tool name constants — single source of truth. */
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
  ASK_USER: 'ask_user',
} as const;

/** A built-in tool's name — the closed catalog defined by {@link TOOL_NAME}. */
export type InternalToolName = (typeof TOOL_NAME)[keyof typeof TOOL_NAME];

/** Zod schema for the closed set of built-in tool names. */
export const internalToolNameSchema = z.enum([
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
  TOOL_NAME.ASK_USER,
]);

/** Zod schema matching an external MCP tool's namespaced name. */
export const mcpToolNameSchema = z.templateLiteral(['mcp__', z.string()]);

/** An external MCP tool's namespaced name: `mcp__<server>__<tool>`. */
export type McpToolName = z.infer<typeof mcpToolNameSchema>;

/**
 * Any tool name the system can emit — a built-in tool name or an MCP tool name.
 * Because {@link mcpToolNameSchema} is a template literal (a proper subtype of
 * `string`), this union does NOT collapse to `string`: built-in names stay a
 * closed set that exhaustive switches can narrow.
 */
export const toolNameSchema = z.union([
  internalToolNameSchema,
  mcpToolNameSchema,
]);

/** A built-in tool name (`InternalToolName`) or an MCP tool name (`McpToolName`). */
export type ToolName = z.infer<typeof toolNameSchema>;
