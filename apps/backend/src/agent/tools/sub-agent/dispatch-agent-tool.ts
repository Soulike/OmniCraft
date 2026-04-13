import path from 'node:path';

import {thinkingLevelSchema} from '@omnicraft/api-schema';
import type {SseBaseEvent} from '@omnicraft/sse-events';
import {z} from 'zod';

import {CodingSubAgent, GeneralSubAgent} from '@/agent/agents/index.js';
import type {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {AccessCheckResult, checkAccess} from '@/helpers/path-access.js';
import {settingsService} from '@/services/settings/index.js';

interface SubAgentInfo {
  name: string;
  description: string;
}

const subAgentInfos = {
  general: {
    name: 'General',
    description:
      'General-purpose agent for autonomous multi-step tasks. ' +
      'Use for any work that no other specialized subagent can handle.',
  },
  coding: {
    name: 'Coding',
    description:
      'Coding agent powered by Claude Code for autonomous software engineering tasks. ' +
      'Excels at code reading, writing, debugging, and refactoring.',
  },
} as const satisfies Record<string, SubAgentInfo>;

type SubAgentType = keyof typeof subAgentInfos;

const agentTypeSchema = z.enum(
  Object.keys(subAgentInfos) as [SubAgentType, ...SubAgentType[]],
);

function buildToolDescription(): string {
  const header =
    'Dispatches a subagent to handle a subtask autonomously. ' +
    'Subagents cannot dispatch further subagents. ' +
    'Use this when a task can be delegated and worked on independently.';

  const typeDescriptions = Object.entries(subAgentInfos)
    .map(([key, info]) => `- ${key} (${info.name}): ${info.description}`)
    .join('\n');

  return `${header}\n\nAvailable agent types:\n${typeDescriptions}`;
}

const parameters = z.object({
  task: z.string().min(1).describe('The task description for the subagent'),
  agentType: agentTypeSchema
    .optional()
    .describe("Type of subagent to dispatch. Defaults to 'general'."),
  model: z
    .enum(['default', 'light'])
    .optional()
    .describe(
      "Which model tier to use. 'default' uses the main model, 'light' uses the lightweight model. Defaults to 'default'.",
    ),
  workingDirectory: z
    .string()
    .optional()
    .describe(
      "Working directory for the subagent. Must be within allowed paths. Defaults to the parent agent's working directory.",
    ),
  thinkingLevel: thinkingLevelSchema
    .optional()
    .describe(
      "Controls extended thinking for the subagent. Defaults to 'none'.",
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
  async execute(
    args: z.infer<typeof parameters>,
    context: ToolExecutionContext,
  ): Promise<ToolExecuteResult<DispatchAgentResult>> {
    const {
      task,
      agentType = 'general',
      model = 'default',
      thinkingLevel = 'none',
    } = args;

    // Validate and resolve working directory
    let workingDirectory = context.workingDirectory;
    if (args.workingDirectory) {
      const resolved = path.resolve(
        context.workingDirectory,
        args.workingDirectory,
      );
      const accessResult = checkAccess(
        resolved,
        'read-write',
        context.workingDirectory,
        context.extraAllowedPaths,
      );
      if (accessResult !== AccessCheckResult.OK) {
        return {
          data: {
            message: `working directory "${resolved}" is not in allowed paths`,
          },
          content: `Error: working directory "${resolved}" is not in allowed paths`,
          status: 'failure',
        };
      }
      workingDirectory = resolved;
    }

    // Build config for the subagent
    const settings = await settingsService.getAll();
    const {
      apiFormat,
      apiKey,
      baseUrl,
      model: mainModel,
      lightModel,
    } = settings.llm;
    const selectedModel =
      model === 'light' ? lightModel || mainModel : mainModel;
    const getConfig = (): Promise<LlmConfig> =>
      Promise.resolve({
        apiFormat,
        apiKey,
        baseUrl,
        model: selectedModel,
      });

    // Create subagent
    let subagent: Agent;
    switch (agentType) {
      case 'general':
        subagent = new GeneralSubAgent(
          getConfig,
          workingDirectory,
          context.extraAllowedPaths,
        );
        break;
      case 'coding':
        subagent = new CodingSubAgent(
          workingDirectory,
          context.extraAllowedPaths,
        );
        break;
    }

    context.onSubAgentEvent({
      type: 'subagent-dispatch',
      agentId: subagent.id,
      task,
      agentType,
      thinkingLevel,
      workingDirectory,
    });

    try {
      const eventStream = subagent.handleUserMessage(
        task,
        thinkingLevel,
        context.signal,
      );

      let lastReplyText = '';
      for await (const event of eventStream) {
        // Subagents cannot emit subagent events (no SubAgentToolRegistry),
        // so all events are base events. Cast is safe by construction.
        context.onSubAgentEvent({
          type: 'subagent-output',
          agentId: subagent.id,
          event: event as SseBaseEvent,
        });

        if (event.type === 'message-start' && event.role === 'assistant') {
          lastReplyText = '';
        }
        if (event.type === 'text-delta') {
          lastReplyText += event.content;
        }
      }

      context.onSubAgentEvent({
        type: 'subagent-complete',
        agentId: subagent.id,
        status: 'success',
      });

      const summary =
        lastReplyText ||
        'Subagent completed the task but produced no text summary.';
      return {
        data: {summary},
        content: summary,
        status: 'success',
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
    }
  },
};
