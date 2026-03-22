import type {AgentEventStream} from '@/agents/index.js';
import {SimpleAgent} from '@/agents/index.js';
import type {LlmConfig} from '@/api/llm/index.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {settingsService} from '@/services/settings/index.js';

import type {CreateSessionResult} from './types.js';
import {CreateSessionError} from './types.js';

/** Returns the current LLM configuration from settings. */
async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model} = settings.llm;
  return {apiFormat, apiKey, baseUrl, model};
}

/** Service layer for chat operations. */
export const chatService = {
  /**
   * Creates a new Agent Session with a SimpleAgent.
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

    const agent = new SimpleAgent(getLlmConfig);
    return {success: true, sessionId: agent.id};
  },

  /**
   * Streams a completion for the given agent.
   * Returns undefined if the agent does not exist.
   */
  streamCompletion(
    agentId: string,
    userMessage: string,
  ): AgentEventStream | undefined {
    const agent = AgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.handleUserMessage(userMessage);
  },

  /** Deletes an agent session. */
  deleteSession(agentId: string): void {
    AgentStore.getInstance().delete(agentId);
  },
};
