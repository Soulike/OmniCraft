import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {createSubAgent, getSubagentSessionsDir} from './dispatch-agent-tool.js';
import {prepareResumedSubagentState} from './subagent-history.js';
import {runSubagentTurn} from './subagent-runner.js';
import type {DispatchAgentResult} from './subagent-types.js';

const parameters = z
  .object({
    subagentId: z.string().min(1).describe('The subagent ID to resume.'),
    task: z
      .string()
      .min(1)
      .describe('The follow-up task to continue the subagent.'),
    model: z
      .enum(['default', 'light'])
      .optional()
      .describe(
        "Which model tier to use. 'default' uses the main model, 'light' uses the lightweight model. Defaults to 'default'. " +
          "Use 'light' for simple, well-defined follow-up tasks where speed matters more than reasoning depth.",
      ),
  })
  .strict();

export interface ResumeSubagentToolDeps {
  readonly createSubAgent: typeof createSubAgent;
  readonly getSubagentSessionsDir: typeof getSubagentSessionsDir;
  readonly prepareResumedSubagentState: typeof prepareResumedSubagentState;
  readonly runSubagentTurn: typeof runSubagentTurn;
}

const defaultDeps: ResumeSubagentToolDeps = {
  createSubAgent,
  getSubagentSessionsDir,
  prepareResumedSubagentState,
  runSubagentTurn,
};

export function createResumeSubagentTool(
  deps: ResumeSubagentToolDeps = defaultDeps,
): ToolDefinition<typeof parameters, DispatchAgentResult> {
  return {
    name: 'resume_subagent',
    displayName: 'Resume Subagent',
    description:
      'Resumes a previous persisted subagent by ID and sends it a follow-up task. ' +
      'Use the returned subagent ID for any later resume of the continued work.',
    parameters,
    suppressToolEvents: true,
    async execute(
      args: z.infer<typeof parameters>,
      context: ToolExecutionContext,
    ): Promise<ToolExecuteResult<DispatchAgentResult>> {
      const subagentSessionsDir = deps.getSubagentSessionsDir(context);
      if (!subagentSessionsDir) {
        const message =
          'Cannot resume subagent because persisted history is unavailable.';
        return {
          data: {message},
          content: `Error: ${message}`,
          status: 'failure',
        };
      }

      const getConfig =
        args.model === 'light' ? context.getLightConfig : context.getConfig;

      let preparedSubagentId: string | undefined;
      try {
        const {snapshot, metadata, subagentSseEventStartIndex} =
          await deps.prepareResumedSubagentState({
            subagentSessionsDir,
            sourceSubagentId: args.subagentId,
          });
        preparedSubagentId = metadata.id;
        const workingDirectory =
          snapshot.options.workingDirectory ?? context.workingDirectory;
        const thinkingLevel = snapshot.options.thinkingLevel;
        const subagent = deps.createSubAgent(
          metadata.agentType,
          getConfig,
          workingDirectory,
          thinkingLevel,
          subagentSessionsDir,
          snapshot,
        );

        return await deps.runSubagentTurn({
          subagent,
          task: args.task,
          agentType: metadata.agentType,
          thinkingLevel,
          workingDirectory,
          context,
          subagentSseEventStartIndex,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const errorMessage = preparedSubagentId
          ? `Resume subagent error for prepared subagent ${preparedSubagentId}: ${message}`
          : `Resume subagent error: ${message}`;
        return {
          data: {message: errorMessage},
          content: `Error: ${errorMessage}`,
          status: 'failure',
        };
      }
    },
  };
}

export const resumeSubagentTool: ToolDefinition<
  typeof parameters,
  DispatchAgentResult
> = createResumeSubagentTool();
