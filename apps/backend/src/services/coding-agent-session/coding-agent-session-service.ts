import type {Readable} from 'node:stream';

import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {CodingAgent} from '@/agent/agents/index.js';
import {type AgentSseLogReaderOptions} from '@/agent-core/agent/index.js';
import {CodingAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {getLlmConfig} from './helpers.js';
import type {
  AttachmentDescribeResult,
  AttachmentOpenResult,
  AttachmentRemoveResult,
  AttachmentUploadResult,
  CreateSessionResult,
  SendCompletionResult,
} from './types.js';
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
   * Enqueues a turn once the Agent has claimed the caller-supplied attachment
   * file names. Claiming resolves them against the agent's scratch space,
   * enforces the per-message byte cap, and freezes the files; its failure
   * reasons are this method's own, so they forward unchanged. The agent runs
   * in the background; use {@link subscribe} to read events.
   */
  async sendCompletion(
    agentId: string,
    userMessage: string,
    attachmentFileNames: readonly string[],
  ): Promise<SendCompletionResult> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const claimed = await agent.claimAttachments(attachmentFileNames);
    if (!claimed.ok) return claimed;

    agent.enqueueUserTurn(userMessage, claimed.attachments);
    return {ok: true};
  },

  /**
   * Stores an uploaded attachment. Folds a missing session into the same
   * failure channel as the store's own save failures — see
   * {@link AttachmentUploadResult}.
   */
  async saveAttachment(
    agentId: string,
    desiredName: string,
    body: Readable,
  ): Promise<AttachmentUploadResult> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};
    return agent.saveAttachment(desiredName, body);
  },

  /** Describes a stored attachment. */
  async describeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentDescribeResult> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const descriptor = await agent.describeAttachment(fileName);
    if (descriptor === null) return {ok: false, reason: 'attachment-not-found'};
    return {ok: true, descriptor};
  },

  /**
   * Opens a stored attachment for streaming. The caller owns the handle — the
   * store hands one out precisely so no caller has to resolve a path.
   */
  async openAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentOpenResult> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const opened = await agent.openAttachmentForDownload(fileName);
    if (opened === null) return {ok: false, reason: 'attachment-not-found'};
    return {ok: true, opened};
  },

  /** Deletes a stored attachment. */
  async removeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentRemoveResult> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const removed = await agent.removeAttachment(fileName);
    if (!removed.ok) {
      switch (removed.reason) {
        case 'not-found':
          return {ok: false, reason: 'attachment-not-found'};
        case 'frozen':
          return {ok: false, reason: 'attachment-frozen'};
      }
    }
    return {ok: true};
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

  /**
   * Returns the agent's committed SSE event count, or undefined if the session
   * does not exist. Used to detect a resume cursor that outran a rolled-back log.
   */
  async getSseEventCount(agentId: string): Promise<number | undefined> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.getSseEventCount();
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
