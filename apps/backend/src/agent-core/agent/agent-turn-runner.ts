import assert from 'node:assert';

import type {ModelTier} from '@omnicraft/settings-schema';
import type {
  SseDoneEvent,
  SseMessageStartEvent,
  SseStopCheckReminderEvent,
  SseTodoUpdateEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
} from '@omnicraft/sse-events';
import type {ToolName} from '@omnicraft/tool-schemas';

import {AsyncChannel} from '@/helpers/async-channel.js';
import {logger} from '@/logger.js';

import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import {toolResultBlocksToText} from '../llm-api/index.js';
import type {
  LlmSession,
  LlmSessionEventStream,
  ToolResult,
} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {AnyToolDefinition, ToolRegistry} from '../tool/index.js';
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
import type {StopCheck} from './stop-checks/index.js';
import type {AgentEvent, AgentEventStream} from './types.js';

export interface RunAgentTurnInput {
  readonly userMessage: string;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly subagentRegistry: SubagentRegistry;
  readonly workingDirectory: string;
  readonly scratchDirectory: string;
  readonly signal: AbortSignal;
  readonly llmSession: LlmSession;
  readonly runtimeState: AgentRuntimeState;
  readonly toolRegistries: readonly ToolRegistry[];
  readonly skillRegistries: readonly SkillRegistry[];
  readonly stopChecks: readonly StopCheck[];
  readonly baseSystemPrompt: string;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getTierConfig: (tier: ModelTier) => Promise<LlmConfig>;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly compactAfterTurn: (
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
  ) => Promise<void>;
}

export class AgentTurnRunner {
  async *run(input: RunAgentTurnInput): AgentEventStream {
    const inFlightToolCalls = new Set<string>();
    const maxRounds = await input.getMaxToolRounds();

    assertUniqueStopCheckNames(input.stopChecks);

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
      input.scratchDirectory,
    );

    const {
      stream: userStream,
      messageId,
      createdAt,
    } = input.llmSession.sendUserMessage(
      input.userMessage,
      toolDefs,
      systemPrompt,
      input.signal,
    );

    yield {
      type: 'message-start',
      role: 'user',
      messageId,
      createdAt,
      content: input.userMessage,
    } satisfies SseMessageStartEvent;

    const initial = yield* this.advanceTurn(userStream, input);
    if (initial.aborted) {
      yield* this.emitAbortCompletion({
        inFlightToolCalls,
        tools: toolDefs,
        systemPrompt,
        input,
      });
      return;
    }
    let toolCalls = initial.toolCalls;

    let round = 0;
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    while (true) {
      if (input.signal.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }

      if (toolCalls.length === 0) {
        const reminder = await this.evaluateStopChecks(
          input.stopChecks,
          input.runtimeState,
        );
        if (!reminder) break;

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

        // sendReminder is the sole owner of sanitization; it returns the
        // sanitized body it injected, which we surface in the SSE event so the
        // persisted/broadcast text matches what the model saw — never the raw
        // payload.
        const {stream, messageId, createdAt, content} =
          input.llmSession.sendReminder(
            reminder.content,
            toolDefs,
            systemPrompt,
            input.signal,
          );
        yield {
          type: 'stop-check-reminder',
          checkNames: reminder.checkNames,
          content,
          messageId,
          createdAt,
        } satisfies SseStopCheckReminderEvent;

        const reminded = yield* this.advanceTurn(stream, input);
        if (reminded.aborted) {
          yield* this.emitAbortCompletion({
            inFlightToolCalls,
            tools: toolDefs,
            systemPrompt,
            input,
          });
          return;
        }
        // Record de-dup tokens only when the agent answered the reminder by
        // stopping (no tool calls). If it returned tool calls it is trying to
        // act — recording now would mis-mark the state as "seen and dismissed"
        // and suppress a future reminder, especially if a maxRounds cutoff then
        // prevents those tools from running. A tool-bearing response leaves the
        // token unrecorded, so the reminder re-fires while the state is stuck.
        if (reminded.toolCalls.length === 0) {
          for (const {name, stateToken} of reminder.tokens) {
            input.runtimeState.recordStopCheckToken(name, stateToken);
          }
        }
        toolCalls = reminded.toolCalls;
        continue;
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
          // `tool.name` is a built-in InternalToolName or an MCP McpToolName by
          // construction; ToolDefinitionBase types the field as plain `string`.
          toolName: tool.name as ToolName,
          displayName: tool.displayName,
          arguments: toolCall.arguments,
        } satisfies SseToolExecuteStartEvent;
      }

      const toolSseEventChannel = new AsyncChannel<AgentToolSseEvent>(
        input.signal,
      );
      const toolResults = new Map<string, ToolResult>();

      for (const toolCall of toolCalls) {
        if (availableTools.has(toolCall.toolName)) continue;
        toolResults.set(toolCall.callId, {
          callId: toolCall.callId,
          content: [
            {type: 'text', text: `Error: Unknown tool: ${toolCall.toolName}`},
          ],
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
            scratchDirectory: input.scratchDirectory,
            signal: input.signal,
            getConfig: input.getConfig,
            getTierConfig: input.getTierConfig,
          });

          const tool = availableTools.get(toolCall.toolName);
          if (!tool?.suppressToolEvents) {
            toolSseEventChannel.push({
              type: 'tool-execute-end',
              callId: toolCall.callId,
              result: toolResultBlocksToText(result.content),
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

      // The channel ends when every tool settles (its producer closes it) or
      // when the turn is aborted (it observes `input.signal`) — so a tool that
      // never settles can no longer block the turn forever.
      for await (const event of toolSseEventChannel) {
        if (event.type === 'tool-execute-end') {
          inFlightToolCalls.delete(event.callId);
        }
        yield event;
      }

      // On abort, any tool calls still in flight never produced an end event.
      // Flush a synthetic aborted end for each so the UI never strands a
      // perpetually-running tool, then close the turn.
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

      const next = yield* this.advanceTurn(
        input.llmSession.submitToolResults(
          orderedResults,
          toolDefs,
          systemPrompt,
          input.signal,
        ),
        input,
      );
      if (next.aborted) {
        yield* this.emitAbortCompletion({
          inFlightToolCalls,
          tools: toolDefs,
          systemPrompt,
          input,
        });
        return;
      }
      toolCalls = next.toolCalls;
    }

    yield* this.emitDoneAfterTurn({
      reason: 'complete',
      tools: toolDefs,
      systemPrompt,
      input,
    });
  }

  private async *advanceTurn(
    stream: LlmSessionEventStream,
    input: RunAgentTurnInput,
  ): AsyncGenerator<
    AgentEvent,
    {aborted: boolean; toolCalls: LlmToolCall[]},
    undefined
  > {
    try {
      const toolCalls = yield* agentLlmStreamTranslator.consume(stream);
      yield await agentUsageReporter.buildUsageUpdateEvent(input);
      return {aborted: false, toolCalls};
    } catch (error: unknown) {
      if (input.signal.aborted) return {aborted: true, toolCalls: []};
      throw error;
    }
  }

  private async evaluateStopChecks(
    stopChecks: readonly StopCheck[],
    runtimeState: AgentRuntimeState,
  ): Promise<{
    checkNames: string[];
    content: string;
    tokens: {name: string; stateToken: string}[];
  } | null> {
    const settled = await Promise.allSettled(
      stopChecks.map(async (check) => ({
        name: check.name,
        result: await check.evaluate({runtimeState}),
      })),
    );

    const fired: {name: string; content: string}[] = [];
    const tokens: {name: string; stateToken: string}[] = [];
    for (const [index, settledResult] of settled.entries()) {
      if (settledResult.status === 'rejected') {
        logger.error(
          {err: settledResult.reason, check: stopChecks[index].name},
          'Stop-check evaluation failed; skipping',
        );
        continue;
      }
      const {name, result} = settledResult.value;
      if (result === null) continue;
      // An empty content has nothing to remind about — treat it like a check
      // that didn't fire. This also keeps the emitted event non-empty, which
      // the SSE schema (and the frontend's strict parse) requires.
      if (result.content === '') continue;
      // State-token de-dup: suppress a reminder whose token matches the one we
      // last reminded on for this check (the agent already saw it and stopped).
      if (
        result.stateToken !== undefined &&
        result.stateToken === runtimeState.getLastStopCheckToken(name)
      ) {
        continue;
      }
      if (result.stateToken !== undefined) {
        tokens.push({name, stateToken: result.stateToken});
      }
      fired.push({name, content: result.content});
    }

    if (fired.length === 0) return null;
    return {
      checkNames: fired.map((entry) => entry.name),
      content: fired.map((entry) => entry.content).join('\n\n'),
      tokens,
    };
  }

  private async *emitAbortCompletion({
    inFlightToolCalls,
    tools,
    systemPrompt,
    input,
  }: {
    readonly inFlightToolCalls: Set<string>;
    readonly tools: readonly AnyToolDefinition[];
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
    readonly tools: readonly AnyToolDefinition[];
    readonly systemPrompt: string;
    readonly input: RunAgentTurnInput;
  }): AgentEventStream {
    // After-turn compaction is best-effort cleanup that runs an unbounded,
    // signal-less LLM call. On abort the turn must reach `done` promptly, so
    // skip it rather than gate the terminal event on work that could hang.
    if (reason !== 'aborted') {
      await input.compactAfterTurn(tools, systemPrompt);
    }
    yield await agentUsageReporter.buildUsageUpdateEvent(input);
    yield {type: 'done', reason} satisfies SseDoneEvent;
  }
}

export const agentTurnRunner = new AgentTurnRunner();

/**
 * Stop-check names key the per-session de-dup token map, so duplicates would
 * share a slot — one check could never be suppressed while another is
 * suppressed forever. Enforce uniqueness explicitly as the check surface grows.
 */
function assertUniqueStopCheckNames(stopChecks: readonly StopCheck[]): void {
  const names = new Set<string>();
  for (const check of stopChecks) {
    assert(!names.has(check.name), `Duplicate stop-check name: ${check.name}`);
    names.add(check.name);
  }
}
