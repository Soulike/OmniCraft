import os from 'node:os';
import path from 'node:path';

import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {fetchBody, writeToTempFile} from './helpers.js';
import {validateUrl} from './url-validator.js';

const TIMEOUT_MS = 30_000;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_INLINE_SIZE = 32_768; // 32KB
const TEMP_DIR = path.join(os.tmpdir(), 'omnicraft-web-fetch');
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36';

const parameters = z.object({
  url: z.url().describe('The URL to fetch.'),
});

type WebFetchRawArgs = z.infer<typeof parameters>;

export const webFetchRawTool: ToolDefinition<typeof parameters> = {
  name: 'web_fetch_raw',
  displayName: 'Web Fetch Raw',
  description:
    'Fetches a URL and returns the raw text content with no conversion. ' +
    'Prefer web_fetch for most use cases; only use this tool when you ' +
    'need unprocessed content (e.g., inspecting raw HTML structure).',
  parameters,
  async execute(
    args: WebFetchRawArgs,
    _context: ToolExecutionContext,
  ): Promise<string> {
    const urlError = validateUrl(args.url);
    if (urlError) return urlError;

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
      return `Error: Failed to fetch URL: ${message}`;
    }

    const header = `URL: ${args.url}`;

    if (Buffer.byteLength(body) > MAX_INLINE_SIZE) {
      const filePath = await writeToTempFile(body, {directory: TEMP_DIR});
      return `${header}\nContent saved to file: ${filePath}`;
    }

    return `${header}\n\n${body}`;
  },
};
