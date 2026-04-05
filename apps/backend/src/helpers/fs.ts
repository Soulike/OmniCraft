import crypto from 'node:crypto';
import type {WriteStream} from 'node:fs';
import {createWriteStream} from 'node:fs';
import {access, stat} from 'node:fs/promises';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

/** Checks whether a file exists at the given path. */
export async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

export type DirectoryAccessError =
  | 'not_found'
  | 'not_directory'
  | 'not_accessible';

/**
 * Checks whether a path is an accessible directory with the required permissions.
 * Returns null if accessible, or a specific error.
 * @param dirPath - Absolute path to check.
 * @param flags - Bitwise OR of `fs.constants.R_OK`, `fs.constants.W_OK`, etc.
 */
export async function checkDirectoryAccess(
  dirPath: string,
  flags: number,
): Promise<DirectoryAccessError | null> {
  let dirStat;
  try {
    dirStat = await stat(dirPath);
  } catch {
    return 'not_found';
  }
  if (!dirStat.isDirectory()) return 'not_directory';
  try {
    await access(dirPath, flags);
  } catch {
    return 'not_accessible';
  }
  return null;
}

/** Writes content to a temporary file in os.tmpdir() and returns the absolute path. */
export async function writeToTempFile(
  content: string,
  extension: string,
): Promise<string> {
  const filePath = path.join(os.tmpdir(), `${crypto.randomUUID()}${extension}`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** Creates a writable stream to a new temporary file in os.tmpdir(). */
export function createTempFileWriteStream(extension: string): {
  filePath: string;
  stream: WriteStream;
} {
  const filePath = path.join(os.tmpdir(), `${crypto.randomUUID()}${extension}`);
  return {filePath, stream: createWriteStream(filePath, 'utf-8')};
}
