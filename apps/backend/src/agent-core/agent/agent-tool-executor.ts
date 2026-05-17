import assert from 'node:assert';

import type {
  SseSubAgentEvent,
  SseTodoUpdateEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
} from '@omnicraft/sse-events';
import type {AnyToolResultData} from '@omnicraft/tool-schemas';

import type {AsyncChannel} from '@/helpers/async-channel.js';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {SkillDefinition} from '../skill/index.js';
import type {ToolDefinition} from '../tool/index.js';
import type {AgentRuntimeState} from './agent-runtime-state.js';
import type {SubagentRegistry} from './state/subagent-registry.js';

export type AgentToolSseEvent =
  | SseToolExecuteEndEvent
  | SseToolExecuteDeltaEvent
  | SseSubAgentEvent
  | SseTodoUpdateEvent;

export interface ExecuteAgentToolInput {
  readonly toolCall: LlmToolCall;
  readonly availableTools: ReadonlyMap<string, ToolDefinition>;
  readonly toolSseEventChannel: AsyncChannel<AgentToolSseEvent>;
  readonly runtimeState: AgentRuntimeState;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly subagents: SubagentRegistry;
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;
  readonly workingDirectory: string;
  readonly signal: AbortSignal;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
}

export interface ExecuteAgentToolResult {
  readonly content: string;
  readonly status: 'success' | 'failure' | 'error';
  readonly data: AnyToolResultData;
}

export class AgentToolExecutor {
  async execute(input: ExecuteAgentToolInput): Promise<ExecuteAgentToolResult> {
    const tool = input.availableTools.get(input.toolCall.toolName);
    assert(
      tool,
      `executeTool called with unknown tool: ${input.toolCall.toolName}`,
    );

    const onOutput = tool.suppressToolEvents
      ? undefined
      : (chunk: string) => {
          input.toolSseEventChannel.push({
            type: 'tool-execute-delta',
            callId: input.toolCall.callId,
            content: chunk,
          } satisfies SseToolExecuteDeltaEvent);
        };

    const context = input.runtimeState.buildToolExecutionContext({
      callId: input.toolCall.callId,
      agentId: input.agentId,
      sessionsDir: input.sessionsDir,
      subagents: input.subagents,
      availableSkills: input.availableSkills,
      workingDirectory: input.workingDirectory,
      signal: input.signal,
      onSubAgentEvent: (event) => {
        input.toolSseEventChannel.push(event);
      },
      getConfig: input.getConfig,
      getLightConfig: input.getLightConfig,
    });

    try {
      const parsedArgs: unknown = tool.parameters.parse(
        JSON.parse(input.toolCall.arguments),
      );
      const result = await tool.execute(parsedArgs, context, onOutput);
      return {
        content: result.content,
        status: result.status,
        data: result.data as AnyToolResultData,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {content: `Error: ${message}`, status: 'error', data: {message}};
    }
  }
}

export const agentToolExecutor = new AgentToolExecutor();
