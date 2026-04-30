import {z} from 'zod';

export const SUB_AGENT_TYPE = {
  GENERAL: 'general',
  EXPLORE: 'explore',
} as const;

export type SubAgentType = (typeof SUB_AGENT_TYPE)[keyof typeof SUB_AGENT_TYPE];

export const agentTypeSchema = z.enum([
  SUB_AGENT_TYPE.GENERAL,
  SUB_AGENT_TYPE.EXPLORE,
]);

export interface DispatchAgentResult {
  subagentId: string;
  agentType: SubAgentType;
  summary: string;
}
