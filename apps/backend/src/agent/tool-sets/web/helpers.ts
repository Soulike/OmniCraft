import fs from 'node:fs/promises';
import path from 'node:path';

/** Options for fetchBody. */
export interface FetchBodyOptions {
  readonly timeoutMs: number;
  readonly maxResponseSize: number;
  readonly headers: Headers;
}

/** Successful fetch result. */
export interface FetchBodyResult {
  readonly body: string;
  readonly contentType: string;
}

/** Options for writeToTempFile. */
export interface WriteToTempFileOptions {
  readonly directory: string;
}

/** Returns true if the Content-Type indicates a text-based format. */
export function isTextContentType(contentType: string): boolean {
  const ct = contentType.toLowerCase();
  return (
    ct.startsWith('text/') ||
    ct.includes('application/json') ||
    ct.includes('application/xml') ||
    ct.includes('application/javascript') ||
    ct.includes('+xml') ||
    ct.includes('+json')
  );
}

/**
 * Fetches a URL and returns the response body as text.
 * Throws on network errors, non-2xx status, non-text content types,
 * or responses exceeding the size limit.
 */
export async function fetchBody(
  url: string,
  options: FetchBodyOptions,
): Promise<FetchBodyResult> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(
    () => { abortController.abort(new Error('Request timed out')); },
    options.timeoutMs,
  );

  let response: Response;
  try {
    response = await fetch(url, {
      signal: abortController.signal,
      headers: options.headers,
    });
  } catch (error: unknown) {
    clearTimeout(timeoutId);
    throw error;
  }

  if (!response.ok) {
    clearTimeout(timeoutId);
    throw new Error(
      `HTTP ${response.status.toString()} ${response.statusText}`,
    );
  }

  const contentType = response.headers.get('content-type');
  if (!contentType) {
    clearTimeout(timeoutId);
    throw new Error('Response has no Content-Type header');
  }
  if (!isTextContentType(contentType)) {
    clearTimeout(timeoutId);
    throw new Error(`Unsupported content type: ${contentType}`);
  }

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > options.maxResponseSize) {
    clearTimeout(timeoutId);
    throw new Error(
      `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
    );
  }

  // Stream body and enforce size limit
  if (!response.body) {
    clearTimeout(timeoutId);
    throw new Error('Response body is not readable');
  }

  const reader = response.body;
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    for await (const chunk of reader) {
      totalBytes += chunk.byteLength;
      if (totalBytes > options.maxResponseSize) {
        throw new Error(
          `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
        );
      }
      chunks.push(chunk);
    }
  } catch (error: unknown) {
    abortController.abort();
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }

  const body = new TextDecoder().decode(Buffer.concat(chunks));

  return {body, contentType};
}

/** Writes content to a temporary file and returns the absolute file path. */
export async function writeToTempFile(
  content: string,
  options: WriteToTempFileOptions,
): Promise<string> {
  await fs.mkdir(options.directory, {recursive: true});
  const filePath = path.join(options.directory, `${crypto.randomUUID()}.md`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}
