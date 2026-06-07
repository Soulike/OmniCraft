import {agentIdSchema} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteFailureResult,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  runSubagentTurn,
  type SubagentTurnResult,
} from './subagent-turn-runner.js';

const parameters = z.object({
  agentId: z.string().min(1).describe('Subagent id to resume.'),
  task: z.string().min(1).describe('Follow-up task for the subagent.'),
});

function failure(message: string): ToolExecuteFailureResult {
  return {data: {message}, content: message, status: 'failure'};
}

/** Tool that resumes an idle live subagent with a follow-up task. */
export const resumeAgentTool: ToolDefinition<
  typeof parameters,
  SubagentTurnResult
> = {
  name: 'resume_agent',
  displayName: 'Resume Agent',
  description: 'Resumes a subagent by sending it a follow-up task.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<SubagentTurnResult>> {
    const parsedAgentId = agentIdSchema.safeParse(args.agentId);
    if (!parsedAgentId.success) {
      return failure(
        `Invalid subagent id "${args.agentId}"; id must be a UUID.`,
      );
    }

    const agentId = parsedAgentId.data;
    const handle = context.subagentRegistry.get(agentId);
    if (!handle) {
      return failure(
        `Subagent ${agentId} is not available to resume. Dispatch a new subagent if needed.`,
      );
    }

    return runSubagentTurn({
      context,
      subagent: handle.agent,
      startEvent: {
        type: 'subagent-resume',
        agentId: handle.agent.id,
        task: args.task,
        agentType: handle.agentType,
        thinkingLevel: handle.agent.getThinkingLevel(),
        workingDirectory: handle.agent.getWorkingDirectory(),
      },
      startTurn: () => handle.agent.tryStartUserTurn(args.task),
    });
  },
};
