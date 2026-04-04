import {createReadStream} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import {Readable} from 'node:stream';

import type {AllowedPath} from '@/agent-core/tool/index.js';

const BINARY_DETECTION_SIZE = 8_192; // 8KB

/** Thrown when readLineRange exceeds the maxBytes limit. */
export class ReadSizeLimitError extends Error {
  constructor(maxBytes: number) {
    super(`Read result exceeds ${maxBytes} byte limit`);
    this.name = 'ReadSizeLimitError';
  }
}

/** Returns true if `child` is strictly inside `parent` (not equal to it). */
export function isSubPath(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  return resolvedChild.startsWith(resolvedParent + path.sep);
}

/** Returns true if `child` is `parent` itself or strictly inside it. */
export function isSubPathOrSelf(parent: string, child: string): boolean {
  return (
    path.resolve(parent) === path.resolve(child) || isSubPath(parent, child)
  );
}

export enum AccessCheckResult {
  OK = 'ok',
  OUTSIDE = 'outside',
  READ_ONLY = 'read_only',
}

/**
 * Checks if a resolved absolute path is accessible with the required mode.
 * workingDirectory is always read-write.
 */
export function checkAccess(
  workingDirectory: string,
  absolutePath: string,
  extraAllowedPaths: readonly AllowedPath[],
  requiredMode: 'read' | 'read-write',
): AccessCheckResult {
  if (isSubPath(workingDirectory, absolutePath)) {
    return AccessCheckResult.OK;
  }

  const matchedEntry = extraAllowedPaths.find((entry) =>
    isSubPath(entry.path, absolutePath),
  );

  if (!matchedEntry) {
    return AccessCheckResult.OUTSIDE;
  }

  if (requiredMode === 'read-write' && matchedEntry.mode === 'read') {
    return AccessCheckResult.READ_ONLY;
  }

  return AccessCheckResult.OK;
}

/** Returns true if the file contains null bytes in its first 8KB. */
export async function isBinaryFile(absolutePath: string): Promise<boolean> {
  const handle = await fs.open(absolutePath, 'r');
  try {
    const stat = await handle.stat();
    const buf = Buffer.alloc(Math.min(BINARY_DETECTION_SIZE, stat.size));
    if (buf.length === 0) return false;
    await handle.read(buf, 0, buf.length, 0);
    return buf.includes(0x00);
  } finally {
    await handle.close();
  }
}

/** Formats lines with right-aligned line numbers and tab separators. */
export function formatWithLineNumbers(
  lines: string[],
  startLine: number,
  totalLines: number,
): string {
  const width = String(totalLines).length;
  return lines
    .map((line, i) => `${String(startLine + i).padStart(width)}\t${line}`)
    .join('\n');
}

/** Creates a readline interface from a file path or in-memory content. */
function createLineReader(source: string | Buffer): readline.Interface {
  const input =
    typeof source === 'string'
      ? createReadStream(source, {encoding: 'utf-8'})
      : Readable.from(source);
  return readline.createInterface({input, crlfDelay: Infinity});
}

/** Counts total lines from a file path. */
export async function countLines(absolutePath: string): Promise<number>;
/** Counts total lines from in-memory content. */
export async function countLines(content: Buffer): Promise<number>;
export async function countLines(source: string | Buffer): Promise<number> {
  let count = 0;
  const rl = createLineReader(source);

  for await (const _line of rl) {
    count++;
  }

  return count;
}

/** Reads a specific line range from a file path. */
export async function readLineRange(
  absolutePath: string,
  startLine: number,
  lineCount: number | undefined,
  maxBytes: number,
): Promise<string[]>;
/** Reads a specific line range from in-memory content. */
export async function readLineRange(
  content: Buffer,
  startLine: number,
  lineCount: number | undefined,
  maxBytes: number,
): Promise<string[]>;
export async function readLineRange(
  source: string | Buffer,
  startLine: number,
  lineCount: number | undefined,
  maxBytes: number,
): Promise<string[]> {
  const selectedLines: string[] = [];
  const endLine =
    lineCount !== undefined ? startLine + lineCount - 1 : Infinity;
  let currentLine = 0;
  let totalBytes = 0;

  const rl = createLineReader(source);

  for await (const line of rl) {
    currentLine++;
    if (currentLine > endLine) break;
    if (currentLine >= startLine) {
      totalBytes += Buffer.byteLength(line) + 1; // +1 for newline
      if (totalBytes > maxBytes) {
        rl.close();
        throw new ReadSizeLimitError(maxBytes);
      }
      selectedLines.push(line);
    }
  }

  return selectedLines;
}
