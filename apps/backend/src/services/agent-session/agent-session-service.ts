import assert from 'node:assert';
import os from 'node:os';

import type {SessionMetadata, ThinkingLevel} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseEvent} from '@omnicraft/sse-events';

import type {AgentSseLogReaderOptions} from '@/agent-core/agent/agent-sse-log.js';
import {SettingsManager} from '@/models/settings-manager/index.js';
import type {AgentType} from '@/types/agent-type.js';

import {getLlmConfig} from './helpers.js';
import type {
  AgentConstructor,
  AgentSessionStore,
  CreateSessionResult,
} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

// ---------------------------------------------------------------------------
// Registry — populated by initServices before the server starts
// ---------------------------------------------------------------------------

interface AgentTypeConfig {
  agentConstructor: AgentConstructor;
  store: AgentSessionStore;
}

const registry = new Map<AgentType, AgentTypeConfig>();

/** Registers an agent type with its constructor and store. Call during init. */
export function registerAgentType(
  type: AgentType,
  agentConstructor: AgentConstructor,
  store: AgentSessionStore,
): void {
  registry.set(type, {agentConstructor, store});
}

function getConfig(type: AgentType): AgentTypeConfig {
  const config = registry.get(type);
  assert(config, `No agent type registered: ${type}`);
  return config;
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: string[];
}

/** Unified service layer for all agent-backed sessions. */
export const agentSessionService = {
  /**
   * Creates a new session for the given agent type.
   * Validates LLM configuration before creating the session.
   * If workspace is provided, validates it against settings; otherwise uses os.tmpdir().
   */
  async createSession(
    agentType: AgentType,
    options: CreateSessionOptions = {},
  ): Promise<CreateSessionResult> {
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

    const {agentConstructor: AgentClass, store} = getConfig(agentType);
    const agent = new AgentClass(
      workingDirectory,
      resolvedExtraFilePathEntries,
      store.sessionsDir,
    );
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
    const {store} = getConfig(agentType);
    const agent = await store.get(agentId);
    if (!agent) return false;
    agent.handleUserMessage(userMessage, thinkingLevel);
    return true;
  },

  /**
   * Returns an async iterable of SSE events for the given agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentType: AgentType,
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEvent> | undefined> {
    const {store} = getConfig(agentType);
    const agent = await store.get(agentId);
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
    const {store} = getConfig(agentType);
    const agent = await store.get(agentId);
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
    const {store} = getConfig(agentType);
    const agent = await store.get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    agentType: AgentType,
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    const {store} = getConfig(agentType);
    return store.listSessionMetadata(offset, limit);
  },

  /** Deletes an agent session. Returns false if session not found. */
  async deleteSession(agentType: AgentType, agentId: string): Promise<boolean> {
    const {store} = getConfig(agentType);
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
