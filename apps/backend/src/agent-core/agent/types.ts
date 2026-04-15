import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import type {SseErrorEvent, SseEvent} from '@omnicraft/sse-events';
import {z} from 'zod';

import type {LlmConfig} from '../llm-api/index.js';
import type {LlmSessionSnapshot} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {AllowedPathEntry} from '../tool/index.js';
import type {ToolRegistry} from '../tool/index.js';

// ---------------------------------------------------------------------------
// Agent Event Types
// ---------------------------------------------------------------------------

/** All events that the agent can yield to callers. */
export type AgentEvent = Exclude<SseEvent, SseErrorEvent>;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

// ---------------------------------------------------------------------------
// Zod Schemas (for snapshot validation)
// ---------------------------------------------------------------------------

const llmToolCallSchema = z.object({
  callId: z.string(),
  toolName: z.string(),
  arguments: z.string(),
});

const llmThinkingBlockSchema = z.object({
  content: z.array(z.string()),
  signature: z.string(),
});

const llmMessageBaseSchema = z.object({
  id: z.string(),
  createdAt: z.number(),
  content: z.string(),
});

const llmUserMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('user'),
});

const llmAssistantMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('assistant'),
  toolCalls: z.array(llmToolCallSchema),
  thinking: z.array(llmThinkingBlockSchema),
});

const llmToolResultMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('tool'),
  callId: z.string(),
});

const llmMessageSchema = z.discriminatedUnion('role', [
  llmUserMessageSchema,
  llmAssistantMessageSchema,
  llmToolResultMessageSchema,
]);

const llmSessionSnapshotSchema = z.object({
  id: z.string(),
  messages: z.array(llmMessageSchema),
});

const agentSnapshotOptionsSchema = z.object({
  workingDirectory: z.string(),
  claudeCodeSessionId: z.string().optional(),
  extraAllowedPaths: z.array(allowedPathEntrySchema).optional(),
});

export const agentSnapshotSchema = z.object({
  id: z.string(),
  title: z.string(),
  sseEventCount: z.number(),
  llmSession: llmSessionSnapshotSchema,
  options: agentSnapshotOptionsSchema,
});

// ---------------------------------------------------------------------------
// Agent Snapshot (for persistence)
// ---------------------------------------------------------------------------

/** Serializable agent configuration persisted in snapshots. */
export interface AgentSnapshotOptions {
  workingDirectory: string;
  /** Claude Agent SDK session ID for resuming Claude Code sessions. */
  claudeCodeSessionId?: string;
  extraAllowedPaths?: readonly AllowedPathEntry[];
}

/** Serializable snapshot of an Agent, used for persistence. */
export interface AgentSnapshot {
  id: string;
  title: string;
  sseEventCount: number;
  llmSession: LlmSessionSnapshot;
  options: AgentSnapshotOptions;
}

// ---------------------------------------------------------------------------
// Agent Options
// ---------------------------------------------------------------------------

export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly getLightConfig?: () => Promise<LlmConfig>;
  readonly workingDirectory: string;
  readonly extraAllowedPaths: readonly AllowedPathEntry[];
  readonly sessionsDir?: string;
}
