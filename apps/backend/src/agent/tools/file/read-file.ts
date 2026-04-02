import fs from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {formatWithLineNumbers, isBinaryFile, isSubPath} from './helpers.js';

const MAX_RETURN_SIZE = 32_768; // 32KB

const parameters = z.object({
  filePath: z
    .string()
    .describe('File path, absolute or relative to working directory'),
  startLine: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Start line number (1-based), defaults to 1'),
  lineCount: z
    .number()
    .int()
    .min(1)
    .optional()
    .describe('Number of lines to read, defaults to end of file'),
});

type ReadFileArgs = z.infer<typeof parameters>;

/** Built-in tool that reads text file contents with line numbers. */
export const readFileTool: ToolDefinition<typeof parameters> = {
  name: 'read_file',
  displayName: 'Read File',
  description:
    'Reads a text file and returns its contents with line numbers. ' +
    'Supports partial reads via startLine and lineCount parameters. ' +
    'Only text files within the working directory are allowed.',
  parameters,
  async execute(
    args: ReadFileArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory, fileCache} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Security check
    if (!isSubPath(workingDirectory, absolutePath)) {
      return 'Error: Access denied: path is outside the working directory';
    }

    // 3. Stat
    let stat: Awaited<ReturnType<typeof fs.stat>>;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      return `Error: File not found: ${args.filePath}`;
    }

    if (!stat.isFile()) {
      return `Error: Not a file: ${args.filePath}`;
    }

    // 4. Binary check
    try {
      if (await isBinaryFile(absolutePath)) {
        return `Error: Binary file detected: ${args.filePath}. Only text files are supported.`;
      }
    } catch {
      return `Error: Unable to check if file is binary: ${args.filePath}`;
    }

    // 5. Get content (cache or disk)
    let fullContent: string | undefined = await fileCache.get(absolutePath);
    if (fullContent === undefined) {
      try {
        fullContent = await fs.readFile(absolutePath, 'utf-8');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: ${message}`;
      }
      await fileCache.set(absolutePath, fullContent);
    }

    // 6. Split into lines and extract range
    const allLines = fullContent.split('\n');
    if (allLines.length > 0 && allLines[allLines.length - 1] === '') {
      allLines.pop();
    }
    const totalLines = allLines.length;

    const startLine = args.startLine ?? 1;
    const endLine = args.lineCount
      ? Math.min(startLine + args.lineCount - 1, totalLines)
      : totalLines;

    const selectedLines = allLines.slice(startLine - 1, endLine);

    // 7. Format with line numbers
    const formatted = formatWithLineNumbers(
      selectedLines,
      startLine,
      totalLines,
    );

    // 8. Check size limit
    if (Buffer.byteLength(formatted) > MAX_RETURN_SIZE) {
      return (
        `Error: Read result exceeds 32KB limit. ` +
        `File: ${args.filePath} (${totalLines} lines). ` +
        `Use startLine and lineCount to read a portion.`
      );
    }

    // 9. Build header and return
    const isPartial = startLine !== 1 || endLine !== totalLines;
    const rangeInfo = isPartial
      ? ` (${totalLines} lines, showing lines ${startLine}-${endLine})`
      : ` (${totalLines} lines)`;
    const header = `File: ${args.filePath}${rangeInfo}`;

    return `${header}\n${formatted}`;
  },
};
