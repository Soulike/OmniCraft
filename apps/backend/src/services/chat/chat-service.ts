import os from 'node:os';

import {CoreAgent} from '@/agent/agents/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {settingsService} from '@/services/settings/index.js';

import type {CreateSessionResult, StreamCompletionResult} from './types.js';
import {CreateSessionError} from './types.js';

/** Returns the current LLM configuration from settings. */
async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model} = settings.llm;
  return {apiFormat, apiKey, baseUrl, model};
}

/** Returns LLM configuration for lightweight tasks, falling back to the main model. */
export async function getLightLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model, lightModel} = settings.llm;
  return {apiFormat, apiKey, baseUrl, model: lightModel || model};
}

/** Service layer for chat operations. */
export const chatService = {
  /**
   * Creates a new Agent Session with a CoreAgent.
   * Validates LLM configuration before creating the session.
   */
  async createSession(): Promise<CreateSessionResult> {
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

    const agent = new CoreAgent(getLlmConfig, os.tmpdir());
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
};
