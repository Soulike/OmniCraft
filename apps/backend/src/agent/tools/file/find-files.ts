import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import fg from 'fast-glob';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isSubPathOrSelf} from './helpers.js';

const MAX_RESULTS = 100;

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
    'Searches for files matching a glob pattern and returns their paths.',
  parameters,
  async execute(
    args: FindFilesArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Resolve search directory
    const searchDir = path.resolve(workingDirectory, args.path ?? '.');

    // 2. Security check
    if (!isSubPathOrSelf(workingDirectory, searchDir)) {
      const allowed = context.extraAllowedPaths.some((entry) =>
        isSubPathOrSelf(entry.path, searchDir),
      );
      if (!allowed) {
        return 'Error: Access denied: path is outside the allowed directories';
      }
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

    // 4. Run fast-glob
    let entries: string[];
    try {
      entries = await fg(args.pattern, {
        cwd: searchDir,
        onlyFiles: true,
        dot: true,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 5. Sort alphabetically
    entries.sort();

    // 6. Format output
    const displayPath = args.path ?? workingDirectory;

    if (entries.length === 0) {
      return `No files found matching "${args.pattern}" in ${displayPath}.`;
    }

    const total = entries.length;
    const truncated = total > MAX_RESULTS;
    const shown = truncated ? entries.slice(0, MAX_RESULTS) : entries;

    const header = truncated
      ? `Found ${MAX_RESULTS} of ${total} files matching "${args.pattern}" in ${displayPath} (truncated):`
      : `Found ${total} files matching "${args.pattern}" in ${displayPath}:`;

    const body = shown.join('\n');

    const footer = truncated
      ? `\nShowing ${MAX_RESULTS} of ${total} results. Use a more specific pattern to narrow down.`
      : '';

    return `${header}\n${body}${footer}`;
  },
};
