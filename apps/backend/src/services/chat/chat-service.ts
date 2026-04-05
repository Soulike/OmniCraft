import assert from 'node:assert';
import os from 'node:os';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {CoreAgent} from '@/agent/agents/index.js';
import {logger} from '@/logger.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {
  generateTitleFromLlm,
  getLlmConfig,
  truncateToTitle,
} from './helpers.js';
import type {CreateSessionResult, StreamCompletionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: string[];
}

/** Service layer for chat operations. */
export const chatService = {
  /**
   * Creates a new Agent Session with a CoreAgent.
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

    let workingDirectory = os.tmpdir();
    let resolvedExtraPaths: readonly AllowedPathEntry[] = [];

    if (options.workspace) {
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

      workingDirectory = options.workspace;
      resolvedExtraPaths = (options.extraAllowedPaths ?? []).map((p) => {
        const entry = allowedPaths.find((e) => e.path === p);
        assert(entry, `Extra path not found in allowed paths: ${p}`);
        return entry;
      });
    }

    const agent = new CoreAgent(
      getLlmConfig,
      workingDirectory,
      resolvedExtraPaths,
    );
    return {success: true, sessionId: agent.id};
  },

  /**
   * Streams a completion for the given agent.
   * Returns undefined if the agent does not exist.
   */
  streamCompletion(
    agentId: string,
    userMessage: string,
  ): StreamCompletionResult | undefined {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    const abortController = new AbortController();
    const eventStream = agent.handleUserMessage(
      userMessage,
      abortController.signal,
    );
    return {
      eventStream,
      abort: () => {
        abortController.abort();
      },
    };
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
