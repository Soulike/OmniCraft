import assert from 'node:assert';
import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {AccessCheckResult, checkAccess} from './helpers.js';
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

/** Built-in tool that searches for files matching a glob pattern. */
export const findFilesTool: ToolDefinition<typeof parameters> = {
  name: 'find_files',
  displayName: 'Find Files',
  description:
    'Searches for files matching a glob pattern and returns their paths. ' +
    'Use this to locate files by name or extension (e.g., find all TypeScript files, locate a config file). ' +
    `To search file contents instead, use ${searchFilesTool.name}.`,
  parameters,
  async execute(
    args: FindFilesArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
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
    if (accessResult === AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES) {
      return 'Error: Access denied: path is outside the allowed directories';
    }

    // 3. Verify directory exists
    let stat: Stats;
    try {
      stat = await fs.stat(searchDir);
    } catch {
      return `Error: Directory not found: ${args.path}`;
    }

    if (!stat.isDirectory()) {
      return `Error: Not a directory: ${args.path}`;
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
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
    }

    // 5. Sort alphabetically
    entries.sort();

    // 6. Format output
    const displayPath = args.path ?? workingDirectory;
    const hitLimit = entries.length >= MAX_RESULTS;

    if (entries.length === 0 && timedOut) {
      return `No files found matching "${args.pattern}" in ${displayPath} (search timed out after 30s).`;
    }

    if (entries.length === 0) {
      return `No files found matching "${args.pattern}" in ${displayPath}.`;
    }

    const body = entries.join('\n');

    if (timedOut) {
      const header = `Found ${entries.length} files matching "${args.pattern}" in ${displayPath} (search timed out after 30s):`;
      return `${header}\n${body}\nResults may be incomplete. Use a more specific pattern to narrow down.`;
    }

    if (hitLimit) {
      const header = `Found ${MAX_RESULTS}+ files matching "${args.pattern}" in ${displayPath} (showing first ${MAX_RESULTS}):`;
      return `${header}\n${body}\nUse a more specific pattern to narrow down.`;
    }

    const header = `Found ${entries.length} files matching "${args.pattern}" in ${displayPath}:`;
    return `${header}\n${body}`;
  },
};
