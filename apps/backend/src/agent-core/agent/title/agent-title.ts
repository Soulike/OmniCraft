import crypto from 'node:crypto';

import type {LlmConfig} from '../../llm-api/index.js';
import {llmApi} from '../../llm-api/index.js';

const TITLE_MAX_LENGTH = 20;

export async function generateTitle(
  userMessage: string,
  getConfig: () => Promise<LlmConfig>,
): Promise<string> {
  try {
    const config = await getConfig();
    const stream = llmApi.streamCompletion({
      config,
      messages: [
        {
          id: crypto.randomUUID(),
          createdAt: Date.now(),
          role: 'user',
          content: [
            'Generate a short title (under 20 characters) for this conversation.',
            'Reply with ONLY the title, no quotes or extra text.',
            '',
            `User: ${userMessage}`,
          ].join('\n'),
        },
      ],
      tools: [],
      thinkingLevel: 'none',
    });

    let title = '';
    for await (const event of stream) {
      if (event.type === 'text-delta') {
        title += event.content;
      }
    }
    return title.trim();
  } catch {
    const trimmed = userMessage.trim();
    return trimmed.length <= TITLE_MAX_LENGTH
      ? trimmed
      : `${trimmed.slice(0, TITLE_MAX_LENGTH)}…`;
  }
}
