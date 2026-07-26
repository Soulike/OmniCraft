import type {Readable} from 'node:stream';

import type {SessionMetadata} from '@omnicraft/api-schema';
import type {SseEventCursorEntry} from '@omnicraft/sse-events';

import {CodingAgent} from '@/agent/agents/index.js';
import {
  type AgentSseLogReaderOptions,
  type AttachmentDescriptor,
  MAX_MESSAGE_ATTACHMENT_BYTES,
  type SaveAttachmentResult,
} from '@/agent-core/agent/index.js';
import {CodingAgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {getLlmConfig} from './helpers.js';
import type {CreateSessionResult, SendCompletionResult} from './types.js';
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
   * Resolves the caller-supplied attachment file names against this agent's
   * scratch space, enforces the per-message byte cap, and — once both checks
   * pass — enqueues the turn. The agent runs in the background; use
   * {@link subscribe} to read events.
   */
  async sendCompletion(
    agentId: string,
    userMessage: string,
    attachmentFileNames: readonly string[],
  ): Promise<SendCompletionResult> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return {ok: false, reason: 'session-not-found'};

    const resolved = await agent.resolveAttachments(attachmentFileNames);
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

  /** Stores an uploaded attachment. Returns `null` if agent not found. */
  async saveAttachment(
    agentId: string,
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult | null> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return null;
    return agent.saveAttachment(desiredName, body);
  },

  /** Describes a stored attachment. Returns `null` if agent or file not found. */
  async describeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<AttachmentDescriptor | null> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return null;
    return agent.describeAttachment(fileName);
  },

  /**
   * Deletes a stored attachment. Returns `null` if agent not found, otherwise
   * whether the file existed.
   */
  async removeAttachment(
    agentId: string,
    fileName: string,
  ): Promise<boolean | null> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return null;
    return agent.removeAttachment(fileName);
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
