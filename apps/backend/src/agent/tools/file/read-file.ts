import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  readFileParametersSchema,
  readFileResultSchema,
  TOOL_NAME,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  countLines,
  formatWithLineNumbers,
  isBinaryFile,
  readLineRange,
  ReadSizeLimitError,
} from './helpers.js';

const MAX_RETURN_SIZE = 32_768; // 32KB
const MAX_FULL_READ_FILE_SIZE = 1_048_576; // 1MB

const parameters = readFileParametersSchema;

type ReadFileArgs = z.infer<typeof parameters>;
type ReadFileResult = z.infer<typeof readFileResultSchema>;

/** Built-in tool that reads text file contents with line numbers. */
export const readFileTool: ToolDefinition<typeof parameters, ReadFileResult> = {
  name: TOOL_NAME.READ_FILE,
  displayName: 'Read File',
  description:
    'Reads a text file and returns its contents with line numbers. ' +
    'Supports partial reads via startLine and lineCount parameters. ' +
    'Use this whenever you need to see the current content of a file ' +
    'or review a specific section of it.',
  parameters,
  suppressToolEvents: false,
  compactResult({content, status, toolCall}) {
    let filePath = '';
    try {
      const args = JSON.parse(toolCall.arguments) as {filePath?: string};
      filePath = args.filePath ?? '';
    } catch {
      // Keep filePath empty when arguments are not valid JSON.
    }

    const header = content.split('\n')[0] ?? '';
    return [
      `${TOOL_NAME.READ_FILE} ${status}`,
      filePath ? `File: ${filePath}` : header,
      header && header !== filePath ? header : '',
    ]
      .filter(Boolean)
      .join('\n');
  },
  async execute(args: ReadFileArgs, context: ToolExecutionContext) {
    const {workingDirectory, fileCache} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Stat
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

    // 3. Binary check
    try {
      if (await isBinaryFile(absolutePath)) {
        return {
          data: {
            message: `Binary file detected: ${args.filePath}. Only text files are supported.`,
          },
          content: `Error: Binary file detected: ${args.filePath}. Only text files are supported.`,
          status: 'failure',
        };
      }
    } catch {
      return {
        data: {
          message: `Unable to check if file is binary: ${args.filePath}`,
        },
        content: `Error: Unable to check if file is binary: ${args.filePath}`,
        status: 'failure',
      };
    }

    // 4–5. Get content and extract lines
    const startLine = args.startLine ?? 1;
    let selectedLines: string[];
    let totalLines: number;

    try {
      if (stat.size <= MAX_FULL_READ_FILE_SIZE) {
        // Small file: use cache, parse lines from memory
        let content: string | undefined = await fileCache.get(absolutePath);
        if (content === undefined) {
          content = await fs.readFile(absolutePath, 'utf-8');
          await fileCache.set(absolutePath, content);
        }
        const contentBuffer = Buffer.from(content);
        [totalLines, selectedLines] = await Promise.all([
          countLines(contentBuffer),
          readLineRange(
            contentBuffer,
            startLine,
            args.lineCount,
            MAX_RETURN_SIZE,
          ),
        ]);
      } else {
        // Large file: stream from disk, never load full content into memory
        [totalLines, selectedLines] = await Promise.all([
          countLines(absolutePath),
          readLineRange(
            absolutePath,
            startLine,
            args.lineCount,
            MAX_RETURN_SIZE,
          ),
        ]);
      }
    } catch (error: unknown) {
      if (error instanceof ReadSizeLimitError) {
        return {
          data: {
            message:
              `${error.message}. ` +
              `Use startLine and lineCount to read a smaller portion.`,
          },
          content:
            `Error: ${error.message}. ` +
            `Use startLine and lineCount to read a smaller portion.`,
          status: 'failure',
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {data: {message}, content: `Error: ${message}`, status: 'failure'};
    }

    const endLine = args.lineCount
      ? Math.min(startLine + args.lineCount - 1, totalLines)
      : totalLines;

    // 6. Format with line numbers and return
    const formatted = formatWithLineNumbers(
      selectedLines,
      startLine,
      totalLines,
    );

    const isPartial = startLine !== 1 || endLine !== totalLines;
    const rangeInfo = isPartial
      ? ` (${totalLines} lines, showing lines ${startLine}-${endLine})`
      : ` (${totalLines} lines)`;
    const header = `File: ${args.filePath}${rangeInfo}`;

    // 7. Track file stat for modification safety
    context.fileStatTracker.set(absolutePath, stat.size, stat.mtimeMs);

    const data: ReadFileResult = {
      filePath: args.filePath,
      totalLines,
      startLine,
      endLine,
      content: selectedLines.join('\n'),
    };

    return {data, content: `${header}\n${formatted}`, status: 'success'};
  },
};
