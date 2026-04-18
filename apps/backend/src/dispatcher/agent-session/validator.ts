import {type AgentType, agentTypeSchema} from '@/types/agent-type.js';

/** Parses and validates the :agentType path parameter. */
export function parseAgentType(raw: string): AgentType | null {
  const result = agentTypeSchema.safeParse(raw);
  return result.success ? result.data : null;
}
