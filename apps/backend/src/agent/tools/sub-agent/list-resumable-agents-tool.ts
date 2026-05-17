import type {SubAgentType} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

interface ListedResumableAgent {
  id: string;
  agentType: SubAgentType;
  title: string;
  isRunning: boolean;
}

interface ListResumableAgentsResult {
  agents: ListedResumableAgent[];
}

const parameters = z.object({});

function formatListResumableAgentsContent(
  agents: readonly ListedResumableAgent[],
): string {
  if (agents.length === 0) {
    return 'No subagents are available to resume.';
  }

  return agents
    .map((agent) => {
      const status = agent.isRunning ? 'running' : 'idle';
      return `- ${agent.title} (${agent.agentType}, ${status})\n  id: ${agent.id}`;
    })
    .join('\n');
}

export const listResumableAgentsTool: ToolDefinition<
  typeof parameters,
  ListResumableAgentsResult
> = {
  name: 'list_resumable_agents',
  displayName: 'List Resumable Agents',
  description:
    'Lists subagents that can be resumed. ' +
    'Use this when you need to identify a subagent to resume.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  execute(
    _args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): ToolExecuteResult<ListResumableAgentsResult> {
    const agents = context.subagentRegistry.list();

    return {
      data: {agents},
      content: formatListResumableAgentsContent(agents),
      status: 'success',
    };
  },
};
