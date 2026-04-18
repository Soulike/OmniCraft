import type {SessionMetadata} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import type {Agent} from '@/agent-core/agent/index.js';

/** Minimal store interface consumed by the agent-session service. */
export interface AgentSessionStore {
  readonly sessionsDir: string;
  get(id: string): Promise<Agent | undefined>;
  has(id: string): Promise<boolean>;
  delete(id: string): Promise<boolean>;
  listSessionMetadata(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}>;
}

/** Constructor signature shared by all top-level agent classes. */
export type AgentConstructor = new (
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
  sessionsDir?: string,
) => Agent;

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
