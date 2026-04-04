import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import {FileStatCheckResult} from '@/agent-core/agent/index.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {AccessCheckResult, checkAccess, countLines} from './helpers.js';

const MAX_CONTENT_SIZE = 1_048_576; // 1MB

const parameters = z.object({
  filePath: z
    .string()
    .min(1)
    .describe('File path, absolute or relative to working directory'),
  content: z.string().describe('File content to write'),
});

type WriteFileArgs = z.infer<typeof parameters>;

/** Built-in tool that creates or overwrites a file. */
export const writeFileTool: ToolDefinition<typeof parameters> = {
  name: 'write_file',
  displayName: 'Write File',
  description:
    'Creates a new file or overwrites an existing file. ' +
    'Prefer editing over overwriting when modifying existing files.',
  parameters,
  async execute(
    args: WriteFileArgs,
    context: ToolExecutionContext,
  ): Promise<string> {
    const {workingDirectory} = context;

    // 1. Check content size
    if (Buffer.byteLength(args.content) > MAX_CONTENT_SIZE) {
      return `Error: Content exceeds ${MAX_CONTENT_SIZE} byte limit`;
    }

    // 2. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 3. Security check
    const accessResult = checkAccess(
      absolutePath,
      'read-write',
      workingDirectory,
      context.extraAllowedPaths,
    );
    if (accessResult === AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES) {
      return 'Error: Access denied: path is outside the allowed directories';
    }
    if (accessResult === AccessCheckResult.ERROR_READ_ONLY) {
      return 'Error: Access denied: path is read-only';
    }

    // 4. Check if file exists — if so, verify it was read first
    let existingStat: Stats | null = null;
    try {
      existingStat = await fs.stat(absolutePath);
    } catch {
      // File doesn't exist, which is fine for write_file
    }

    if (existingStat) {
      const checkResult = context.fileStatTracker.canModify(
        absolutePath,
        existingStat.size,
        existingStat.mtimeMs,
      );
      if (checkResult === FileStatCheckResult.NOT_READ) {
        return 'Error: Read the file before modifying it';
      }
      if (checkResult === FileStatCheckResult.MODIFIED_SINCE_LAST_READ) {
        return 'Error: File has been modified since last read. Read the file again before modifying it';
      }
    } else {
      const checkResult = context.fileStatTracker.canModify(absolutePath, 0, 0);
      if (checkResult === FileStatCheckResult.MODIFIED_SINCE_LAST_READ) {
        return 'Error: File has been deleted since last read. Verify that the write is still intended after deletion, then retry.';
      }
    }

    // 5. Auto-create parent directories
    await fs.mkdir(path.dirname(absolutePath), {recursive: true});

    // 6. Write file
    try {
      await fs.writeFile(absolutePath, args.content, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // Track new file stat
    const newStat = await fs.stat(absolutePath);
    context.fileStatTracker.set(absolutePath, newStat.size, newStat.mtimeMs);
    context.fileCache.invalidate(absolutePath);

    // 7. Count lines and return success
    const lineCount = await countLines(Buffer.from(args.content));
    return `File written: ${args.filePath} (${lineCount} lines)`;
  },
};
