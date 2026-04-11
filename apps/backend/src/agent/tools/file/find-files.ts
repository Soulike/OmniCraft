import assert from 'node:assert';
import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {findFilesResultSchema, TOOL_NAME} from '@omnicraft/tool-schemas';
import fg from 'fast-glob';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {AccessCheckResult, checkAccess} from '@/helpers/path-access.js';

import {searchFilesTool} from './search-files.js';

const MAX_RESULTS = 100;
const TIMEOUT_MS = 30_000;

const parameters = z.object({
  pattern: z
    .string()
    .min(1)
    .describe(
      'Glob pattern to match files, e.g. "**/*.ts", "src/{components,hooks}/**/*.ts"',
    ),
  path: z
    .string()
    .optional()
    .describe(
      'Search root directory (relative or absolute), defaults to working directory',
    ),
});

type FindFilesArgs = z.infer<typeof parameters>;
type FindFilesResult = z.infer<typeof findFilesResultSchema>;

/** Built-in tool that searches for files matching a glob pattern. */
export const findFilesTool: ToolDefinition<typeof parameters, FindFilesResult> =
  {
    name: TOOL_NAME.FIND_FILES,
    displayName: 'Find Files',
    description:
      'Searches for files matching a glob pattern and returns their paths. ' +
      'Use this to locate files by name or extension (e.g., find all TypeScript files, locate a config file). ' +
      `To search file contents instead, use ${searchFilesTool.name}.`,
    parameters,
    resultSchema: findFilesResultSchema,
    suppressToolEvents: false,
    async execute(args: FindFilesArgs, context: ToolExecutionContext) {
      const {workingDirectory} = context;

      // 1. Resolve search directory
      const searchDir = path.resolve(workingDirectory, args.path ?? '.');

      // 2. Security check
      const accessResult = checkAccess(
        searchDir,
        'read',
        workingDirectory,
        context.extraAllowedPaths,
      );
      if (
        accessResult === AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES
      ) {
        return {
          data: {
            message: 'Access denied: path is outside the allowed directories',
          },
          content:
            'Error: Access denied: path is outside the allowed directories',
          status: 'failure',
        };
      }

      // 3. Verify directory exists
      let stat: Stats;
      try {
        stat = await fs.stat(searchDir);
      } catch {
        return {
          data: {message: `Directory not found: ${args.path}`},
          content: `Error: Directory not found: ${args.path}`,
          status: 'failure',
        };
      }

      if (!stat.isDirectory()) {
        return {
          data: {message: `Not a directory: ${args.path}`},
          content: `Error: Not a directory: ${args.path}`,
          status: 'failure',
        };
      }

      // 4. Run fast-glob with stream
      const stream = fg.stream(args.pattern, {
        cwd: searchDir,
        onlyFiles: true,
        dot: true,
      });

      const entries: string[] = [];
      let timedOut = false;

      try {
        const startTime = Date.now();
        for await (const entry of stream) {
          assert(typeof entry === 'string');
          entries.push(entry);
          if (entries.length >= MAX_RESULTS) {
            break;
          }
          if (Date.now() - startTime > TIMEOUT_MS) {
            timedOut = true;
            break;
          }
        }
      } catch (error: unknown) {
        if (entries.length === 0) {
          const message =
            error instanceof Error ? error.message : String(error);
          return {
            data: {message},
            content: `Error: ${message}`,
            status: 'failure',
          };
        }
      }

      // 5. Sort alphabetically
      entries.sort();

      // 6. Format output
      const displayPath = args.path ?? workingDirectory;
      const hitLimit = entries.length >= MAX_RESULTS;

      if (entries.length === 0 && timedOut) {
        return {
          data: {
            message: `No files found matching "${args.pattern}" in ${displayPath} (search timed out after 30s).`,
          },
          content: `No files found matching "${args.pattern}" in ${displayPath} (search timed out after 30s).`,
          status: 'failure',
        };
      }

      if (entries.length === 0) {
        const data: FindFilesResult = {
          pattern: args.pattern,
          basePath: displayPath,
          files: [],
          truncated: false,
        };
        return {
          data,
          content: `No files found matching "${args.pattern}" in ${displayPath}.`,
          status: 'success',
        };
      }

      const body = entries.join('\n');

      if (timedOut) {
        const header = `Found ${entries.length} files matching "${args.pattern}" in ${displayPath} (search timed out after 30s):`;
        return {
          data: {
            message: `${header} Results may be incomplete. Use a more specific pattern to narrow down.`,
          },
          content: `${header}\n${body}\nResults may be incomplete. Use a more specific pattern to narrow down.`,
          status: 'failure',
        };
      }

      if (hitLimit) {
        const header = `Found ${MAX_RESULTS}+ files matching "${args.pattern}" in ${displayPath} (showing first ${MAX_RESULTS}):`;
        const data: FindFilesResult = {
          pattern: args.pattern,
          basePath: displayPath,
          files: entries,
          truncated: true,
        };
        return {
          data,
          content: `${header}\n${body}\nUse a more specific pattern to narrow down.`,
          status: 'success',
        };
      }

      const header = `Found ${entries.length} files matching "${args.pattern}" in ${displayPath}:`;
      const data: FindFilesResult = {
        pattern: args.pattern,
        basePath: displayPath,
        files: entries,
        truncated: false,
      };
      return {data, content: `${header}\n${body}`, status: 'success'};
    },
  };
