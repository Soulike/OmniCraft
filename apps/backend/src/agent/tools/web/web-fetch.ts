import {Readability} from '@mozilla/readability';
import {
  TOOL_NAME,
  webFetchParametersSchema,
  webFetchResultSchema,
} from '@omnicraft/tool-schemas';
import {parseHTML} from 'linkedom';
import TurndownService from 'turndown';
import {z} from 'zod';

import type {
  ToolDefinition,
  ToolExecutionContext,
} from '@/agent-core/tool/index.js';
import {writeToTempFile} from '@/helpers/fs.js';

import {
  MAX_INLINE_SIZE,
  MAX_RESPONSE_SIZE,
  TIMEOUT_MS,
  USER_AGENT,
} from './config.js';
import {fetchBody, isTextContentType} from './helpers.js';
import {validateUrl} from './url-validator.js';

const parameters = webFetchParametersSchema;

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

type WebFetchResult = z.infer<typeof webFetchResultSchema>;

export const webFetchTool: ToolDefinition<typeof parameters, WebFetchResult> = {
  name: TOOL_NAME.WEB_FETCH,
  displayName: 'Web Fetch',
  description:
    'Fetches a URL and returns its content in a readable format. ' +
    'HTML pages are converted to Markdown with article extraction. ' +
    'Other text content (JSON, plain text, XML) is returned as-is. ' +
    'Use this when you already know the URL to retrieve, ' +
    'rather than needing to discover information.',
  parameters,
  suppressToolEvents: false,
  compactResult({content, status}) {
    const lines = content.split('\n').filter(Boolean);
    return [`${TOOL_NAME.WEB_FETCH} ${status}`, ...lines.slice(0, 21)].join(
      '\n',
    );
  },
  async execute(args: WebFetchArgs, _context: ToolExecutionContext) {
    const urlError = validateUrl(args.url);
    if (urlError) {
      return {data: {message: urlError}, content: urlError, status: 'failure'};
    }

    let bodyBytes: Buffer;
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
      bodyBytes = result.body;
      contentType = result.contentType;
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        data: {message: `Failed to fetch URL: ${message}`},
        content: `Error: Failed to fetch URL: ${message}`,
        status: 'failure',
      };
    }

    const includeFullPage = args.includeFullPage ?? false;

    let title: string | undefined;
    let content: string;
    let note: string | undefined;

    if (contentType.toLowerCase().includes('text/html')) {
      const body = new TextDecoder().decode(bodyBytes);
      const result = htmlToMarkdown(body, includeFullPage);
      title = result.title;
      content = result.content;
      if (result.fellBack) {
        note = 'Article extraction failed; showing full page content instead.';
      }
    } else if (isTextContentType(contentType)) {
      content = new TextDecoder().decode(bodyBytes);
    } else {
      const message = `Unsupported content type: ${contentType}`;
      return {
        data: {message},
        content: `Error: ${message}`,
        status: 'failure',
      };
    }

    if (Buffer.byteLength(content) > MAX_INLINE_SIZE) {
      let filePath: string;
      try {
        filePath = await writeToTempFile(content, '.md');
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        return {
          data: {
            message: `Failed to save content to temporary file: ${message}`,
          },
          content: `Error: Failed to save content to temporary file: ${message}`,
          status: 'failure',
        };
      }
      const fileMessage = `Content saved to file: ${filePath}`;
      const data: WebFetchResult = {
        url: args.url,
        title,
        content: fileMessage,
      };
      return {
        data,
        content: formatResponse(args.url, title, fileMessage, note),
        status: 'success',
      };
    }

    const data: WebFetchResult = {url: args.url, title, content};
    return {
      data,
      content: formatResponse(args.url, title, content, note),
      status: 'success',
    };
  },
};
