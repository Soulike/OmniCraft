import type {z} from 'zod';

import type {FileContentCache} from '../agent/file-content-cache.js';
import type {SkillDefinition} from '../skill/skill-definition.js';
import type {ToolSetDefinition} from '../tool-set/tool-set-definition.js';
import type {LoadToolSetToAgentFn} from '../tool-set/types.js';

/** A directory the agent is allowed to access beyond its working directory. */
export interface AllowedPath {
  /** Absolute path of the allowed directory. */
  readonly path: string;
  /** 'read' = read-only, 'read-write' = read and write. */
  readonly mode: 'read' | 'read-write';
}

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: ReadonlyMap<string, SkillDefinition>;

  /** All tool sets available to the current Agent, merged and deduplicated. */
  readonly availableToolSets: ReadonlyMap<string, ToolSetDefinition>;

  /** Tool sets currently loaded into the Agent. */
  readonly loadedToolSets: ReadonlySet<ToolSetDefinition>;

  /** Loads a tool set into the Agent, making its tools available in subsequent rounds. */
  readonly loadToolSetToAgent: LoadToolSetToAgentFn;

  /** The Agent's working directory. File tools resolve relative paths against this. */
  readonly workingDirectory: string;

  /** LRU cache for file contents, scoped to the Agent's lifetime. */
  readonly fileCache: FileContentCache;

  /**
   * Additional paths the agent is allowed to access beyond workingDirectory.
   * workingDirectory is always read-write and should NOT be listed here.
   */
  readonly extraAllowedPaths: readonly AllowedPath[];
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
