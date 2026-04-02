import type {z} from 'zod';

import type {SkillDefinition} from '../skill/skill-definition.js';
import type {ToolSetDefinition} from '../tool-set/tool-set-definition.js';
import type {LoadToolSetToAgentFn} from '../tool-set/types.js';

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: SkillDefinition[];

  /** All tool sets available to the current Agent, merged and deduplicated. */
  readonly availableToolSets: ToolSetDefinition[];

  /** Tool sets currently loaded into the Agent. */
  readonly loadedToolSets: ReadonlySet<ToolSetDefinition>;

  /** Loads a tool set into the Agent, making its tools available in subsequent rounds. */
  readonly loadToolSetToAgent: LoadToolSetToAgentFn;
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
