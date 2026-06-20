import type {TodoItem} from '../state/todo-store.js';

/**
 * The narrow, read-only slice of agent runtime state a stop-check may read.
 * Deliberately excludes mutators (e.g. the de-dup token map) so a check cannot
 * corrupt turn-runner state. `AgentRuntimeState` satisfies this structurally.
 */
export interface StopCheckRuntimeView {
  listTodos(): TodoItem[];
  readonly todoVersion: number;
}

/** Read-only context handed to a stop-check at the turn-end boundary. */
export interface StopCheckContext {
  readonly runtimeState: StopCheckRuntimeView;
}

/** What a firing stop-check returns: the reminder text plus an optional token
 * identifying the state it observed. */
export interface StopCheckResult {
  /** Reminder text injected to the LLM. Should be non-empty; a check with
   *  nothing to say should return `null` instead. An empty string is treated
   *  as "did not fire" by the turn runner (no reminder is emitted). */
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
