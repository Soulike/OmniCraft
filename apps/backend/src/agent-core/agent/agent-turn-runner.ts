import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseTodoUpdateEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';
import type {ToolName} from '@omnicraft/tool-schemas';

import {AsyncChannel} from '@/helpers/async-channel.js';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {LlmSession, ToolResult} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {ToolDefinition, ToolRegistry} from '../tool/index.js';
import {agentLlmStreamTranslator} from './agent-llm-stream-translator.js';
import type {AgentRuntimeState} from './agent-runtime-state.js';
import {
  agentToolExecutor,
  type AgentToolSseEvent,
} from './agent-tool-executor.js';
import {agentUsageReporter} from './agent-usage-reporter.js';
import {
  buildAvailableSkills,
  buildAvailableTools,
  buildSystemPrompt,
} from './catalog/agent-catalog.js';
import type {SubagentRegistry} from './state/subagent-registry.js';
import type {AgentEventStream} from './types.js';

export interface RunAgentTurnInput {
  readonly userMessage: string;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly subagentRegistry: SubagentRegistry;
  readonly workingDirectory: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly signal: AbortSignal;
  readonly llmSession: LlmSession;
  readonly runtimeState: AgentRuntimeState;
  readonly toolRegistries: readonly ToolRegistry[];
  readonly skillRegistries: readonly SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly compactAfterTurn: (
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
  ) => Promise<void>;
}

export class AgentTurnRunner {
  async *run(input: RunAgentTurnInput): AgentEventStream {
    const inFlightToolCalls = new Set<string>();
    const maxRounds = await input.getMaxToolRounds();

    const availableTools = buildAvailableTools(
      input.toolRegistries,
      input.skillRegistries,
    );
    const availableSkills = buildAvailableSkills(input.skillRegistries);
    const toolDefs = [...availableTools.values()];
    const systemPrompt = buildSystemPrompt(
      input.baseSystemPrompt,
      input.toolRegistries,
      input.skillRegistries,
      input.workingDirectory,
    );

    const {
      stream: userStream,
      messageId,
      createdAt,
    } = input.llmSession.sendUserMessage(
      input.userMessage,
      toolDefs,
      systemPrompt,
      input.thinkingLevel,
      input.signal,
    );

    yield {
      type: 'message-start',
      role: 'user',
      messageId,
      createdAt,
      content: input.userMessage,
    } satisfies SseMessageStartEvent;

    let toolCalls: LlmToolCall[];
    try {
      toolCalls = yield* agentLlmStreamTranslator.consume(userStream);
    } catch (error: unknown) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }
      throw error;
    }
    yield await agentUsageReporter.buildUsageUpdateEvent(input);

    let round = 0;
    while (toolCalls.length > 0) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      round++;
      if (round > maxRounds) {
        yield* this.emitDoneAfterTurn({
          reason: 'max_rounds_reached',
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      for (const toolCall of toolCalls) {
        const tool = availableTools.get(toolCall.toolName);
        if (!tool || tool.suppressToolEvents) continue;
        inFlightToolCalls.add(toolCall.callId);
        yield {
          type: 'tool-execute-start',
          callId: toolCall.callId,
          toolName: tool.name as ToolName,
          displayName: tool.displayName,
          arguments: toolCall.arguments,
        } satisfies SseToolExecuteStartEvent;
      }

      const toolSseEventChannel = new AsyncChannel<AgentToolSseEvent>();
      const toolResults = new Map<string, ToolResult>();

      for (const toolCall of toolCalls) {
        if (availableTools.has(toolCall.toolName)) continue;
        toolResults.set(toolCall.callId, {
          callId: toolCall.callId,
          content: `Error: Unknown tool: ${toolCall.toolName}`,
          status: 'failure',
        });
      }

      const executions = toolCalls
        .filter((tc) => availableTools.has(tc.toolName))
        .map(async (toolCall) => {
          const todoVersionBefore = input.runtimeState.todoVersion;

          const result = await agentToolExecutor.execute({
            toolCall,
            availableTools,
            toolSseEventChannel,
            runtimeState: input.runtimeState,
            agentId: input.agentId,
            sessionsDir: input.sessionsDir,
            subagentRegistry: input.subagentRegistry,
            availableSkills,
            workingDirectory: input.workingDirectory,
            signal: input.signal,
            getConfig: input.getConfig,
            getLightConfig: input.getLightConfig,
          });

          const tool = availableTools.get(toolCall.toolName);
          if (!tool?.suppressToolEvents) {
            toolSseEventChannel.push({
              type: 'tool-execute-end',
              callId: toolCall.callId,
              result: result.content,
              status: result.status,
              data: result.data,
            } satisfies SseToolExecuteEndEvent);
          }

          if (input.runtimeState.todoVersion !== todoVersionBefore) {
            toolSseEventChannel.push({
              type: 'todo-update',
              items: input.runtimeState.listTodos(),
            } satisfies SseTodoUpdateEvent);
          }

          toolResults.set(toolCall.callId, {
            callId: toolCall.callId,
            content: result.content,
            status: result.status === 'success' ? 'success' : 'failure',
          });
        });

      void Promise.all(executions)
        .catch(() => {
          // Individual tool errors are converted by agentToolExecutor.
        })
        .finally(() => {
          toolSseEventChannel.close();
        });

      for await (const event of toolSseEventChannel) {
        if (event.type === 'tool-execute-end') {
          inFlightToolCalls.delete(event.callId);
        }
        yield event;
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (input.signal.aborted) break;
      }

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      const orderedResults = toolCalls.flatMap((tc) => {
        const result = toolResults.get(tc.callId);
        return result ? [result] : [];
      });

      try {
        toolCalls = yield* agentLlmStreamTranslator.consume(
          input.llmSession.submitToolResults(
            orderedResults,
            toolDefs,
            systemPrompt,
            input.thinkingLevel,
            input.signal,
          ),
        );
      } catch (error: unknown) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (input.signal.aborted) {
          yield* this.emitAbortCompletion({
            inFlightToolCalls,
            tools: toolDefs,
            systemPrompt,
            input,
          });
          return;
        }
        throw error;
      }
      yield await agentUsageReporter.buildUsageUpdateEvent(input);
    }

    yield* this.emitDoneAfterTurn({
      reason: 'complete',
      tools: toolDefs,
      systemPrompt,
      input,
    });
  }

  private async *emitAbortCompletion({
    inFlightToolCalls,
    tools,
    systemPrompt,
    input,
  }: {
    readonly inFlightToolCalls: Set<string>;
    readonly tools: readonly ToolDefinition[];
    readonly systemPrompt: string;
    readonly input: RunAgentTurnInput;
  }): AgentEventStream {
    for (const callId of inFlightToolCalls) {
      yield {
        type: 'tool-execute-end',
        callId,
        result: 'Aborted',
        status: 'error',
        data: {message: 'Aborted'},
      } satisfies SseToolExecuteEndEvent;
    }
    yield* this.emitDoneAfterTurn({
      reason: 'aborted',
      tools,
      systemPrompt,
      input,
    });
  }

  private async *emitDoneAfterTurn({
    reason,
    tools,
    systemPrompt,
    input,
  }: {
    readonly reason: SseDoneEvent['reason'];
    readonly tools: readonly ToolDefinition[];
    readonly systemPrompt: string;
    readonly input: RunAgentTurnInput;
  }): AgentEventStream {
    await input.compactAfterTurn(tools, systemPrompt, input.thinkingLevel);
    yield await agentUsageReporter.buildUsageUpdateEvent(input);
    yield {type: 'done', reason} satisfies SseDoneEvent;
  }
}

export const agentTurnRunner = new AgentTurnRunner();
