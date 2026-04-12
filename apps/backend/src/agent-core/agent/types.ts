import type {SseErrorEvent, SseEvent} from '@omnicraft/sse-events';

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
// Agent Snapshot (for persistence)
// ---------------------------------------------------------------------------

/** Serializable agent configuration persisted in snapshots. */
export interface AgentSnapshotOptions {
  workingDirectory: string;
  /** Claude Agent SDK session ID for resuming CodingSubAgent sessions. */
  codingSessionId?: string;
}

/** Serializable snapshot of an Agent, used for persistence. */
export interface AgentSnapshot {
  id: string;
  title: string;
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
  readonly workingDirectory: string;
  readonly extraAllowedPaths: readonly AllowedPathEntry[];
}
