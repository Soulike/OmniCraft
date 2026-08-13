import type {Readable} from 'node:stream';

import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {type AgentSseLogReaderOptions} from '@/agent-core/agent/index.js';
import {MainAgentStore} from '@/models/agent-store/index.js';

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

/** Service layer for chat-agent sessions. */
export const chatAgentSessionService = {
  /**
   * Creates a new chat session.
   * Validates LLM configuration before creating the session.
   */
  async createSession(): Promise<CreateSessionResult> {
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

    const sessionId = MainAgentStore.getInstance().createAgent();
    return {success: true, sessionId};
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
    const result = await MainAgentStore.getInstance().runAgentOperation(
      agentId,
      async (agent): Promise<SendCompletionResult> => {
        const claimed = await agent.claimAttachments(attachmentFileNames);
        if (!claimed.ok) return claimed;

        agent.enqueueUserTurn(userMessage, claimed.attachments);
        return {ok: true};
      },
    );
    return result ?? {ok: false, reason: 'session-not-found'};
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
    const result = await MainAgentStore.getInstance().runAgentOperation(
      agentId,
      (agent) => agent.saveAttachment(desiredName, body),
    );
    return result ?? {ok: false, reason: 'session-not-found'};
  },

  /** Describes a stored attachment. */
  async describeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentDescribeResult> {
    const result = await MainAgentStore.getInstance().runAgentOperation(
      agentId,
      async (agent): Promise<AttachmentDescribeResult> => {
        const descriptor = await agent.describeAttachment(fileName);
        if (descriptor === null) {
          return {ok: false, reason: 'attachment-not-found'};
        }
        return {ok: true, descriptor};
      },
    );
    return result ?? {ok: false, reason: 'session-not-found'};
  },

  /**
   * Opens a stored attachment for streaming. The caller owns the handle — the
   * store hands one out precisely so no caller has to resolve a path.
   */
  async openAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentOpenResult> {
    const result = await MainAgentStore.getInstance().runAgentOperation(
      agentId,
      async (agent): Promise<AttachmentOpenResult> => {
        const opened = await agent.openAttachmentForDownload(fileName);
        if (opened === null) {
          return {ok: false, reason: 'attachment-not-found'};
        }
        return {ok: true, opened};
      },
    );
    return result ?? {ok: false, reason: 'session-not-found'};
  },

  /** Deletes a stored attachment. */
  async removeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentRemoveResult> {
    const result = await MainAgentStore.getInstance().runAgentOperation(
      agentId,
      async (agent): Promise<AttachmentRemoveResult> => {
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
    );
    return result ?? {ok: false, reason: 'session-not-found'};
  },

  /**
   * Returns an async iterable of SSE events with resume cursors for the agent.
   * Returns undefined if agent not found.
   */
  async subscribe(
    agentId: string,
    options?: AgentSseLogReaderOptions,
  ): Promise<AsyncIterable<SseEventCursorEntry> | undefined> {
    return MainAgentStore.getInstance().runAgentOperation(agentId, (agent) =>
      agent.subscribe(options),
    );
  },

  /**
   * Returns the agent's committed SSE event count, or undefined if the session
   * does not exist. Used to detect a resume cursor that outran a rolled-back log.
   */
  async getSseEventCount(agentId: string): Promise<number | undefined> {
    return MainAgentStore.getInstance().runAgentOperation(agentId, (agent) =>
      agent.getSseEventCount(),
    );
  },

  /** Aborts the currently running turn. Returns false if agent not found. */
  async abortCompletion(agentId: string): Promise<boolean> {
    return (
      (await MainAgentStore.getInstance().runAgentOperation(
        agentId,
        (agent) => {
          agent.abort();
          return true;
        },
      )) ?? false
    );
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
    return (
      (await MainAgentStore.getInstance().runAgentOperation(agentId, (agent) =>
        agent.submitUserResponse(interactionId, result),
      )) ?? false
    );
  },

  /** Lists persisted sessions with pagination. */
  async listSessions(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    return MainAgentStore.getInstance().listSessionMetadata(offset, limit);
  },

  /** Deletes a session. Returns false if session not found. */
  async deleteSession(agentId: string): Promise<boolean> {
    return MainAgentStore.getInstance().delete(agentId);
  },
};
