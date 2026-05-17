import {z} from 'zod';

/** Unique identifier for an Agent session. */
export const agentIdSchema = z.uuid();

export type AgentId = z.infer<typeof agentIdSchema>;

/** Public API session ids use the same runtime format as agent ids. */
export const sessionIdSchema = agentIdSchema;

export type SessionId = z.infer<typeof sessionIdSchema>;
