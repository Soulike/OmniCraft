import type {Stats} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
  INTERNAL_TOOL_NAME,
  readFileParametersSchema,
  readFileResultSchema,
} from '@omnicraft/tool-schemas';
import {fileTypeFromFile} from 'file-type';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {MAX_INLINE_MEDIA_BYTES} from '@/agent-core/tool/media-guard.js';

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
  kind: 'internal',
  name: INTERNAL_TOOL_NAME.READ_FILE,
  displayName: 'Read File',
  description:
    'Reads a file and returns its contents. ' +
    'Text files are returned with line numbers in chunks up to ' +
    `${MAX_RETURN_SIZE / 1024} KB per read (use startLine and lineCount to page through larger files). ` +
    'Images (PNG, JPEG, GIF, WEBP) and PDFs are returned to the model as media when under ' +
    `${MAX_INLINE_MEDIA_BYTES / 1024 / 1024} MB; larger media cannot be returned and must be reduced first ` +
    '(for example, downsample an image or extract pages or text from a PDF). ' +
    'Use this whenever you need to see the current content of a file or review a specific section of it.',
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
      `${INTERNAL_TOOL_NAME.READ_FILE} ${status}`,
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
        content: [
          {type: 'text', text: `Error: File not found: ${args.filePath}`},
        ],
        status: 'failure',
      };
    }

    if (!stat.isFile()) {
      return {
        data: {message: `Not a file: ${args.filePath}`},
        content: [{type: 'text', text: `Error: Not a file: ${args.filePath}`}],
        status: 'failure',
      };
    }

    // 3. Detect media (image/PDF) via content sniffing; otherwise fall through.
    let detected: {ext: string; mime: string} | undefined;
    try {
      detected = await fileTypeFromFile(absolutePath);
    } catch {
      detected = undefined;
    }

    const imageType = detected
      ? imageMediaTypeSchema.safeParse(detected.mime)
      : undefined;
    const docType = detected
      ? documentMediaTypeSchema.safeParse(detected.mime)
      : undefined;

    if (imageType?.success || docType?.success) {
      if (stat.size > MAX_INLINE_MEDIA_BYTES) {
        const limitMb = MAX_INLINE_MEDIA_BYTES / 1024 / 1024;
        const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
        const message =
          `${args.filePath} is ${sizeMb} MB, over the ${limitMb} MB inline limit for media. ` +
          'Reduce it first with a shell command (for example, downsample/resize an image, ' +
          'or extract specific pages or text from a PDF) and read the smaller file.';
        return {
          data: {message},
          content: [{type: 'text', text: `Error: ${message}`}],
          status: 'failure',
        };
      }

      const base64 = (await fs.readFile(absolutePath)).toString('base64');
      context.fileStatTracker.set(absolutePath, stat.size, stat.mtimeMs);

      // Two narrowed branches so `mediaType` carries the exact literal type each block
      // requires (no re-parse, no non-null assertion).
      if (imageType?.success) {
        const mediaType = imageType.data;
        const data: ReadFileResult = {
          kind: 'image',
          filePath: args.filePath,
          mediaType,
          byteSize: stat.size,
        };
        return {
          data,
          content: [{type: 'image', mediaType, data: base64}],
          status: 'success',
        };
      }
      if (docType?.success) {
        const mediaType = docType.data;
        const data: ReadFileResult = {
          kind: 'document',
          filePath: args.filePath,
          mediaType,
          byteSize: stat.size,
        };
        return {
          data,
          content: [
            {
              type: 'document',
              mediaType,
              data: base64,
              name: path.basename(absolutePath),
            },
          ],
          status: 'success',
        };
      }
    }

    // Not media — reject other binaries (unchanged behavior).
    try {
      if (await isBinaryFile(absolutePath)) {
        return {
          data: {
            message: `Binary file detected: ${args.filePath}. Only text files are supported.`,
          },
          content: [
            {
              type: 'text',
              text: `Error: Binary file detected: ${args.filePath}. Only text files are supported.`,
            },
          ],
          status: 'failure',
        };
      }
    } catch {
      return {
        data: {
          message: `Unable to check if file is binary: ${args.filePath}`,
        },
        content: [
          {
            type: 'text',
            text: `Error: Unable to check if file is binary: ${args.filePath}`,
          },
        ],
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
          content: [
            {
              type: 'text',
              text:
                `Error: ${error.message}. ` +
                `Use startLine and lineCount to read a smaller portion.`,
            },
          ],
          status: 'failure',
        };
      }
      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {message},
        content: [{type: 'text', text: `Error: ${message}`}],
        status: 'failure',
      };
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
      kind: 'text',
      filePath: args.filePath,
      totalLines,
      startLine,
      endLine,
      content: selectedLines.join('\n'),
    };

    return {
      data,
      content: [{type: 'text', text: `${header}\n${formatted}`}],
      status: 'success',
    };
  },
};
