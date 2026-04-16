import assert from 'node:assert';
import os from 'node:os';

import type {SessionMetadata, ThinkingLevel} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseEvent} from '@omnicraft/sse-events';

import {MainAgent} from '@/agent/agents/index.js';
import type {AgentSseLogReaderOptions} from '@/agent-core/agent/agent-sse-log.js';
import {MainAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {getLlmConfig} from './helpers.js';
import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: string[];
}

/** Service layer for chat operations. */
export const chatService = {
  /**
   * Creates a new Agent Session with a MainAgent.
   * Validates LLM configuration before creating the session.
   * If workspace is provided, validates it against settings; otherwise uses os.tmpdir().
   */
  async createSession(
    options: CreateSessionOptions = {},
  ): Promise<CreateSessionResult> {
    const config = await getLlmConfig();

    if (!config.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!config.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    const hasWorkspace = options.workspace !== undefined;
    const hasExtraAllowedPaths =
      options.extraAllowedPaths !== undefined &&
      options.extraAllowedPaths.length > 0;
    let workingDirectory = os.tmpdir();
    let resolvedExtraFilePathEntries: readonly AllowedPathEntry[] = [];

    if (hasWorkspace || hasExtraAllowedPaths) {
      const settings = await SettingsManager.getInstance().getAll();
      const allowedPaths = settings.fileAccess.allowedPaths;

      const validationError = await validateSessionPaths(
        options.workspace,
        options.extraAllowedPaths ?? [],
        allowedPaths,
      );

      if (validationError) {
        return {success: false, error: validationError};
      }

      if (options.workspace) {
        workingDirectory = options.workspace;
      }

      resolvedExtraFilePathEntries = (options.extraAllowedPaths ?? []).map(
        (p) => {
          const entry = allowedPaths.find((e) => e.path === p);
          assert(entry, `Extra path not found in allowed paths: ${p}`);
          return entry;
        },
      );
    }

    const agent = new MainAgent(
      workingDirectory,
      resolvedExtraFilePathEntries,
      MainAgentStore.getInstance().sessionsDir,
    );
    return {success: true, sessionId: agent.id};
  },

  /**
   * Sends a user message to the agent. The agent runs in the background;
   * use {@link subscribe} to read events. Returns false if agent not found.
   */
  async sendCompletion(
    agentId: string,
    userMessage: string,
    thinkingLevel: ThinkingLevel,
  ): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.handleUserMessage(userMessage, thinkingLevel);
    return true;
  },

  /**
   * Returns an async iterable of SSE events for the given agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEvent> | undefined> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /**
   * Aborts the currently running turn for the given agent.
   * Returns false if agent not found.
   */
  async abortCompletion(agentId: string): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
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
    agentId: string,
    interactionId: string,
    result: unknown,
  ): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    const all = await MainAgentStore.getInstance().listSessionMetadata();
    return {sessions: all.slice(offset, offset + limit), total: all.length};
  },

  /** Deletes an agent session. Returns false if session not found. */
  async deleteSession(agentId: string): Promise<boolean> {
    const store = MainAgentStore.getInstance();
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
