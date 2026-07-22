import {z} from 'zod';

/** Discriminator for the type of agent backing a session. */
export const AgentType = {
  CHAT: 'chat',
  CODING: 'coding',
} as const;

export type AgentType = (typeof AgentType)[keyof typeof AgentType];

export const agentTypeSchema = z.enum(['chat', 'coding']);
