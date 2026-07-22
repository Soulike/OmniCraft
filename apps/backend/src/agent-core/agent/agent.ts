import crypto from 'node:crypto';

import type {ModelTier} from '@omnicraft/settings-schema';
import type {
  SseEvent,
  SseEventCursorEntry,
  SseSessionTitleEvent,
} from '@omnicraft/sse-events';

import {Mutex} from '@/helpers/mutex.js';
import {logger} from '@/logger.js';

import {agentEventBus} from '../events/index.js';
import type {LlmConfig} from '../llm-api/index.js';
import {LlmSession} from '../llm-session/index.js';
import type {ToolDefinition} from '../tool/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
import {agentScratchDirectoryService} from './agent-scratch-directory-service.js';
import {agentTurnRunner} from './agent-turn-runner.js';
import type {AgentSseLogReaderOptions} from './events/agent-sse-log.js';
import {AgentSseLog} from './events/agent-sse-log.js';
import {agentPersistence} from './persistence/agent-persistence.js';
import {SubagentRegistry} from './state/subagent-registry.js';
import type {StopCheck} from './stop-checks/index.js';
import {generateTitle} from './title/agent-title.js';
import {
  type AgentEventStream,
  type AgentOptions,
  type AgentSnapshot,
} from './types.js';

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

  /** Short title for this session, generated after the first user message. */
  title = Agent.DEFAULT_TITLE;

  /** The LLM session used by this agent. */
  private readonly llmSession: LlmSession;

  private readonly toolRegistries: AgentOptions['toolRegistries'];
  private readonly skillRegistries: AgentOptions['skillRegistries'];
  private readonly stopChecks: readonly StopCheck[];
  private readonly baseSystemPrompt: string;
  private readonly getMaxToolRounds: AgentOptions['getMaxToolRounds'];
  private readonly getConfig: () => Promise<LlmConfig>;
  private readonly getTierConfig:
    | ((tier: ModelTier) => Promise<LlmConfig>)
    | null;

  private readonly subagentRegistry: SubagentRegistry;

  private readonly workingDirectory: string;

  private readonly scratchDirectory: string;

  private readonly sessionsDir: string | null;

  private sseEventCount = 0;

  private readonly runtimeState: AgentRuntimeState;

  /** Append-only event log. All turns write to the same log. */
  readonly sseLog: AgentSseLog;

  /** Serializes turns — only one runs at a time. */
  private readonly mutex = new Mutex();

  /** Per-turn abort controller. Null when no turn is running. */
  private abortController: AbortController | null = null;

  /** True while an async title generation is in flight. */
  private isGeneratingTitle = false;

  /**
   * Number of turns from enqueue to full completion. Incremented synchronously
   * before runTurn awaits the mutex; decremented after the turn promise settles.
   */
  private pendingTurnCount = 0;

  constructor(
    getConfig: () => Promise<LlmConfig>,
    options: AgentOptions,
    snapshot?: AgentSnapshot,
  ) {
    this.toolRegistries = options.toolRegistries;
    this.skillRegistries = options.skillRegistries;
    this.stopChecks = options.stopChecks;
    this.baseSystemPrompt = options.baseSystemPrompt;
    this.getMaxToolRounds = options.getMaxToolRounds;
    this.getConfig = getConfig;
    this.getTierConfig = options.getTierConfig ?? null;

    this.sessionsDir = options.sessionsDir ?? null;

    let providedWorkingDirectory: string | undefined;
    if (snapshot) {
      this.id = snapshot.id;
      this.title = snapshot.title;
      this.sseEventCount = snapshot.sseEventCount;
      providedWorkingDirectory = snapshot.options.workingDirectory;
      this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
      this.subagentRegistry = new SubagentRegistry();
    } else {
      this.id = crypto.randomUUID();
      providedWorkingDirectory = options.workingDirectory;
      this.llmSession = new LlmSession(getConfig);
      this.subagentRegistry = new SubagentRegistry();
    }

    this.scratchDirectory = agentScratchDirectoryService.createScratchDirectory(
      this.sessionsDir,
      this.id,
    );
    // A caller that provides no working directory has no project of its own, so
    // the agent works directly in its scratch space.
    this.workingDirectory = providedWorkingDirectory ?? this.scratchDirectory;

    this.sseLog = this.sessionsDir
      ? new AgentSseLog(agentPersistence.eventsPath(this.sessionsDir, this.id))
      : new AgentSseLog();

    this.runtimeState = new AgentRuntimeState(
      this.workingDirectory,
      snapshot?.todos,
    );

    if (!snapshot && this.sessionsDir) {
      agentPersistence.persistSnapshot(
        this.sessionsDir,
        this.id,
        this.toSnapshot(),
        {sync: true},
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
    return this.runtimeState.submitUserResponse(id, result);
  }

  /** Returns the Agent's current working directory. */
  getWorkingDirectory(): string {
    return this.workingDirectory;
  }

  /** Returns the Agent's per-session scratch directory. */
  getScratchDirectory(): string {
    return this.scratchDirectory;
  }

  /** Returns the number of SSE events emitted by this Agent. */
  getSseEventCount(): number {
    return this.sseEventCount;
  }

  /** Returns a serializable snapshot of this agent. */
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      sseEventCount: this.sseEventCount,
      llmSession: this.llmSession.toSnapshot(),
      todos: this.runtimeState.todosToSnapshot(),
      options: {
        // Persist only a real project directory. When the working directory is
        // the scratch space (the caller provided none), store nothing so a
        // restored agent re-derives its scratch-backed working directory.
        workingDirectory:
          this.workingDirectory === this.scratchDirectory
            ? undefined
            : this.workingDirectory,
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
   * Enqueues a user turn. Always accepted and serialized through the mutex
   * queue. Events are written to {@link sseLog}; use {@link subscribe} to read.
   */
  enqueueUserTurn(userMessage: string): void {
    this.runTrackedTurn(userMessage);
  }

  /**
   * Starts a user turn only if the Agent has no pending/running turn (and no
   * in-flight title generation). Returns false when busy instead of queueing.
   *
   * The check-and-increment is atomic: there is no await between reading
   * {@link isRunning} and the increment inside {@link runTrackedTurn}, so in a
   * single-threaded runtime two concurrent claims cannot both succeed.
   */
  tryStartUserTurn(userMessage: string): boolean {
    if (this.isRunning) return false;
    this.runTrackedTurn(userMessage);
    return true;
  }

  private runTrackedTurn(userMessage: string): void {
    this.pendingTurnCount++;
    void this.runTurn(userMessage).finally(() => {
      this.pendingTurnCount--;
    });
  }

  /** Returns an async iterable of events with raw resume cursors. */
  subscribe(
    options?: AgentSseLogReaderOptions,
  ): AsyncIterable<SseEventCursorEntry> {
    return this.sseLog.createReader(options);
  }

  /** Aborts the currently running turn, if any. */
  abort(): void {
    this.abortController?.abort();
  }

  /** Whether a turn is queued/running or a title generation is in flight. */
  get isRunning(): boolean {
    return this.pendingTurnCount > 0 || this.isGeneratingTitle;
  }

  /** Whether a client-side tool call is blocked awaiting the user's response. */
  get isWaitingForInput(): boolean {
    return this.runtimeState.isWaitingForInput;
  }

  // -------------------------------------------------------------------------
  // Private helpers
  // -------------------------------------------------------------------------

  private async runTurn(userMessage: string): Promise<void> {
    const release = await this.mutex.acquire();
    try {
      this.abortController = new AbortController();
      const stream = this.runAgentLoop(
        userMessage,
        this.abortController.signal,
      );
      await this.pump(stream, (event) => {
        if (
          event.type === 'message-start' &&
          event.role === 'user' &&
          this.title === Agent.DEFAULT_TITLE &&
          !this.isGeneratingTitle
        ) {
          this.isGeneratingTitle = true;
          void this.generateAndEmitTitle(event.content).finally(() => {
            this.isGeneratingTitle = false;
          });
        }
      });
      await this.persistSnapshot().catch((err: unknown) => {
        logger.error({err}, 'Failed to persist snapshot');
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
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      await this.appendSseEvent({
        type: 'error',
        message,
      });
    }
  }

  private async compactAfterTurn(
    tools: readonly ToolDefinition[],
    systemPrompt: string,
  ): Promise<void> {
    try {
      for await (const event of this.llmSession.compactIfNeeded({
        reason: 'after-turn',
        tools,
        systemPrompt,
      })) {
        await this.appendSseEvent(event);
      }
    } catch (err: unknown) {
      // Turn-end compaction is best-effort cleanup after user-visible work is done.
      // Keep the completed turn successful and retry compaction before the next LLM call.
      logger.error({err}, 'Failed to compact LLM session after turn');
    }
  }

  private resolveTierConfig(tier: ModelTier): Promise<LlmConfig> {
    return this.getTierConfig ? this.getTierConfig(tier) : this.getConfig();
  }

  protected runAgentLoop(
    userMessage: string,
    signal: AbortSignal,
  ): AgentEventStream {
    return agentTurnRunner.run({
      userMessage,
      agentId: this.id,
      sessionsDir: this.sessionsDir,
      subagentRegistry: this.subagentRegistry,
      workingDirectory: this.workingDirectory,
      scratchDirectory: this.scratchDirectory,
      signal,
      llmSession: this.llmSession,
      runtimeState: this.runtimeState,
      toolRegistries: this.toolRegistries,
      skillRegistries: this.skillRegistries,
      stopChecks: this.stopChecks,
      baseSystemPrompt: this.baseSystemPrompt,
      getConfig: this.getConfig,
      getTierConfig: (tier) => this.resolveTierConfig(tier),
      getMaxToolRounds: this.getMaxToolRounds,
      compactAfterTurn: (tools, systemPrompt) =>
        this.compactAfterTurn(tools, systemPrompt),
    });
  }

  /**
   * Generates a session title from the first user message using the lightweight tier,
   * then appends a `session-title` event to sseLog.
   * Fire-and-forget — errors are swallowed and a fallback title is used.
   */
  private async generateAndEmitTitle(userMessage: string): Promise<void> {
    this.title = await generateTitle(userMessage, () =>
      this.resolveTierConfig('lightweight'),
    );
    if (!this.title) return;
    await this.appendSseEvent({
      type: 'session-title',
      title: this.title,
    } satisfies SseSessionTitleEvent);
  }
}
