import os from 'node:os';

import {CoreAgent} from '@/agent/agents/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {llmApi} from '@/agent-core/llm-api/index.js';
import {logger} from '@/logger.js';
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

const FALLBACK_TITLE_MAX_LENGTH = 20;

/** Generates a title by calling the light LLM. */
async function generateTitleFromLlm(
  userMessage: string,
  assistantMessage: string,
): Promise<string> {
  const config = await getLightLlmConfig();
  const stream = llmApi.streamCompletion({
    config,
    messages: [
      {
        role: 'user',
        content: [
          'Generate a short title (under 20 characters) for this conversation.',
          'Reply with ONLY the title, no quotes or extra text.',
          '',
          `User: ${userMessage}`,
          '',
          `Assistant: ${assistantMessage}`,
        ].join('\n'),
      },
    ],
    tools: [],
  });

  let title = '';
  for await (const event of stream) {
    if (event.type === 'text-delta') {
      title += event.content;
    }
  }
  return title.trim();
}

/** Truncates a user message to use as a fallback title. */
function truncateToTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= FALLBACK_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, FALLBACK_TITLE_MAX_LENGTH)}…`;
}
