import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecuteResult,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {writeToTempFile} from '@/helpers/fs.js';

import {
  MAX_INLINE_SIZE,
  MAX_RESPONSE_SIZE,
  TIMEOUT_MS,
  USER_AGENT,
} from './config.js';
import {fetchBody} from './helpers.js';
import {validateUrl} from './url-validator.js';
import {webFetchTool} from './web-fetch.js';

const parameters = z.object({
  url: z.url().describe('The URL to fetch.'),
});

type WebFetchRawArgs = z.infer<typeof parameters>;

export const webFetchRawTool: ToolDefinition<typeof parameters> = {
  name: 'web_fetch_raw',
  displayName: 'Web Fetch Raw',
  description:
    'Fetches a URL and returns the raw text content with no conversion. ' +
    `Prefer ${webFetchTool.name} for most use cases; only use this tool when you ` +
    'need unprocessed content (e.g., inspecting raw HTML structure).',
  parameters,
  async execute(
    args: WebFetchRawArgs,
    _context: ToolExecutionContext,
  ): Promise<ToolExecuteResult> {
    const urlError = validateUrl(args.url);
    if (urlError) return {content: urlError, status: 'failure'};

    let body: string;
    try {
      const result = await fetchBody(args.url, {
        timeoutMs: TIMEOUT_MS,
        maxResponseSize: MAX_RESPONSE_SIZE,
        headers: new Headers({
          'User-Agent': USER_AGENT,
          Accept: '*/*',
        }),
      });
      body = result.body;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        content: `Error: Failed to fetch URL: ${message}`,
        status: 'failure',
      };
    }

    const header = `URL: ${args.url}`;

    if (Buffer.byteLength(body) > MAX_INLINE_SIZE) {
      let filePath: string;
      try {
        filePath = await writeToTempFile(body, '.md');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          content: `Error: Failed to save content to temporary file: ${message}`,
          status: 'failure',
        };
      }
      return {
        content: `${header}\nContent saved to file: ${filePath}`,
        status: 'success',
      };
    }

    return {content: `${header}\n\n${body}`, status: 'success'};
  },
};
