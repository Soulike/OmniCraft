import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  TOOL_NAME,
  writeFileParametersSchema,
  writeFileResultSchema,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import {FileStatCheckResult} from '@/agent-core/agent/index.js';
import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  checkExistingFileAccess,
  checkLexicalFileAccess,
  checkNewFileAccess,
} from './file-access-policy.js';
import {formatBlockedFileAccessMessage} from './file-access-policy-messages.js';
import {countLines} from './helpers.js';

const MAX_CONTENT_SIZE = 1_048_576; // 1MB

const parameters = writeFileParametersSchema;

type WriteFileArgs = z.infer<typeof parameters>;
type WriteFileResult = z.infer<typeof writeFileResultSchema>;

/** Built-in tool that creates or overwrites a file. */
export const writeFileTool: ToolDefinition<typeof parameters, WriteFileResult> =
  {
    name: TOOL_NAME.WRITE_FILE,
    displayName: 'Write File',
    description:
      'Creates a new file or overwrites an existing file. ' +
      'Use this to create files that do not exist yet, ' +
      'or to completely replace the content of an existing file. ' +
      'When only part of the content needs to change, ' +
      'prefer a targeted replacement over a full overwrite.',
    parameters,
    suppressToolEvents: false,
    async execute(args: WriteFileArgs, context: ToolExecutionContext) {
      const {workingDirectory} = context;

      // 1. Check content size
      if (Buffer.byteLength(args.content) > MAX_CONTENT_SIZE) {
        return {
          data: {message: `Content exceeds ${MAX_CONTENT_SIZE} byte limit`},
          content: `Error: Content exceeds ${MAX_CONTENT_SIZE} byte limit`,
          status: 'failure',
        };
      }

      // 2. Resolve path
      const absolutePath = path.resolve(workingDirectory, args.filePath);

      const lexicalPolicyResult = checkLexicalFileAccess(absolutePath);
      if (!lexicalPolicyResult.allowed) {
        const message = formatBlockedFileAccessMessage(args.filePath);
        return {
          data: {message},
          content: message,
          status: 'failure',
        };
      }

      // 3. Check if file exists — if so, verify it was read first
      let existingStat: Stats | null = null;
      try {
        existingStat = await fs.stat(absolutePath);
      } catch {
        // File doesn't exist, which is fine for write_file
      }

      const policyResult = existingStat
        ? await checkExistingFileAccess(absolutePath)
        : await checkNewFileAccess(absolutePath);
      if (!policyResult.allowed) {
        const message = formatBlockedFileAccessMessage(args.filePath);
        return {
          data: {message},
          content: message,
          status: 'failure',
        };
      }

      if (existingStat) {
        const checkResult = context.fileStatTracker.canModify(
          absolutePath,
          existingStat.size,
          existingStat.mtimeMs,
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
      } else {
        const checkResult = context.fileStatTracker.canModify(
          absolutePath,
          0,
          0,
        );
        if (checkResult === FileStatCheckResult.MODIFIED_SINCE_LAST_READ) {
          return {
            data: {
              message:
                'File has been deleted since last read. Verify that the write is still intended after deletion, then retry.',
            },
            content:
              'Error: File has been deleted since last read. Verify that the write is still intended after deletion, then retry.',
            status: 'failure',
          };
        }
      }

      // 4. Auto-create parent directories
      await fs.mkdir(path.dirname(absolutePath), {recursive: true});

      // 5. Write file
      try {
        await fs.writeFile(absolutePath, args.content, 'utf-8');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          data: {message},
          content: `Error: ${message}`,
          status: 'failure',
        };
      }

      // Track new file stat
      const newStat = await fs.stat(absolutePath);
      context.fileStatTracker.set(absolutePath, newStat.size, newStat.mtimeMs);
      context.fileCache.invalidate(absolutePath);

      // 6. Count lines and return success
      const lineCount = await countLines(Buffer.from(args.content));
      const data: WriteFileResult = {filePath: args.filePath, lineCount};
      return {
        data,
        content: `File written: ${args.filePath} (${lineCount} lines)`,
        status: 'success',
      };
    },
  };
