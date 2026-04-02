import type {LlmSessionSnapshot} from '../llm-session/index.js';
import type {LlmSessionTextDeltaEvent} from '../llm-session/index.js';
import type {SkillRegistry} from '../skill/index.js';
import type {ToolRegistry} from '../tool/index.js';
import type {ToolSetRegistry} from '../tool-set/index.js';

// ---------------------------------------------------------------------------
// Agent Event Types
// ---------------------------------------------------------------------------

/** The agent has started executing a tool call. */
export interface AgentToolExecuteStartEvent {
  type: 'tool-execute-start';
  callId: string;
  toolName: string;
  displayName: string;
  arguments: string;
}

/** The agent has finished executing a tool call. */
export interface AgentToolExecuteEndEvent {
  type: 'tool-execute-end';
  callId: string;
  result: string;
  isError: boolean;
}

/** The agent has finished processing a user message. */
export interface AgentDoneEvent {
  type: 'done';
  reason: 'complete' | 'max_rounds_reached';
}

/** All events that the agent can yield to callers. */
export type AgentEvent =
  | LlmSessionTextDeltaEvent
  | AgentToolExecuteStartEvent
  | AgentToolExecuteEndEvent
  | AgentDoneEvent;

/** An async generator that yields agent streaming events. */
export type AgentEventStream = AsyncGenerator<AgentEvent, void, undefined>;

// ---------------------------------------------------------------------------
// Agent Snapshot (for persistence)
// ---------------------------------------------------------------------------

/** Serializable agent configuration persisted in snapshots. */
export interface AgentSnapshotOptions {
  workingDirectory: string;
}

/** Serializable snapshot of an Agent, used for persistence. */
export interface AgentSnapshot {
  id: string;
  llmSession: LlmSessionSnapshot;
  options: AgentSnapshotOptions;
}

// ---------------------------------------------------------------------------
// Agent Options
// ---------------------------------------------------------------------------

export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly toolSetRegistries: ToolSetRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly workingDirectory: string;
}
