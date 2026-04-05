import type {AgentEventStream} from '@/agent-core/agent/index.js';

/** Reasons why session creation can fail. */
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
  WORKSPACE_PATH_NOT_FOUND = 'WORKSPACE_PATH_NOT_FOUND',
  WORKSPACE_PATH_NOT_DIRECTORY = 'WORKSPACE_PATH_NOT_DIRECTORY',
  WORKSPACE_PATH_NOT_ACCESSIBLE = 'WORKSPACE_PATH_NOT_ACCESSIBLE',
  WORKSPACE_NOT_IN_ALLOWED_PATHS = 'WORKSPACE_NOT_IN_ALLOWED_PATHS',
  WORKSPACE_NOT_READ_WRITE = 'WORKSPACE_NOT_READ_WRITE',
  EXTRA_PATH_NOT_FOUND = 'EXTRA_PATH_NOT_FOUND',
  EXTRA_PATH_NOT_DIRECTORY = 'EXTRA_PATH_NOT_DIRECTORY',
  EXTRA_PATH_NOT_ACCESSIBLE = 'EXTRA_PATH_NOT_ACCESSIBLE',
  EXTRA_PATH_NOT_IN_ALLOWED_PATHS = 'EXTRA_PATH_NOT_IN_ALLOWED_PATHS',
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
