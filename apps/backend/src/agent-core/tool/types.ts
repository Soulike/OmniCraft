import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {z} from 'zod';

import type {FileContentCache} from '../agent/file-content-cache.js';
import type {FileStatTracker} from '../agent/file-stat-tracker.js';
import type {SkillDefinition} from '../skill/skill-definition.js';

/** Mutable shell state tracked per-agent across tool calls. */
export interface ShellState {
  /** Current working directory for shell commands. */
  cwd: string;
}

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;

  /** The Agent's working directory. File tools resolve relative paths against this. */
  readonly workingDirectory: string;

  /** LRU cache for file contents, scoped to the Agent's lifetime. */
  readonly fileCache: FileContentCache;

  /** Tracks file stats to prevent blind or stale modifications. */
  readonly fileStatTracker: FileStatTracker;

  /**
   * Additional paths the agent is allowed to access beyond workingDirectory.
   * workingDirectory is always read-write and should NOT be listed here.
   */
  readonly extraAllowedPaths: readonly AllowedPathEntry[];

  /** Mutable shell state (e.g. CWD) tracked across tool calls. */
  readonly shellState: ShellState;

  /** Signal from the agent loop — aborted when the user cancels the request. */
  readonly signal?: AbortSignal;
}

/**
 * A stateless, singleton tool definition.
 *
 * - `parameters`: Zod schema used for type inference, runtime validation,
 *   and JSON Schema generation for LLM APIs.
 * - `execute`: Receives validated args from the LLM and execution context
 *   from the Agent. Returns a text result.
 */
export interface ToolDefinition<T extends z.ZodType = z.ZodType> {
  readonly name: string;
  /** Human-readable name for UI display. */
  readonly displayName: string;
  readonly description: string;
  readonly parameters: T;
  execute(
    args: z.infer<T>,
    context: ToolExecutionContext,
  ): Promise<string> | string;
}
