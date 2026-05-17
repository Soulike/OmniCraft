import {readFile} from 'node:fs/promises';

import {sessionMetadataSchema, type SubAgentType} from '@omnicraft/api-schema';
import {z} from 'zod';

import {agentPersistence} from '@/agent-core/agent/index.js';
import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {logger} from '@/logger.js';

import {getSubagentSessionsDir} from './dispatch-agent-tool.js';

interface ListedAgent {
  id: string;
  agentType: SubAgentType;
  title: string;
}

interface ListAgentsResult {
  agents: ListedAgent[];
}

const parameters = z.object({});

async function readTitleFromMetadata(
  subagentSessionsDir: string,
  id: string,
): Promise<string | null> {
  try {
    const content = await readFile(
      agentPersistence.metadataPath(subagentSessionsDir, id),
      'utf-8',
    );
    const parsed: unknown = JSON.parse(content);
    return sessionMetadataSchema.parse(parsed).title;
  } catch {
    return null;
  }
}

async function readTitleFromSnapshot(
  subagentSessionsDir: string,
  id: string,
): Promise<string | null> {
  try {
    return (await agentPersistence.loadSnapshot(subagentSessionsDir, id)).title;
  } catch {
    return null;
  }
}

async function readSubagentTitle(
  subagentSessionsDir: string,
  id: string,
): Promise<string | null> {
  return (
    (await readTitleFromMetadata(subagentSessionsDir, id)) ??
    (await readTitleFromSnapshot(subagentSessionsDir, id))
  );
}

function formatListAgentsContent(agents: readonly ListedAgent[]): string {
  if (agents.length === 0) return 'No subagents have been dispatched.';

  return agents
    .map((agent) => `- ${agent.title} (${agent.agentType})\n  id: ${agent.id}`)
    .join('\n');
}

export const listAgentsTool: ToolDefinition<
  typeof parameters,
  ListAgentsResult
> = {
  name: 'list_agents',
  displayName: 'List Agents',
  description:
    'Lists subagents dispatched by the current agent. ' +
    'Use this when you need to identify an existing subagent by id.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  async execute(
    _args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<ListAgentsResult>> {
    const records = context.subagentRegistry.list();
    const subagentSessionsDir = getSubagentSessionsDir(context);
    const agentsOrNull = await Promise.all(
      records.map(async (record): Promise<ListedAgent | null> => {
        if (!subagentSessionsDir) {
          logger.warn(
            {agentId: record.id},
            'Skipping subagent without persistence directory',
          );
          return null;
        }

        const title = await readSubagentTitle(subagentSessionsDir, record.id);
        if (!title) {
          logger.warn(
            {agentId: record.id},
            'Skipping subagent with unreadable persisted title',
          );
          return null;
        }

        return {id: record.id, agentType: record.agentType, title};
      }),
    );
    const agents = agentsOrNull.filter(
      (agent): agent is ListedAgent => agent !== null,
    );

    return {
      data: {agents},
      content: formatListAgentsContent(agents),
      status: 'success',
    };
  },
};
