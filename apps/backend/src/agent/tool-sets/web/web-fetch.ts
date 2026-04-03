import {Readability} from '@mozilla/readability';
import {parseHTML} from 'linkedom';
import TurndownService from 'turndown';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';

import {
  MAX_INLINE_SIZE,
  MAX_RESPONSE_SIZE,
  TEMP_DIR,
  TIMEOUT_MS,
  USER_AGENT,
} from './config.js';
import {fetchBody, writeToTempFile} from './helpers.js';
import {validateUrl} from './url-validator.js';

const parameters = z.object({
  url: z.url().describe('The URL to fetch.'),
  includeFullPage: z
    .boolean()
    .optional()
    .describe(
      'Defaults to false. When false, only the main article content is extracted. ' +
        'Set to true to include the full page content if extraction is incomplete or missing information.',
    ),
});

type WebFetchArgs = z.infer<typeof parameters>;

function htmlToMarkdown(
  html: string,
  includeFullPage: boolean,
): {title: string | undefined; content: string; fellBack: boolean} {
  const {document} = parseHTML(html);
  let title: string | undefined;
  let articleDocument: Document = document;
  let fellBack = false;

  if (!includeFullPage) {
    const reader = new Readability(document.cloneNode(true) as Document);
    const article = reader.parse();

    if (article) {
      const articleTitle: string | null | undefined = article.title;
      if (articleTitle != null) {
        title = articleTitle;
      }
      const {document: articleDoc} = parseHTML(article.content);
      articleDocument = articleDoc;
    } else {
      fellBack = true;
    }
  }

  if (title === undefined) {
    const rawTitle: string | null | undefined =
      document.querySelector('title')?.textContent;
    if (rawTitle != null) {
      title = rawTitle;
    }
  }

  const turndown = new TurndownService({headingStyle: 'atx'});
  const articleHtml: string = articleDocument.documentElement.outerHTML;
  const markdown = turndown.turndown(articleHtml);

  return {title, content: markdown, fellBack};
}

function formatResponse(
  url: string,
  title: string | undefined,
  content: string,
  note: string | undefined,
): string {
  const lines: string[] = [`URL: ${url}`];
  if (title) {
    lines.push(`Title: ${title}`);
  }
  if (note) {
    lines.push(`Note: ${note}`);
  }
  lines.push('', content);
  return lines.join('\n');
}

export const webFetchTool: ToolDefinition<typeof parameters> = {
  name: 'web_fetch',
  displayName: 'Web Fetch',
  description:
    'Fetches a URL and returns its content in a readable format. ' +
    'HTML pages are converted to Markdown with article extraction. ' +
    'Other text content (JSON, plain text, XML) is returned as-is.',
  parameters,
  async execute(
    args: WebFetchArgs,
    _context: ToolExecutionContext,
  ): Promise<string> {
    const urlError = validateUrl(args.url);
    if (urlError) return urlError;

    let body: string;
    let contentType: string;
    try {
      const result = await fetchBody(args.url, {
        timeoutMs: TIMEOUT_MS,
        maxResponseSize: MAX_RESPONSE_SIZE,
        headers: new Headers({
          'User-Agent': USER_AGENT,
          Accept: 'text/html, application/json, text/plain, */*',
        }),
      });
      body = result.body;
      contentType = result.contentType;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return `Error: Failed to fetch URL: ${message}`;
    }

    const includeFullPage = args.includeFullPage ?? false;

    let title: string | undefined;
    let content: string;
    let note: string | undefined;

    if (contentType.toLowerCase().includes('text/html')) {
      const result = htmlToMarkdown(body, includeFullPage);
      title = result.title;
      content = result.content;
      if (result.fellBack) {
        note = 'Article extraction failed; showing full page content instead.';
      }
    } else {
      content = body;
    }

    if (Buffer.byteLength(content) > MAX_INLINE_SIZE) {
      let filePath: string;
      try {
        filePath = await writeToTempFile(content, {directory: TEMP_DIR});
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error: Failed to save content to temporary file: ${message}`;
      }
      return formatResponse(
        args.url,
        title,
        `Content saved to file: ${filePath}`,
        note,
      );
    }

    return formatResponse(args.url, title, content, note);
  },
};
