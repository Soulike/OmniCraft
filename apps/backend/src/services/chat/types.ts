import type {AgentEventStream} from '@/agent-core/agent/index.js';

/** Reasons why session creation can fail. */
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
}

/** Result of createSession: either success with sessionId, or failure with error. */
export type CreateSessionResult =
  | {success: true; sessionId: string}
  | {success: false; error: CreateSessionError};

/** Result of streamCompletion: the event stream and an abort handle. */
export interface StreamCompletionResult {
  eventStream: AgentEventStream;
  abort: () => void;
}
