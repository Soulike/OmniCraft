import crypto from 'node:crypto';
import {mkdir, readFile, rename, writeFile} from 'node:fs/promises';
import path from 'node:path';

import {sseEventSchema} from '@omnicraft/sse-events';
import {z} from 'zod';

import {
  agentPersistence,
  type AgentSnapshot,
} from '@/agent-core/agent/index.js';
import {isFileNotFoundError} from '@/helpers/fs.js';

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

export function createResumedSubagentSnapshot(
  source: AgentSnapshot,
  newAgentId: string,
  newLlmSessionId: string,
): AgentSnapshot {
  return {
    ...source,
    id: newAgentId,
    llmSession: {
      ...source.llmSession,
      id: newLlmSessionId,
      messages: source.llmSession.messages,
    },
  };
}

export async function copySubagentSseEvents(params: {
  sourceSessionsDir: string;
  sourceSnapshot: AgentSnapshot;
  targetSessionsDir: string;
  targetId: string;
}): Promise<void> {
  assertSafeSubagentId(params.sourceSnapshot.id);
  assertSafeSubagentId(params.targetId);

  const expectedCount = params.sourceSnapshot.sseEventCount;
  if (expectedCount === 0) return;

  const sourcePath = agentPersistence.eventsPath(
    params.sourceSessionsDir,
    params.sourceSnapshot.id,
  );
  const targetPath = agentPersistence.eventsPath(
    params.targetSessionsDir,
    params.targetId,
  );

  let content: string;
  try {
    content = await readFile(sourcePath, 'utf-8');
  } catch (error: unknown) {
    if (isFileNotFoundError(error)) {
      throw new Error(
        `Cannot resume subagent ${params.sourceSnapshot.id}: expected ${expectedCount.toString()} SSE events but source event log is missing`,
        {cause: error},
      );
    }
    throw error;
  }

  const validLines: string[] = [];
  for (const line of content.split('\n')) {
    if (line === '') continue;
    if (validLines.length >= expectedCount) break;
    try {
      sseEventSchema.parse(JSON.parse(line));
      validLines.push(line);
    } catch {
      break;
    }
  }

  if (validLines.length !== expectedCount) {
    throw new Error(
      `Cannot resume subagent ${params.sourceSnapshot.id}: expected ${expectedCount.toString()} SSE events but copied ${validLines.length.toString()}`,
    );
  }

  await mkdir(path.dirname(targetPath), {recursive: true});
  await writeFile(targetPath, validLines.map((line) => line + '\n').join(''));
}

export interface PreparedResumedSubagentState {
  snapshot: AgentSnapshot;
  metadata: SubagentMetadata;
  subagentSseEventStartIndex: number;
}

export async function prepareResumedSubagentState(params: {
  subagentSessionsDir: string;
  sourceSubagentId: string;
}): Promise<PreparedResumedSubagentState> {
  const sourceMetadata = await loadSubagentMetadata(
    params.subagentSessionsDir,
    params.sourceSubagentId,
  );
  const sourceSnapshot = await agentPersistence.loadSnapshot(
    params.subagentSessionsDir,
    params.sourceSubagentId,
  );
  if (sourceSnapshot.id !== params.sourceSubagentId) {
    throw new Error(
      `Subagent snapshot id mismatch: expected ${params.sourceSubagentId}, got ${sourceSnapshot.id}`,
    );
  }

  const newSubagentId = crypto.randomUUID();
  const newLlmSessionId = crypto.randomUUID();

  await copySubagentSseEvents({
    sourceSessionsDir: params.subagentSessionsDir,
    sourceSnapshot,
    targetSessionsDir: params.subagentSessionsDir,
    targetId: newSubagentId,
  });

  const snapshot = createResumedSubagentSnapshot(
    sourceSnapshot,
    newSubagentId,
    newLlmSessionId,
  );
  const metadata: SubagentMetadata = {
    schemaVersion: 1,
    id: newSubagentId,
    agentType: sourceMetadata.agentType,
    createdAt: Date.now(),
    resumedFromSubagentId: params.sourceSubagentId,
  };

  agentPersistence.persistSnapshot(
    params.subagentSessionsDir,
    newSubagentId,
    snapshot,
    {sync: true},
  );
  await persistSubagentMetadata(
    params.subagentSessionsDir,
    newSubagentId,
    metadata,
  );

  return {
    snapshot,
    metadata,
    subagentSseEventStartIndex: sourceSnapshot.sseEventCount,
  };
}
