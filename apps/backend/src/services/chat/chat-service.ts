import assert from 'node:assert';
import os from 'node:os';

import type {ThinkingLevel} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseEvent} from '@omnicraft/sse-events';

import {MainAgent} from '@/agent/agents/index.js';
import type {AgentSseLogReaderOptions} from '@/agent-core/agent/agent-sse-log.js';
import {logger} from '@/logger.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {
  generateTitleFromLlm,
  getLlmConfig,
  truncateToTitle,
} from './helpers.js';
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
      getLlmConfig,
      workingDirectory,
      resolvedExtraFilePathEntries,
    );
    return {success: true, sessionId: agent.id};
  },

  /**
   * Sends a user message to the agent. The agent runs in the background;
   * use {@link subscribe} to read events. Returns false if agent not found.
   */
  sendCompletion(
    agentId: string,
    userMessage: string,
    thinkingLevel: ThinkingLevel,
  ): boolean {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.handleUserMessage(userMessage, thinkingLevel);
    return true;
  },

  /**
   * Returns an async iterable of SSE events for the given agent.
   * Returns undefined if agent not found.
   */
  subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): AsyncIterable<SseEvent> | undefined {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /**
   * Aborts the currently running turn for the given agent.
   * Returns false if agent not found.
   */
  abortCompletion(agentId: string): boolean {
    const agent = AgentStore.getInstance().get(agentId);
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
  submitToolResponse(
    agentId: string,
    interactionId: string,
    result: unknown,
  ): boolean {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Deletes an agent session. */
  deleteSession(agentId: string): void {
    AgentStore.getInstance().delete(agentId);
  },

  /**
   * Generates a short title for a chat session using the light model.
   * Takes the first user message and assistant reply as context.
   * Stores the title on the agent for persistence.
   * Falls back to truncating the user message if generation fails.
   */
  async generateTitle(
    agentId: string,
    userMessage: string,
    assistantMessage: string,
  ): Promise<string> {
    let title: string;
    try {
      title = await generateTitleFromLlm(userMessage, assistantMessage);
    } catch (e) {
      logger.error(
        {err: e},
        'Failed to generate title via LLM, using fallback',
      );
      title = truncateToTitle(userMessage);
    }

    const agent = AgentStore.getInstance().get(agentId);
    if (agent) {
      agent.title = title;
    }

    return title;
  },
};
