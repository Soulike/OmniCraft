import path from 'node:path';

import {
  SubAgentType,
  subAgentTypeSchema,
  type ThinkingLevel,
  thinkingLevelSchema,
} from '@omnicraft/api-schema';
import {z} from 'zod';

import {ExploreSubAgent, GeneralSubAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {isSubPathOrSelf} from '@/helpers/path-helpers.js';

import {
  runSubagentTurn,
  type SubagentTurnResult,
} from './subagent-turn-runner.js';

interface SubAgentInfo {
  name: string;
  description: string;
}

const subAgentInfos = {
  [SubAgentType.GENERAL]: {
    name: 'General',
    description:
      'General-purpose agent for autonomous multi-step tasks. ' +
      'Use for delegated work that no specialized subagent type covers.',
  },
  [SubAgentType.EXPLORE]: {
    name: 'Explore',
    description:
      'Research-focused agent for repository research, architecture, module design, ' +
      'cross-file behavior, call chains, data flow, historical context, dependency mapping, ' +
      'and impact analysis. Provide the question, scope, constraints, and desired depth. ' +
      'Do not specify a report format unless the user asked for one.',
  },
} as const satisfies Record<SubAgentType, SubAgentInfo>;

function buildToolDescription(): string {
  const header =
    'Dispatches a subagent to handle a subtask autonomously. ' +
    'Subagents cannot dispatch further subagents. ' +
    'Use this when delegated work can proceed independently ' +
    'without blocking your immediate next local action. ' +
    'Keep very small local lookups local when dispatch overhead is not worth it. ' +
    'After the subagent returns, synthesize the subagent result for the user ' +
    'or use it to guide implementation.';

  const typeDescriptions = Object.entries(subAgentInfos)
    .map(([key, info]) => `- ${key} (${info.name}): ${info.description}`)
    .join('\n');

  return `${header}\n\nAvailable agent types:\n${typeDescriptions}`;
}

export function createSubAgent(
  agentType: SubAgentType,
  getConfig: () => Promise<LlmConfig>,
  workingDirectory: string,
  thinkingLevel: ThinkingLevel,
  sessionsDir?: string,
): Agent {
  switch (agentType) {
    case SubAgentType.GENERAL:
      return new GeneralSubAgent(
        getConfig,
        workingDirectory,
        thinkingLevel,
        sessionsDir,
      );
    case SubAgentType.EXPLORE:
      return new ExploreSubAgent(
        getConfig,
        workingDirectory,
        thinkingLevel,
        sessionsDir,
      );
  }
}

export function getSubagentSessionsDir(
  context: ToolExecutionContext,
): string | undefined {
  if (!context.sessionsDir) return undefined;
  return path.join(context.sessionsDir, context.agentId, 'subagents');
}

export function registerSubAgent(
  context: ToolExecutionContext,
  subagent: Agent,
  agentType: SubAgentType,
): void {
  context.subagentRegistry.register(subagent, agentType);
}

const parameters = z.object({
  task: z.string().min(1).describe('The task description for the subagent'),
  agentType: subAgentTypeSchema
    .optional()
    .describe(
      `Type of subagent to dispatch. Defaults to '${SubAgentType.GENERAL}'.`,
    ),
  model: z
    .enum(['default', 'light'])
    .optional()
    .describe(
      "Which model tier to use. 'default' uses the main model, 'light' uses the lightweight model. Defaults to 'default'. " +
        "Use 'light' for simple, well-defined subtasks " +
        'where speed matters more than reasoning depth.',
    ),
  workingDirectory: z
    .string()
    .optional()
    .describe(
      "Working directory for the subagent. Must be the parent agent's working directory itself or a subdirectory of it. " +
        "Relative paths are resolved against the parent agent's working directory; absolute paths must still resolve inside it. " +
        "Defaults to the parent agent's working directory. " +
        'Set this when the subtask operates in a specific subdirectory ' +
        'rather than the whole working directory.',
    ),
  thinkingLevel: thinkingLevelSchema
    .optional()
    .describe(
      "Controls extended thinking for the subagent ('none', 'low', 'medium', 'high', 'xhigh'). Defaults to 'none'. " +
        'Increase this for subtasks that require multi-step reasoning, complex analysis, ' +
        'or planning before acting.',
    ),
});

/** Tool that dispatches a subagent to handle a subtask autonomously. */
export const dispatchAgentTool: ToolDefinition<
  typeof parameters,
  SubagentTurnResult
> = {
  name: 'dispatch_agent',
  displayName: 'Dispatch Agent',
  description: buildToolDescription(),
  parameters,
  suppressToolEvents: true,
  compactResult({content}) {
    return content.trim() || null;
  },
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<SubagentTurnResult>> {
    const {
      task,
      agentType = SubAgentType.GENERAL,
      model = 'default',
      thinkingLevel = 'none',
    } = args;

    // Resolve working directory (relative paths resolved against parent's cwd).
    let workingDirectory = context.workingDirectory;
    if (args.workingDirectory) {
      workingDirectory = path.resolve(
        context.workingDirectory,
        args.workingDirectory,
      );
      if (!isSubPathOrSelf(context.workingDirectory, workingDirectory)) {
        const message =
          `working directory "${workingDirectory}" is outside the parent agent's working directory ` +
          `"${context.workingDirectory}"`;
        return {
          data: {message},
          content: `Error: ${message}`,
          status: 'failure',
        };
      }
    }

    // Build config for the subagent — inherit from the parent agent
    const getConfig =
      model === 'light' ? context.getLightConfig : context.getConfig;

    // Create subagent
    const subagentSessionsDir = getSubagentSessionsDir(context);
    const subagent = createSubAgent(
      agentType,
      getConfig,
      workingDirectory,
      thinkingLevel,
      subagentSessionsDir,
    );

    return runSubagentTurn({
      context,
      subagent,
      task,
      startEvent: {
        type: 'subagent-dispatch',
        agentId: subagent.id,
        task,
        agentType,
        thinkingLevel,
        workingDirectory,
      },
      // Register after dispatching the task so the registry does not briefly
      // treat a newly created subagent as idle on the normal dispatch path.
      onTurnStarted: () => {
        registerSubAgent(context, subagent, agentType);
      },
    });
  },
};
