import crypto from 'node:crypto';
import {readdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {getDataDir} from '@/helpers/env.js';
import {isFileNotFoundError} from '@/helpers/fs.js';
import {logger} from '@/logger.js';

interface ConversionResult {
  changed: boolean;
  value: unknown;
}

/** Rewrites string tool-message content to a single text block. Pure + idempotent. */
export function convertSnapshotJson(json: unknown): ConversionResult {
  if (typeof json !== 'object' || json === null || !('messages' in json)) {
    return {changed: false, value: json};
  }
  const snapshot = json as {messages: unknown[]};
  if (!Array.isArray(snapshot.messages)) return {changed: false, value: json};

  let changed = false;
  const messages = snapshot.messages.map((message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as {role?: unknown}).role === 'tool' &&
      typeof (message as {content?: unknown}).content === 'string'
    ) {
      changed = true;
      const m = message as {content: string};
      return {...message, content: [{type: 'text', text: m.content}]};
    }
    return message;
  });

  return changed
    ? {changed, value: {...snapshot, messages}}
    : {changed: false, value: json};
}

async function convertFile(filePath: string): Promise<boolean> {
  const raw = await readFile(filePath, 'utf-8');
  const {changed, value} = convertSnapshotJson(JSON.parse(raw));
  if (!changed) return false;
  const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, filePath);
  return true;
}

/** Walks a sessions root, converting each session's `snapshot.json` in place. */
export async function convertRoot(root: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(root, {withFileTypes: true});
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const snapshot = path.join(root, entry.name, 'snapshot.json');
    try {
      if (await convertFile(snapshot)) count++;
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) {
        logger.debug({snapshot}, 'No snapshot.json for session, skipping');
        continue;
      }
      logger.warn(
        {err: error, snapshot},
        'Skipping snapshot that could not be converted',
      );
    }
  }
  return count;
}

async function main(): Promise<void> {
  const dataDir = getDataDir();
  const roots = [
    path.join(dataDir, 'sessions'),
    path.join(dataDir, 'coding-sessions'),
  ];
  let total = 0;
  for (const root of roots) {
    total += await convertRoot(root);
  }
  logger.info({total}, 'Converted tool-result content in snapshots');
}

// Run when executed directly (tsx scripts/convert-tool-result-content.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
