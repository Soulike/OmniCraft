import fs from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {countLines, isSubPath} from './helpers.js';

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

    // 4. Auto-create parent directories
    await fs.mkdir(path.dirname(absolutePath), {recursive: true});

    // 5. Write file
    try {
      await fs.writeFile(absolutePath, args.content, 'utf-8');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: ${message}`;
    }

    // 6. Count lines and return success
    const lineCount = await countLines(Buffer.from(args.content));
    return `File written: ${args.filePath} (${lineCount} lines)`;
  },
};
