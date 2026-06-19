import type {AgentRuntimeState} from '../agent-runtime-state.js';

/** Read-only context handed to a stop-check at the turn-end boundary. */
export interface StopCheckContext {
  readonly runtimeState: AgentRuntimeState;
}

/**
 * A check evaluated when the agent would end its turn. Returns reminder text to
 * block the turn from ending (the text is injected to the LLM), or null to allow
 * it. May be sync or async; async checks (e.g. shelling out to `git status`) are
 * supported.
 */
export interface StopCheck {
  readonly name: string;
  evaluate(ctx: StopCheckContext): string | null | Promise<string | null>;
}
