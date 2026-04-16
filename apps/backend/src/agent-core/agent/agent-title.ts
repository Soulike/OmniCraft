import crypto from 'node:crypto';

import type {LlmConfig, LlmMessage} from '../llm-api/index.js';
import {llmApi} from '../llm-api/index.js';

const TITLE_MAX_LENGTH = 20;

export async function generateTitle(
  messages: readonly LlmMessage[],
  getConfig: () => Promise<LlmConfig>,
): Promise<string> {
  const userMsg = messages.find((m) => m.role === 'user');
  const assistantMsg = messages.find((m) => m.role === 'assistant');
  if (!userMsg || !assistantMsg) return '';

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
            `User: ${userMsg.content}`,
            '',
            `Assistant: ${assistantMsg.content}`,
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
    const trimmed = userMsg.content.trim();
    return trimmed.length <= TITLE_MAX_LENGTH
      ? trimmed
      : `${trimmed.slice(0, TITLE_MAX_LENGTH)}…`;
  }
}
