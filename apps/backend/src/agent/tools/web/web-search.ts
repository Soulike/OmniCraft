import {
  TOOL_NAME,
  webSearchParametersSchema,
  webSearchResultSchema,
} from '@omnicraft/tool-schemas';
import {tavily, type TavilySearchResponse} from '@tavily/core';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

const parameters = webSearchParametersSchema;

type WebSearchArgs = z.infer<typeof parameters>;
type WebSearchResult = z.infer<typeof webSearchResultSchema>;

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
export const webSearchTool: ToolDefinition<typeof parameters, WebSearchResult> =
  {
    name: TOOL_NAME.WEB_SEARCH,
    displayName: 'Web Search',
    description:
      'Searches the web and returns relevant results with titles, URLs, and content summaries. ' +
      'Use this when the user asks about recent events, external documentation, or anything ' +
      'that may require up-to-date information beyond your training data. ' +
      'Prefer this over guessing when you are unsure about facts.',
    parameters,
    suppressToolEvents: false,
    async execute(args: WebSearchArgs, _context: ToolExecutionContext) {
      // 1. Read API key from settings
      const settings = await SettingsManager.getInstance().getAll();
      const apiKey = settings.search.tavilyApiKey;

      if (!apiKey) {
        return {
          data: {
            message:
              'Tavily API key is not configured. Set it in Settings > Search.',
          },
          content:
            'Error: Tavily API key is not configured. Set it in Settings > Search.',
          status: 'failure',
        };
      }

      // 2. Call Tavily
      let response: TavilySearchResponse;
      try {
        const client = tavily({apiKey});
        response = await client.search(args.query, {
          maxResults: args.maxResults ?? 5,
          includeDomains: args.includeDomains,
          excludeDomains: args.excludeDomains,
          timeRange: args.timeRange,
        });
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          data: {message: `Search failed: ${message}`},
          content: `Error: Search failed: ${message}`,
          status: 'failure',
        };
      }

      // 3. Format response
      if (response.results.length === 0) {
        const data: WebSearchResult = {results: []};
        return {
          data,
          content: `No results found for "${args.query}"`,
          status: 'success',
        };
      }

      const header = `Found ${response.results.length.toString()} results for "${args.query}":`;
      const formatted = response.results
        .map((r, i) => formatResult(i, r))
        .join('\n\n');
      const data: WebSearchResult = {
        results: response.results.map((r) => ({
          title: r.title,
          url: r.url,
          score: r.score,
          content: r.content,
        })),
      };
      return {data, content: `${header}\n\n${formatted}`, status: 'success'};
    },
  };
