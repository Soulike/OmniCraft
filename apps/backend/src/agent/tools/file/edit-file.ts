import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {createPatch} from 'diff';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {isSubPath} from './helpers.js';

const MAX_DIFF_SIZE = 4_096; // 4KB
const MAX_FILE_SIZE = 10_485_760; // 10MB

const parameters = z.object({
  filePath: z
    .string()
    .min(1)
    .describe('File path, absolute or relative to working directory'),
  oldString: z.string().min(1).describe('The exact string to find and replace'),
  newString: z.string().describe('The replacement string'),
  replaceAll: z
    .boolean()
    .optional()
    .describe(
      'Replace all occurrences. Defaults to false (requires unique match)',
    ),
});

type EditFileArgs = z.infer<typeof parameters>;

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
export const editFileTool: ToolDefinition<typeof parameters> = {
  name: 'edit_file',
  displayName: 'Edit File',
  description:
    'Replaces a specific string in a file. ' +
    'Requires the old string to uniquely match unless replaceAll is set.',
  parameters,
  async execute(
    args: EditFileArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Security check
    if (!isSubPath(workingDirectory, absolutePath)) {
      const matchedEntry = context.extraAllowedPaths.find((entry) =>
        isSubPath(entry.path, absolutePath),
      );
      if (!matchedEntry) {
        return 'Error: Access denied: path is outside the allowed directories';
      }
      if (matchedEntry.mode === 'read') {
        return 'Error: Access denied: path is read-only';
      }
    }

    // 3. Read file
    let stat: Stats;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return `Error: File not found: ${args.filePath}`;
    }

    if (!stat.isFile()) {
      return `Error: Not a file: ${args.filePath}`;
    }

    if (stat.size > MAX_FILE_SIZE) {
      return `Error: File exceeds ${MAX_FILE_SIZE} byte limit`;
    }

    let oldContent: string;
    try {
      oldContent = await fs.readFile(absolutePath, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 4. Count occurrences
    const matchCount = countOccurrences(oldContent, args.oldString);

    if (matchCount === 0) {
      return `Error: old string not found in ${args.filePath}`;
    }

    if (matchCount > 1 && !args.replaceAll) {
      return (
        `Error: Found ${matchCount} matches in ${args.filePath}. ` +
        'Provide more context to make a unique match, or set replaceAll to replace all occurrences.'
      );
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
      return `Error: ${message}`;
    }

    // 7. Generate diff
    const diff = createPatch(args.filePath, oldContent, newContent);
    const header = `File edited: ${args.filePath} (${matchCount} replacement(s))`;

    if (Buffer.byteLength(diff) > MAX_DIFF_SIZE) {
      const truncated = diff.slice(0, MAX_DIFF_SIZE);
      return `${header}\n${truncated}\n... Diff truncated. Read the file to review the modified sections.`;
    }

    return `${header}\n${diff}`;
  },
};
