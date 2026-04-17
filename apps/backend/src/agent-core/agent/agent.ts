import assert from 'node:assert';
import crypto from 'node:crypto';
import os from 'node:os';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {
  SseDoneEvent,
  SseEvent,
  SseMessageStartEvent,
  SseSessionTitleEvent,
  SseSubAgentEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
  SseUsage,
} from '@omnicraft/sse-events';
import type {AnyToolResultData, ToolName} from '@omnicraft/tool-schemas';

import {AsyncChannel} from '@/helpers/async-channel.js';
import {Mutex} from '@/helpers/mutex.js';
import {logger} from '@/logger.js';

import {agentEventBus} from '../events/index.js';
import type {LlmConfig, LlmToolCall} from '../llm-api/index.js';
import type {LlmSessionEventStream, ToolResult} from '../llm-session/index.js';
import {LlmSession} from '../llm-session/index.js';
import {modelCapacity} from '../model-capacity/index.js';
import type {
  AllowedPathEntry,
  ShellState,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
import {UserInteractionBridge} from '../user-interaction/index.js';
import {
  buildAvailableSkills,
  buildAvailableTools,
  buildSystemPrompt,
} from './agent-catalog.js';
import {agentPersistence} from './agent-persistence.js';
import type {AgentSseLogReaderOptions} from './agent-sse-log.js';
import {AgentSseLog} from './agent-sse-log.js';
import {generateTitle} from './agent-title.js';
import {FileContentCache} from './file-content-cache.js';
import {FileStatTracker} from './file-stat-tracker.js';
import type {AgentEventStream, AgentOptions, AgentSnapshot} from './types.js';

/**
 * Base class for all agents.
 *
 * Implements the full Agent Loop: send user message → stream LLM response →
 * execute tool calls → submit results → repeat until done or max rounds.
 *
 * Subclasses only differ in what they pass to `super()`.
 */
export abstract class Agent {
  /** Unique identifier for this agent session. */
  readonly id: string;

  static readonly DEFAULT_TITLE = 'New Session';

  /** Short title for this session, generated after the first reply. */
  title = Agent.DEFAULT_TITLE;

  /** The LLM session used by this agent. */
  private readonly llmSession: LlmSession;

  private readonly toolRegistries: AgentOptions['toolRegistries'];
  private readonly skillRegistries: AgentOptions['skillRegistries'];
  private readonly baseSystemPrompt: string;
  private readonly getMaxToolRounds: AgentOptions['getMaxToolRounds'];
  private readonly getConfig: () => Promise<LlmConfig>;
  private readonly getLightConfig: (() => Promise<LlmConfig>) | null;

  private readonly workingDirectory: string;

  private readonly extraAllowedPaths: readonly AllowedPathEntry[];

  private readonly sessionsDir: string | null;

  private sseEventCount = 0;

  /** LRU file content cache, shared by all file-related tools. */
  private readonly fileCache = new FileContentCache();

  /** Tracks file stats for modification safety checks. */
  private readonly fileStatTracker = new FileStatTracker();

  /** Mutable shell state, shared by shell-related tools. */
  private readonly shellState: ShellState;

  /** Bridge for client-side tools that await user interaction. */
  private readonly userInteractionBridge = new UserInteractionBridge();

  /** Append-only event log. All turns write to the same log. */
  readonly sseLog: AgentSseLog;

  /** Serializes turns — only one runs at a time. */
  private readonly mutex = new Mutex();

  /** Per-turn abort controller. Null when no turn is running. */
  private abortController: AbortController | null = null;

  /** True while an async title generation is in flight. */
  private isGeneratingTitle = false;

  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: AgentOptions,
    snapshot?: AgentSnapshot,
  ) {
    this.toolRegistries = options.toolRegistries;
    this.skillRegistries = options.skillRegistries;
    this.baseSystemPrompt = options.baseSystemPrompt;
    this.getMaxToolRounds = options.getMaxToolRounds;
    this.getConfig = getConfig;
    this.getLightConfig = options.getLightConfig ?? null;

    this.extraAllowedPaths = [
      {path: os.tmpdir(), mode: 'read-write' as const},
      ...options.extraAllowedPaths,
    ];

    this.sessionsDir = options.sessionsDir ?? null;

    if (snapshot) {
      this.id = snapshot.id;
      this.title = snapshot.title;
      this.sseEventCount = snapshot.sseEventCount;
      this.workingDirectory = snapshot.options.workingDirectory;
      this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
    } else {
      this.id = crypto.randomUUID();
      this.workingDirectory = options.workingDirectory;
      this.llmSession = new LlmSession(getConfig);
    }

    this.sseLog = this.sessionsDir
      ? new AgentSseLog(agentPersistence.eventsPath(this.sessionsDir, this.id))
      : new AgentSseLog();

    this.shellState = {cwd: this.workingDirectory};

    if (!snapshot && this.sessionsDir) {
      agentPersistence.persistSnapshotSync(
        this.sessionsDir,
        this.id,
        this.toSnapshot(),
      );
    }

    agentEventBus.emit('agent-created', this);
  }

  /**
   * Delivers a user response to a waiting client-side tool.
   * Called by the HTTP handler when the frontend submits a tool response.
   *
   * @returns `true` if a pending interaction was found and resolved.
   */
  submitUserResponse(id: string, result: unknown): boolean {
    return this.userInteractionBridge.submitResponse(id, result);
  }

  /** Returns a serializable snapshot of this agent. */
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      sseEventCount: this.sseEventCount,
      llmSession: this.llmSession.toSnapshot(),
      options: {
        workingDirectory: this.workingDirectory,
        extraAllowedPaths: this.extraAllowedPaths.filter(
          (p) => p.path !== os.tmpdir(),
        ),
      },
    };
  }

  /**
   * Persists the current snapshot to disk via atomic rename.
   * No-op when sessionsDir is not configured.
   */
  private async persistSnapshot(): Promise<void> {
    if (!this.sessionsDir) return;
    await agentPersistence.persistSnapshot(
      this.sessionsDir,
      this.id,
      this.toSnapshot(),
    );
  }

  /**
   * Handles a user message by running the full Agent Loop in the background.
   * Events are written to {@link sseLog}. Use {@link subscribe} to read them.
   */
  handleUserMessage(userMessage: string, thinkingLevel: ThinkingLevel): void {
    void this.runTurn(userMessage, thinkingLevel);
  }

  /** Returns an async iterable of events from this agent's log. */
  subscribe(options?: AgentSseLogReaderOptions): AsyncIterable<SseEvent> {
    return this.sseLog.createReader(options);
  }

  /** Aborts the currently running turn, if any. */
  abort(): void {
    this.abortController?.abort();
  }

  /** Whether a turn or title generation is currently in progress. */
  get isRunning(): boolean {
    return this.abortController !== null || this.isGeneratingTitle;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async runTurn(
    userMessage: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.abortController = new AbortController();
      const stream = this.runAgentLoop(
        userMessage,
        thinkingLevel,
        this.abortController.signal,
      );
      await this.pump(stream, (event) => {
        if (
          event.type === 'done' &&
          event.reason === 'complete' &&
          this.title === Agent.DEFAULT_TITLE &&
          !this.isGeneratingTitle
        ) {
          this.isGeneratingTitle = true;
          void this.generateAndEmitTitle().finally(() => {
            this.isGeneratingTitle = false;
          });
        }
        if (event.type === 'done') {
          void this.persistSnapshot().catch((err: unknown) => {
            logger.error({err}, 'Failed to persist snapshot');
          });
        }
      });
    } finally {
      this.abortController = null;
      release();
    }
  }

  /** Appends an event to the SSE log and increments the event counter. */
  private async appendSseEvent(event: SseEvent): Promise<void> {
    await this.sseLog.append(event);
    this.sseEventCount++;
  }

  /** Consumes the agent event stream and appends each event to sseLog. */
  private async pump(
    stream: AgentEventStream,
    onEvent?: (event: SseEvent) => void,
  ): Promise<void> {
    try {
      for await (const event of stream) {
        await this.appendSseEvent(event);
        onEvent?.(event);
      }
    } catch {
      await this.appendSseEvent({
        type: 'error',
        message: 'An internal error occurred',
      });
    }
  }

  private async *emitAbortCompletion(
    inFlightToolCalls: Set<string>,
  ): AgentEventStream {
    for (const callId of inFlightToolCalls) {
      yield {
        type: 'tool-execute-end',
        callId,
        result: 'Aborted',
        status: 'error',
        data: {message: 'Aborted'},
      } satisfies SseToolExecuteEndEvent;
    }
    yield {
      type: 'done',
      reason: 'aborted',
      usage: await this.buildSseUsage(),
    } satisfies SseDoneEvent;
  }

  protected async *runAgentLoop(
    userMessage: string,
    thinkingLevel: ThinkingLevel,
    signal: AbortSignal,
  ): AgentEventStream {
    const inFlightToolCalls = new Set<string>();
    const maxRounds = await this.getMaxToolRounds();

    const availableTools = buildAvailableTools(
      this.toolRegistries,
      this.skillRegistries,
    );
    const toolDefs = [...availableTools.values()];
    const systemPrompt = buildSystemPrompt(
      this.baseSystemPrompt,
      this.skillRegistries,
      this.workingDirectory,
      this.extraAllowedPaths,
    );

    const {
      stream: userStream,
      messageId,
      createdAt,
    } = this.llmSession.sendUserMessage(
      userMessage,
      toolDefs,
      systemPrompt,
      thinkingLevel,
      signal,
    );

    yield {
      type: 'message-start',
      role: 'user',
      messageId,
      createdAt,
      content: userMessage,
    } satisfies SseMessageStartEvent;

    let toolCalls = yield* this.consumeStream(userStream);

    let round = 0;
    while (toolCalls.length > 0) {
      if (signal.aborted) {
        yield* this.emitAbortCompletion(inFlightToolCalls);
        return;
      }

      round++;
      if (round > maxRounds) {
        yield {
          type: 'done',
          reason: 'max_rounds_reached',
          usage: await this.buildSseUsage(),
        } satisfies SseDoneEvent;
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

      const toolSseEventChannel = new AsyncChannel<
        SseToolExecuteEndEvent | SseToolExecuteDeltaEvent | SseSubAgentEvent
      >();
      const toolResults = new Map<string, ToolResult>();

      for (const toolCall of toolCalls) {
        if (availableTools.has(toolCall.toolName)) continue;
        toolResults.set(toolCall.callId, {
          callId: toolCall.callId,
          content: `Error: Unknown tool: ${toolCall.toolName}`,
        });
      }

      const executions = toolCalls
        .filter((tc) => availableTools.has(tc.toolName))
        .map(async (toolCall) => {
          const result = await this.executeTool(
            toolCall,
            availableTools,
            toolSseEventChannel,
            signal,
          );

          const tool = availableTools.get(toolCall.toolName);
          if (!tool?.suppressToolEvents) {
            toolSseEventChannel.push({
              type: 'tool-execute-end' as const,
              callId: toolCall.callId,
              result: result.content,
              status: result.status,
              data: result.data,
            } satisfies SseToolExecuteEndEvent);
          }

          toolResults.set(toolCall.callId, {
            callId: toolCall.callId,
            content: result.content,
          });
        });

      void Promise.all(executions)
        .catch(() => {
          // Individual tool errors are already handled by executeTool.
          // This catch prevents an unhandled rejection from hanging the channel.
        })
        .finally(() => {
          toolSseEventChannel.close();
        });

      for await (const event of toolSseEventChannel) {
        if (event.type === 'tool-execute-end') {
          inFlightToolCalls.delete(event.callId);
        }
        yield event;
        // signal.aborted may have changed during async tool execution
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
        if (signal.aborted) break;
      }

      // signal.aborted may have changed during async tool execution
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (signal.aborted) {
        yield* this.emitAbortCompletion(inFlightToolCalls);
        return;
      }

      const orderedResults = toolCalls.flatMap((tc) => {
        const result = toolResults.get(tc.callId);
        return result ? [result] : [];
      });

      toolCalls = yield* this.consumeStream(
        this.llmSession.submitToolResults(
          orderedResults,
          toolDefs,
          systemPrompt,
          thinkingLevel,
          signal,
        ),
      );
    }

    yield {
      type: 'done',
      reason: 'complete',
      usage: await this.buildSseUsage(),
    } satisfies SseDoneEvent;
  }

  /**
   * Builds the full SseUsage object by combining LLM session token counts
   * with model metadata from the config.
   */
  private async buildSseUsage(): Promise<SseUsage> {
    const config = await this.getConfig();
    const maxInputTokens = await modelCapacity.getMaxInputTokens(config);
    return {
      model: config.model,
      maxInputTokens,
      ...this.llmSession.getUsage(),
    };
  }

  /**
   * Generates a session title from the first user + assistant exchange
   * using the light LLM, then appends a `session-title` event to sseLog.
   * Fire-and-forget — errors are swallowed and a fallback title is used.
   */
  private async generateAndEmitTitle(): Promise<void> {
    const messages = this.llmSession.getMessages();
    const getConfig = this.getLightConfig ?? this.getConfig;
    this.title = await generateTitle(messages, getConfig);
    if (!this.title) return;
    await this.appendSseEvent({
      type: 'session-title',
      title: this.title,
    } satisfies SseSessionTitleEvent);
    await this.persistSnapshot().catch((err: unknown) => {
      logger.error({err}, 'Failed to persist snapshot after title generation');
    });
  }

  /**
   * Consumes an LLM event stream, yielding text, thinking, and
   * message-start events to the caller and collecting tool-call events.
   * Returns the collected tool calls.
   */
  private async *consumeStream(
    stream: LlmSessionEventStream,
  ): AsyncGenerator<
    | SseTextDeltaEvent
    | SseThinkingStartEvent
    | SseThinkingDeltaEvent
    | SseThinkingEndEvent
    | SseMessageStartEvent,
    LlmToolCall[],
    undefined
  > {
    const toolCalls: LlmToolCall[] = [];
    for await (const event of stream) {
      switch (event.type) {
        case 'text-delta':
        case 'thinking-start':
        case 'thinking-delta':
        case 'thinking-end':
          yield event;
          break;
        case 'message-start':
          yield {
            type: 'message-start',
            role: 'assistant',
            messageId: event.messageId,
            createdAt: event.createdAt,
            content: '',
          } satisfies SseMessageStartEvent;
          break;
        case 'tool-call':
          toolCalls.push(event.toolCall);
          break;
      }
    }
    return toolCalls;
  }

  /**
   * Executes a single tool call. Returns the result content and execution status.
   * Assembles onOutput and onSubAgentEvent callbacks from the channel.
   */
  private async executeTool(
    toolCall: LlmToolCall,
    availableTools: ReadonlyMap<string, ToolDefinition>,
    toolSseEventChannel: AsyncChannel<
      SseToolExecuteEndEvent | SseToolExecuteDeltaEvent | SseSubAgentEvent
    >,
    signal: AbortSignal,
  ): Promise<{
    content: string;
    status: 'success' | 'failure' | 'error';
    data: AnyToolResultData;
  }> {
    const tool = availableTools.get(toolCall.toolName);
    assert(tool, `executeTool called with unknown tool: ${toolCall.toolName}`);

    const onOutput = tool.suppressToolEvents
      ? undefined
      : (chunk: string) => {
          toolSseEventChannel.push({
            type: 'tool-execute-delta',
            callId: toolCall.callId,
            content: chunk,
          } satisfies SseToolExecuteDeltaEvent);
        };

    const context: ToolExecutionContext = {
      callId: toolCall.callId,
      availableSkills: buildAvailableSkills(this.skillRegistries),
      workingDirectory: this.workingDirectory,
      fileCache: this.fileCache,
      fileStatTracker: this.fileStatTracker,
      extraAllowedPaths: this.extraAllowedPaths,
      shellState: this.shellState,
      signal,
      onSubAgentEvent: (event) => {
        toolSseEventChannel.push(event);
      },
      userInteractionBridge: this.userInteractionBridge,
    };

    try {
      const parsedArgs: unknown = tool.parameters.parse(
        JSON.parse(toolCall.arguments),
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
