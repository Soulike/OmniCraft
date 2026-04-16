import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  editFileParametersSchema,
  editFileResultSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import {createPatch} from 'diff';
import {z} from 'zod';

import {FileStatCheckResult} from '@/agent-core/agent/index.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {AccessCheckResult, checkAccess} from '@/helpers/path-access.js';

const MAX_DIFF_SIZE = 4_096; // 4KB
const MAX_FILE_SIZE = 10_485_760; // 10MB

const parameters = editFileParametersSchema;

type EditFileArgs = z.infer<typeof parameters>;
type EditFileResult = z.infer<typeof editFileResultSchema>;

/** Counts non-overlapping occurrences of a substring in a string. */
function countOccurrences(content: string, search: string): number {
  let count = 0;
  let index = 0;
  while ((index = content.indexOf(search, index)) !== -1) {
    count++;
    index += search.length;
  }
  return count;
}

/** Built-in tool that makes targeted string replacements in a file. */
export const editFileTool: ToolDefinition<typeof parameters, EditFileResult> = {
  name: TOOL_NAME.EDIT_FILE,
  displayName: 'Edit File',
  description:
    'Replaces a specific string in a file and returns a diff of the change. ' +
    'Use this to make targeted modifications to an existing file ' +
    'without rewriting the entire file. ' +
    'Requires the old string to uniquely match unless replaceAll is set.',
  parameters,
  suppressToolEvents: false,
  async execute(args: EditFileArgs, context: ToolExecutionContext) {
    const {workingDirectory} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Security check
    const accessResult = checkAccess(
      absolutePath,
      'read-write',
      workingDirectory,
      context.extraAllowedPaths,
    );
    if (accessResult === AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES) {
      return {
        data: {
          message: 'Access denied: path is outside the allowed directories',
        },
        content:
          'Error: Access denied: path is outside the allowed directories',
        status: 'failure',
      };
    }
    if (accessResult === AccessCheckResult.ERROR_READ_ONLY) {
      return {
        data: {message: 'Access denied: path is read-only'},
        content: 'Error: Access denied: path is read-only',
        status: 'failure',
      };
    }

    // 3. Read file
    let stat: Stats;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return {
        data: {message: `File not found: ${args.filePath}`},
        content: `Error: File not found: ${args.filePath}`,
        status: 'failure',
      };
    }

    if (!stat.isFile()) {
      return {
        data: {message: `Not a file: ${args.filePath}`},
        content: `Error: Not a file: ${args.filePath}`,
        status: 'failure',
      };
    }

    if (stat.size > MAX_FILE_SIZE) {
      return {
        data: {message: `File exceeds ${MAX_FILE_SIZE} byte limit`},
        content: `Error: File exceeds ${MAX_FILE_SIZE} byte limit`,
        status: 'failure',
      };
    }

    const checkResult = context.fileStatTracker.canModify(
      absolutePath,
      stat.size,
      stat.mtimeMs,
    );
    if (checkResult === FileStatCheckResult.NOT_READ) {
      return {
        data: {message: 'Read the file before modifying it'},
        content: 'Error: Read the file before modifying it',
        status: 'failure',
      };
    }
    if (checkResult === FileStatCheckResult.MODIFIED_SINCE_LAST_READ) {
      return {
        data: {
          message:
            'File has been modified since last read. Read the file again before modifying it',
        },
        content:
          'Error: File has been modified since last read. Read the file again before modifying it',
        status: 'failure',
      };
    }

    let oldContent: string;
    try {
      oldContent = await fs.readFile(absolutePath, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {data: {message}, content: `Error: ${message}`, status: 'failure'};
    }

    // 4. Check for no-op replacement
    if (args.oldString === args.newString) {
      return {
        data: {
          message: 'oldString and newString are identical. No changes needed.',
        },
        content:
          'Error: oldString and newString are identical. No changes needed.',
        status: 'failure',
      };
    }

    // 5. Count occurrences
    const matchCount = countOccurrences(oldContent, args.oldString);

    if (matchCount === 0) {
      return {
        data: {message: `old string not found in ${args.filePath}`},
        content: `Error: old string not found in ${args.filePath}`,
        status: 'failure',
      };
    }

    if (matchCount > 1 && !args.replaceAll) {
      return {
        data: {
          message:
            `Found ${matchCount} matches in ${args.filePath}. ` +
            'Provide more context to make a unique match, or set replaceAll to replace all occurrences.',
        },
        content:
          `Error: Found ${matchCount} matches in ${args.filePath}. ` +
          'Provide more context to make a unique match, or set replaceAll to replace all occurrences.',
        status: 'failure',
      };
    }

    // 5. Perform replacement
    const newContent = args.replaceAll
      ? oldContent.replaceAll(args.oldString, args.newString)
      : oldContent.replace(args.oldString, args.newString);

    // 6. Write file
    try {
      await fs.writeFile(absolutePath, newContent, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {data: {message}, content: `Error: ${message}`, status: 'failure'};
    }

    // Track new file stat
    const newStat = await fs.stat(absolutePath);
    context.fileStatTracker.set(absolutePath, newStat.size, newStat.mtimeMs);
    context.fileCache.invalidate(absolutePath);

    // 7. Generate diff
    const diff = createPatch(args.filePath, oldContent, newContent);
    const header = `File edited: ${args.filePath} (${matchCount} replacement(s))`;

    if (Buffer.byteLength(diff) > MAX_DIFF_SIZE) {
      const truncated = diff.slice(0, MAX_DIFF_SIZE);
      const data: EditFileResult = {
        filePath: args.filePath,
        matchCount,
        diff,
        truncated: true,
      };
      return {
        data,
        content: `${header}\n${truncated}\n... Diff truncated. Read the file to review the modified sections.`,
        status: 'success',
      };
    }

    const data: EditFileResult = {
      filePath: args.filePath,
      matchCount,
      diff,
      truncated: false,
    };
    return {data, content: `${header}\n${diff}`, status: 'success'};
  },
};
