import type {Readable} from 'node:stream';

import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {MainAgent} from '@/agent/agents/index.js';
import {
  type AgentSseLogReaderOptions,
  MAX_MESSAGE_ATTACHMENT_BYTES,
} from '@/agent-core/agent/index.js';
import {MainAgentStore} from '@/models/agent-store/index.js';

import {getLlmConfig} from './helpers.js';
import type {
  AttachmentDescribeResult,
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

    const store = MainAgentStore.getInstance();
    const agent = new MainAgent(undefined, store.sessionsDir);
    return {success: true, sessionId: agent.id};
  },

  /**
   * Claims the caller-supplied attachment file names against this agent's
   * scratch space, enforces the per-message byte cap, and — once both checks
   * pass — enqueues the turn. The agent runs in the background; use
   * {@link subscribe} to read events.
   *
   * Claiming freezes the files, so a turn rejected by the cap below can still
   * leave attachments read-only. That is deliberate; see
   * {@link Agent.claimAttachments}.
   */
  async sendCompletion(
    agentId: string,
    userMessage: string,
    attachmentFileNames: readonly string[],
  ): Promise<SendCompletionResult> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const resolved = await agent.claimAttachments(attachmentFileNames);
    if (!resolved.ok) {
      return {
        ok: false,
        reason: 'unknown-attachments',
        missing: resolved.missing,
      };
    }

    const totalBytes = resolved.attachments.reduce(
      (total, attachment) => total + attachment.byteSize,
      0,
    );
    if (totalBytes > MAX_MESSAGE_ATTACHMENT_BYTES) {
      return {
        ok: false,
        reason: 'attachments-too-large',
        totalBytes,
        limit: MAX_MESSAGE_ATTACHMENT_BYTES,
      };
    }

    agent.enqueueUserTurn(userMessage, resolved.attachments);
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
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};
    return agent.saveAttachment(desiredName, body);
  },

  /** Describes a stored attachment. */
  async describeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentDescribeResult> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const descriptor = await agent.describeAttachment(fileName);
    if (descriptor === null) return {ok: false, reason: 'attachment-not-found'};
    return {ok: true, descriptor};
  },

  /** Deletes a stored attachment. */
  async removeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentRemoveResult> {
    const agent = await MainAgentStore.getInstance().get(agentId);
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
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.subscribe(options);
  },

  /**
   * Returns the agent's committed SSE event count, or undefined if the session
   * does not exist. Used to detect a resume cursor that outran a rolled-back log.
   */
  async getSseEventCount(agentId: string): Promise<number | undefined> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.getSseEventCount();
  },

  /** Aborts the currently running turn. Returns false if agent not found. */
  async abortCompletion(agentId: string): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
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
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    return agent.submitUserResponse(interactionId, result);
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
    const store = MainAgentStore.getInstance();
    if (!(await store.has(agentId))) return false;
    await store.delete(agentId);
    return true;
  },
};
