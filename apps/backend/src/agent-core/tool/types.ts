import type {SseSubAgentEvent} from '@omnicraft/sse-events';
import type {ToolFailureData} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

import type {FileContentCache} from '../agent/state/file-content-cache.js';
import type {FileStatTracker} from '../agent/state/file-stat-tracker.js';
import type {TodoStore} from '../agent/state/todo-store.js';
import type {
  LlmConfig,
  LlmToolCall,
  LlmToolResultMessage,
} from '../llm-api/types.js';
import type {SkillDefinition} from '../skill/skill-definition.js';
import type {UserInteractionBridge} from '../user-interaction/index.js';

/** Mutable shell state tracked per-agent across tool calls. */
export interface ShellState {
  /** Current working directory for shell commands. */
  cwd: string;
}

/** Mutable todo observation state tracked per-agent across tool calls. */
export interface TodoState {
  /** The store version the agent last observed via todo_list or a mutation result. */
  lastObservedVersion: number | undefined;
}

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** The unique call ID for this tool invocation, from the LLM API response. */
  readonly callId: string;

  /** The parent Agent's unique ID. */
  readonly agentId: string;

  /** Directory where the parent Agent persists sessions, or null for in-memory agents. */
  readonly sessionsDir: string | null;

  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;

  /** The Agent's working directory. File tools resolve relative paths against this. */
  readonly workingDirectory: string;

  /** LRU cache for file contents, scoped to the Agent's lifetime. */
  readonly fileCache: FileContentCache;

  /** Tracks file stats to prevent blind or stale modifications. */
  readonly fileStatTracker: FileStatTracker;

  /** Mutable shell state (e.g. CWD) tracked across tool calls. */
  readonly shellState: ShellState;

  /** Signal from the agent loop — aborted when the user cancels the request. */
  readonly signal: AbortSignal;

  /** Callback to inject subagent events into the parent agent's SSE stream. */
  readonly onSubAgentEvent: (event: SseSubAgentEvent) => void;

  /**
   * Bridge for client-side tools that need to await user interaction.
   * Tools call `bridge.waitForResponse(id, signal)` to pause execution
   * until the frontend submits a response via the HTTP endpoint.
   */
  readonly userInteractionBridge: UserInteractionBridge;

  /** In-memory todo list for tracking work progress. */
  readonly todoStore: TodoStore;

  /** Mutable todo observation state tracked across tool calls. */
  readonly todoState: TodoState;

  /** Returns the LLM configuration of the parent agent. */
  readonly getConfig: () => Promise<LlmConfig>;

  /**
   * Returns the lightweight LLM configuration of the parent agent.
   * Falls back to getConfig when no light model is configured.
   */
  readonly getLightConfig: () => Promise<LlmConfig>;
}

/** Successful tool execution — carries typed structured data. */
export interface ToolExecuteSuccessResult<T> {
  readonly data: T;
  readonly content: string;
  readonly status: 'success';
}

/** Failed tool execution — carries an error message. */
export interface ToolExecuteFailureResult {
  readonly data: ToolFailureData;
  readonly content: string;
  readonly status: 'failure';
}

/** Discriminated union of tool execution outcomes. */
export type ToolExecuteResult<T> =
  | ToolExecuteSuccessResult<T>
  | ToolExecuteFailureResult;

export interface ToolCompactResultInput {
  readonly content: string;
  readonly status: 'success' | 'failure';
  readonly toolCall: LlmToolCall;
  readonly message: LlmToolResultMessage;
}

/**
 * A stateless, singleton tool definition.
 *
 * - `parameters`: Zod schema used for type inference, runtime validation,
 *   and JSON Schema generation for LLM APIs.
 * - `execute`: Receives validated args from the LLM and execution context
 *   from the Agent. Returns a structured result with content and status.
 */
export interface ToolDefinition<
  TParams extends z.ZodType = z.ZodType,
  TResult = unknown,
> {
  readonly name: string;
  /** Human-readable name for UI display. */
  readonly displayName: string;
  readonly description: string;
  readonly parameters: TParams;
  /**
   * When true, the agent loop skips emitting tool-execute-start/delta/end
   * SSE events for this tool. The tool result is still submitted to the LLM.
   */
  readonly suppressToolEvents: boolean;
  readonly compactResult?: (input: ToolCompactResultInput) => string | null;
  execute(
    args: z.infer<TParams>,
    context: ToolExecutionContext,
    onOutput?: (chunk: string) => void,
  ): Promise<ToolExecuteResult<TResult>> | ToolExecuteResult<TResult>;
}
