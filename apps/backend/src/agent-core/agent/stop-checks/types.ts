import type {AgentRuntimeState} from '../agent-runtime-state.js';

/** Read-only context handed to a stop-check at the turn-end boundary. */
export interface StopCheckContext {
  readonly runtimeState: AgentRuntimeState;
}

/** What a firing stop-check returns: the reminder text plus an optional token
 * identifying the state it observed. */
export interface StopCheckResult {
  /** Reminder text injected to the LLM. */
  readonly content: string;
  /**
   * An opaque token identifying the checked state. The reminder re-fires only
   * when this token changes between turn-end boundaries; an unchanged token is
   * suppressed (the agent saw the reminder and chose to stop anyway). Omit to
   * remind on every boundary.
   */
  readonly stateToken?: string;
}

/**
 * A check evaluated when the agent would end its turn. Returns a result to block
 * the turn from ending (its `content` is injected to the LLM), or null to allow
 * it. May be sync or async; async checks (e.g. shelling out to `git status`) are
 * supported.
 */
export interface StopCheck {
  readonly name: string;
  evaluate(
    ctx: StopCheckContext,
  ): StopCheckResult | null | Promise<StopCheckResult | null>;
}
