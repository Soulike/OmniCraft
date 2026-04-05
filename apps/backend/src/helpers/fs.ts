import crypto from 'node:crypto';
import type {WriteStream} from 'node:fs';
import {createWriteStream} from 'node:fs';
import {access} from 'node:fs/promises';
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
