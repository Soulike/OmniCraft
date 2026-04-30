import crypto from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {z} from 'zod';

import {agentTypeSchema} from './subagent-types.js';

export const subagentMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  agentType: agentTypeSchema,
  createdAt: z.number(),
  resumedFromSubagentId: z.string().optional(),
});

export type SubagentMetadata = z.infer<typeof subagentMetadataSchema>;

function assertSafeSubagentId(subagentId: string): void {
  if (
    subagentId === '' ||
    subagentId === '.' ||
    subagentId === '..' ||
    path.isAbsolute(subagentId) ||
    subagentId.includes('/') ||
    subagentId.includes('\\')
  ) {
    throw new Error(`Invalid subagent id: ${subagentId}`);
  }
}

export function subagentMetadataPath(
  subagentSessionsDir: string,
  subagentId: string,
): string {
  assertSafeSubagentId(subagentId);
  return path.join(subagentSessionsDir, subagentId, 'subagent.json');
}

export async function loadSubagentMetadata(
  subagentSessionsDir: string,
  subagentId: string,
): Promise<SubagentMetadata> {
  const content = await readFile(
    subagentMetadataPath(subagentSessionsDir, subagentId),
    'utf-8',
  );
  const metadata = subagentMetadataSchema.parse(JSON.parse(content));
  if (metadata.id !== subagentId) {
    throw new Error(
      `Subagent metadata id mismatch: expected ${subagentId}, got ${metadata.id}`,
    );
  }
  return metadata;
}

export async function persistSubagentMetadata(
  subagentSessionsDir: string,
  subagentId: string,
  metadata: SubagentMetadata,
): Promise<void> {
  if (metadata.id !== subagentId) {
    throw new Error(
      `Subagent metadata id mismatch: expected ${subagentId}, got ${metadata.id}`,
    );
  }

  const filePath = subagentMetadataPath(subagentSessionsDir, subagentId);
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await mkdir(path.dirname(filePath), {recursive: true});
  await writeFile(tmpPath, JSON.stringify(metadata, null, 2) + '\n');
  await rename(tmpPath, filePath);
}
