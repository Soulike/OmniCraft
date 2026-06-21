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
  name: z
    .string()
    .describe(
      'Name of the subagent to resume, exactly as returned when it was ' +
        'dispatched, with no surrounding whitespace. ' +
        'Use this to send a previously dispatched subagent more work.',
    ),
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
  description:
    'Resumes a subagent by sending it a follow-up task. ' +
    'The result includes the subagent name so it can be sent further work ' +
    'later without a separate lookup.',
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<SubagentTurnResult>> {
    // Reject malformed names instead of silently normalizing them, so the
    // model gets feedback that it passed the wrong format rather than a
    // confusing "not available to resume".
    if (args.name !== args.name.trim() || args.name === '') {
      return failure(
        `Invalid subagent name "${args.name}": it must be a non-empty name ` +
          'with no surrounding whitespace, exactly as returned when the ' +
          'subagent was dispatched. Check the name and try again.',
      );
    }

    const handle = context.subagentRegistry.getByNickname(args.name);
    if (!handle) {
      return failure(
        `Subagent "${args.name}" is not available to resume. ` +
          'Dispatch a new subagent if needed.',
      );
    }

    return runSubagentTurn({
      context,
      subagent: handle.agent,
      nickname: handle.nickname,
      startEvent: {
        type: 'subagent-resume',
        agentId: handle.agent.id,
        nickname: handle.nickname,
        task: args.task,
        agentType: handle.agentType,
        thinkingLevel: handle.thinkingLevel,
        workingDirectory: handle.agent.getWorkingDirectory(),
      },
      startTurn: () => handle.agent.tryStartUserTurn(args.task),
    });
  },
};
