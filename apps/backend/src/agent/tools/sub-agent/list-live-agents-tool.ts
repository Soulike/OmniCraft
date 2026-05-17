import type {SubAgentType} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

interface ListedLiveAgent {
  id: string;
  agentType: SubAgentType;
  title: string;
  isRunning: boolean;
}

interface ListLiveAgentsResult {
  agents: ListedLiveAgent[];
}

const parameters = z.object({});

function formatListLiveAgentsContent(
  agents: readonly ListedLiveAgent[],
): string {
  if (agents.length === 0) {
    return 'No live subagents are available to continue.';
  }

  return agents
    .map((agent) => {
      const status = agent.isRunning ? 'running' : 'idle';
      return `- ${agent.title} (${agent.agentType}, ${status})\n  id: ${agent.id}`;
    })
    .join('\n');
}

export const listLiveAgentsTool: ToolDefinition<
  typeof parameters,
  ListLiveAgentsResult
> = {
  name: 'list_live_agents',
  displayName: 'List Live Agents',
  description:
    'Lists live subagents still available in the current runtime. ' +
    'Use this when you need to identify a subagent that can be continued.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  execute(
    _args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): ToolExecuteResult<ListLiveAgentsResult> {
    const agents = context.subagentRegistry.list();

    return {
      data: {agents},
      content: formatListLiveAgentsContent(agents),
      status: 'success',
    };
  },
};
