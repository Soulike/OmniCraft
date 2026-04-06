import {tavily, type TavilySearchResponse} from '@tavily/core';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

const parameters = z.object({
  query: z.string().describe('Search keywords.'),
  maxResults: z
    .number()
    .int()
    .min(1)
    .max(20)
    .optional()
    .describe('Number of results to return. Defaults to 5.'),
  includeDomains: z
    .array(z.string())
    .optional()
    .describe('Only search these domains.'),
  excludeDomains: z
    .array(z.string())
    .optional()
    .describe('Exclude these domains from results.'),
});

type WebSearchArgs = z.infer<typeof parameters>;

/** Formats a single search result for LLM consumption. */
function formatResult(
  index: number,
  result: TavilySearchResponse['results'][number],
): string {
  return [
    `[${(index + 1).toString()}] ${result.title}`,
    `URL: ${result.url}`,
    `Score: ${result.score.toString()}`,
    result.content,
  ].join('\n');
}

/** Tool that searches the web via Tavily. */
export const webSearchTool: ToolDefinition<typeof parameters> = {
  name: 'web_search',
  displayName: 'Web Search',
  description:
    'Searches the web and returns relevant results with titles, URLs, and content summaries. ' +
    'Use this when the user asks about recent events, external documentation, or anything ' +
    'that may require up-to-date information beyond your training data. ' +
    'Prefer this over guessing when you are unsure about facts.',
  parameters,
  async execute(
    args: WebSearchArgs,
    _context: ToolExecutionContext,
  ): Promise<string> {
    // 1. Read API key from settings
    const settings = await SettingsManager.getInstance().getAll();
    const apiKey = settings.search.tavilyApiKey;

    if (!apiKey) {
      return 'Error: Tavily API key is not configured. Set it in Settings > Search.';
    }

    // 2. Call Tavily
    let response: TavilySearchResponse;
    try {
      const client = tavily({apiKey});
      response = await client.search(args.query, {
        maxResults: args.maxResults ?? 5,
        includeDomains: args.includeDomains,
        excludeDomains: args.excludeDomains,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Search failed: ${message}`;
    }

    // 3. Format response
    if (response.results.length === 0) {
      return `No results found for "${args.query}"`;
    }

    const header = `Found ${response.results.length.toString()} results for "${args.query}":`;
    const formatted = response.results
      .map((r, i) => formatResult(i, r))
      .join('\n\n');
    return `${header}\n\n${formatted}`;
  },
};
