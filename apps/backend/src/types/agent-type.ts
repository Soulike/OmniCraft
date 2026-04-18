import {z} from 'zod';

/** Discriminator for the type of agent backing a session. */
export enum AgentType {
  CHAT = 'chat',
  CODING = 'coding',
}

export const agentTypeSchema = z.enum(AgentType);
