import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {llmApi} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

const FALLBACK_TITLE_MAX_LENGTH = 20;

/** Returns LLM configuration for lightweight tasks, falling back to the main model. */
export async function getLightLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, model, lightModel} = settings.llm;
  return {apiFormat, apiKey, baseUrl, model: lightModel || model};
}

/** Generates a title by calling the light LLM. */
export async function generateTitleFromLlm(
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
export function truncateToTitle(text: string): string {
  const trimmed = text.trim();
  if (trimmed.length <= FALLBACK_TITLE_MAX_LENGTH) return trimmed;
  return `${trimmed.slice(0, FALLBACK_TITLE_MAX_LENGTH)}…`;
}
