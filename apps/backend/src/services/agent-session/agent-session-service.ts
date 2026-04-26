import {
  AgentType,
  type SessionMetadata,
  type ThinkingLevel,
} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {CodingAgent, MainAgent} from '@/agent/agents/index.js';
import type {
  Agent,
  AgentSseLogReaderOptions,
} from '@/agent-core/agent/index.js';
import {CodingAgentStore, MainAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {getLlmConfig} from './helpers.js';
import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

function getStore(agentType: AgentType) {
  switch (agentType) {
    case AgentType.CHAT:
      return MainAgentStore.getInstance();
    case AgentType.CODING:
      return CodingAgentStore.getInstance();
  }
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

interface CreateSessionOptions {
  workspace?: string;
}

/** Unified service layer for all agent-backed sessions. */
export const agentSessionService = {
  /**
   * Creates a new session for the given agent type.
   * Validates LLM configuration before creating the session.
   * If workspace is provided, validates it against settings.
   */
  async createSession(
    agentType: AgentType,
    options: CreateSessionOptions = {},
  ): Promise<CreateSessionResult> {
    const llmConfig = await getLlmConfig(agentType);

    if (!llmConfig.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!llmConfig.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    if (options.workspace !== undefined) {
      const settings = await SettingsManager.getInstance().getAll();
      const validationError = await validateSessionPaths(
        options.workspace,
        settings.fileAccess.workspaces,
      );
      if (validationError) {
        return {success: false, error: validationError};
      }
    }

    const store = getStore(agentType);
    const sessionsDir = store.sessionsDir;
    let agent: Agent;
    switch (agentType) {
      case AgentType.CHAT:
        agent = new MainAgent(options.workspace, sessionsDir);
        break;
      case AgentType.CODING:
        agent = new CodingAgent(options.workspace, sessionsDir);
        break;
    }
    return {success: true, sessionId: agent.id};
  },

  /**
   * Sends a user message to the agent. The agent runs in the background;
   * use {@link subscribe} to read events. Returns false if agent not found.
   */
  async sendCompletion(
    agentType: AgentType,
    agentId: string,
    userMessage: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<boolean> {
    const agent = await getStore(agentType).get(agentId);
    if (!agent) return false;
    agent.handleUserMessage(userMessage, thinkingLevel);
    return true;
  },

  /**
   * Returns an async iterable of SSE events with resume cursors for the given agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentType: AgentType,
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEventCursorEntry> | undefined> {
    const agent = await getStore(agentType).get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /**
   * Aborts the currently running turn for the given agent.
   * Returns false if agent not found.
   */
  async abortCompletion(
    agentType: AgentType,
    agentId: string,
  ): Promise<boolean> {
    const agent = await getStore(agentType).get(agentId);
    if (!agent) return false;
    agent.abort();
    return true;
  },

  /**
   * Delivers a user response to a waiting client-side tool.
   *
   * @returns `true` if the interaction was found and resolved,
   *          `false` if the agent or interaction does not exist.
   */
  async submitToolResponse(
    agentType: AgentType,
    agentId: string,
    interactionId: string,
    result: unknown,
  ): Promise<boolean> {
    const agent = await getStore(agentType).get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    agentType: AgentType,
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    return getStore(agentType).listSessionMetadata(offset, limit);
  },

  /** Deletes an agent session. Returns false if session not found. */
  async deleteSession(agentType: AgentType, agentId: string): Promise<boolean> {
    const store = getStore(agentType);
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
