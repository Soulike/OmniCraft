import type {z} from 'zod';

import type {SkillDefinition} from '@/skills/types.js';

/** Execution context provided by the Agent to each Tool at call time. */
export interface ToolExecutionContext {
  /** All skills available to the current Agent, merged and deduplicated. */
  readonly availableSkills: SkillDefinition[];
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
  readonly description: string;
  readonly parameters: T;
  execute(args: z.infer<T>, context: ToolExecutionContext): Promise<string>;
}
