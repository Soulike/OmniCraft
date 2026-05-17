import {z} from 'zod';

/** Discriminator for subagent implementations that can be dispatched/resumed. */
export const SubAgentType = {
  GENERAL: 'general',
  EXPLORE: 'explore',
} as const;

export type SubAgentType = (typeof SubAgentType)[keyof typeof SubAgentType];

export const subAgentTypeSchema = z.enum([
  SubAgentType.GENERAL,
  SubAgentType.EXPLORE,
]);
