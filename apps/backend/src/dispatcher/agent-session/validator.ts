import {type AgentType, agentTypeSchema} from '@omnicraft/api-schema';

/** Parses and validates the :agentType path parameter. */
export function parseAgentType(raw: string): AgentType | null {
  const result = agentTypeSchema.safeParse(raw);
  return result.success ? result.data : null;
}
