import fs from 'node:fs/promises';
import path from 'node:path';

const BINARY_DETECTION_SIZE = 8_192; // 8KB

/** Returns true if `child` is strictly inside `parent` (not equal to it). */
export function isSubPath(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  return resolvedChild.startsWith(resolvedParent + path.sep);
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
