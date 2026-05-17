import {type ThinkingLevel, thinkingLevelSchema} from '@omnicraft/api-schema';
import type {SseErrorEvent, SseEvent} from '@omnicraft/sse-events';
import {z} from 'zod';

import type {LlmConfig} from '../llm-api/index.js';
import {llmSessionSnapshotSchema} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {ToolRegistry} from '../tool/index.js';
import {subagentRecordSchema} from './state/subagent-registry.js';

// ---------------------------------------------------------------------------
// Agent Event Types
// ---------------------------------------------------------------------------

/** All events that the agent can yield to callers. */
export type AgentEvent = Exclude<SseEvent, SseErrorEvent>;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

// ---------------------------------------------------------------------------
// Agent Snapshot Schema (for disk validation)
// ---------------------------------------------------------------------------

const agentSnapshotOptionsSchema = z.object({
  workingDirectory: z.string().optional(),
  thinkingLevel: thinkingLevelSchema,
});

export const agentSnapshotSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  sseEventCount: z.number(),
  llmSession: llmSessionSnapshotSchema,
  options: agentSnapshotOptionsSchema,
  subagents: z.array(subagentRecordSchema).default([]),
});

/** Serializable agent configuration persisted in snapshots. */
export type AgentSnapshotOptions = z.infer<typeof agentSnapshotOptionsSchema>;

/** Serializable snapshot of an Agent, used for persistence. */
export type AgentSnapshot = z.infer<typeof agentSnapshotSchema>;

// ---------------------------------------------------------------------------
// Agent Options
// ---------------------------------------------------------------------------

export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly thinkingLevel: ThinkingLevel;
  readonly getLightConfig?: () => Promise<LlmConfig>;
  readonly workingDirectory?: string;
  readonly sessionsDir?: string;
}
