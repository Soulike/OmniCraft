import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {CodingAgent} from '@/agent/agents/index.js';
import type {AgentSseLogReaderOptions} from '@/agent-core/agent/index.js';
import {CodingAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {getLlmConfig} from './helpers.js';
import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

/** Service layer for coding-agent sessions. */
export const codingAgentSessionService = {
  /**
   * Creates a new coding session.
   * Validates LLM configuration and the workspace before creating the session.
   */
  async createSession(workspace: string): Promise<CreateSessionResult> {
    const llmConfig = await getLlmConfig();

    if (!llmConfig.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!llmConfig.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    const settings = await SettingsManager.getInstance().getAll();
    const validationError = await validateSessionPaths(
      workspace,
      settings.fileAccess.workspaces,
    );
    if (validationError) {
      return {success: false, error: validationError};
    }

    const store = CodingAgentStore.getInstance();
    const agent = new CodingAgent(workspace, store.sessionsDir);
    return {success: true, sessionId: agent.id};
  },

  /**
   * Sends a user message to the agent. The agent runs in the background;
   * use {@link subscribe} to read events. Returns false if agent not found.
   */
  async sendCompletion(agentId: string, userMessage: string): Promise<boolean> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.enqueueUserTurn(userMessage);
    return true;
  },

  /**
   * Returns an async iterable of SSE events with resume cursors for the agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEventCursorEntry> | undefined> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /** Aborts the currently running turn. Returns false if agent not found. */
  async abortCompletion(agentId: string): Promise<boolean> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.abort();
    return true;
  },

  /**
   * Delivers a user response to a waiting client-side tool.
   * Returns false if the agent or interaction does not exist.
   */
  async submitToolResponse(
    agentId: string,
    interactionId: string,
    result: unknown,
  ): Promise<boolean> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    return CodingAgentStore.getInstance().listSessionMetadata(offset, limit);
  },

  /** Deletes a session. Returns false if session not found. */
  async deleteSession(agentId: string): Promise<boolean> {
    const store = CodingAgentStore.getInstance();
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
