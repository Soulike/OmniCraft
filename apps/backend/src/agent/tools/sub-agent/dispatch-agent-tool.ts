import path from 'node:path';

import {
  SubAgentType,
  subAgentTypeSchema,
  type ThinkingLevel,
  thinkingLevelSchema,
} from '@omnicraft/api-schema';
import {
  sseBaseEventSchema,
  type SseEvent,
  type SseSubagentOutputEvent,
} from '@omnicraft/sse-events';
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

export function buildSubagentOutputEvent(
  agentId: string,
  event: SseEvent,
): SseSubagentOutputEvent {
  const baseEvent = sseBaseEventSchema.parse(event);
  return {
    type: 'subagent-output',
    agentId,
    event: baseEvent,
  };
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

interface DispatchAgentResult {
  summary: string;
}

/** Tool that dispatches a subagent to handle a subtask autonomously. */
export const dispatchAgentTool: ToolDefinition<
  typeof parameters,
  DispatchAgentResult
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
  ): Promise<ToolExecuteResult<DispatchAgentResult>> {
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

    // Link parent abort signal to subagent
    const onAbort = () => {
      subagent.abort();
    };
    context.signal.addEventListener('abort', onAbort, {once: true});

    context.onSubAgentEvent({
      type: 'subagent-dispatch',
      agentId: subagent.id,
      task,
      agentType,
      thinkingLevel,
      workingDirectory,
    });

    try {
      let lastReplyText = '';
      let completed = false;
      let failureMessage: string | null = null;
      const eventIter = subagent.subscribe({signal: context.signal});

      subagent.handleUserMessage(task);
      registerSubAgent(context, subagent, agentType);

      for await (const entry of eventIter) {
        const {event} = entry;
        context.onSubAgentEvent(buildSubagentOutputEvent(subagent.id, event));

        if (event.type === 'message-start' && event.role === 'assistant') {
          lastReplyText = '';
        }
        if (event.type === 'text-delta') {
          lastReplyText += event.content;
        }
        if (event.type === 'error') {
          failureMessage = event.message;
          break;
        }
        // Subagent's sseLog is never sealed — break on done to end iteration.
        // If the parent aborts, the reader ends silently (no done seen).
        if (event.type === 'done') {
          completed = true;
          break;
        }
      }

      context.onSubAgentEvent({
        type: 'subagent-complete',
        agentId: subagent.id,
        status: completed ? 'success' : 'failure',
      });

      if (completed) {
        const summary =
          lastReplyText ||
          'Subagent completed the task but produced no text summary.';
        return {
          data: {summary},
          content: summary,
          status: 'success',
        };
      }

      if (failureMessage) {
        return {
          data: {message: `Subagent error: ${failureMessage}`},
          content: `Subagent error: ${failureMessage}`,
          status: 'failure',
        };
      }

      return {
        data: {message: 'Subagent was aborted'},
        content: 'Subagent was aborted.',
        status: 'failure',
      };
    } catch (error: unknown) {
      context.onSubAgentEvent({
        type: 'subagent-complete',
        agentId: subagent.id,
        status: 'failure',
      });

      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {message: `Subagent error: ${message}`},
        content: `Subagent error: ${message}`,
        status: 'failure',
      };
    } finally {
      context.signal.removeEventListener('abort', onAbort);
    }
  },
};
