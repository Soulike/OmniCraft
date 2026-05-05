/** Options for fetchBody. */
export interface FetchBodyOptions {
  readonly timeoutMs: number;
  readonly maxResponseSize: number;
  readonly headers: Headers;
}

/** Successful fetch result. */
export interface FetchBodyResult {
  readonly body: Buffer;
  readonly contentType: string;
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

/** Returns true if the Content-Type is application/pdf. */
export function isPdfContentType(contentType: string): boolean {
  return contentType.toLowerCase().includes('application/pdf');
}

/**
 * Fetches a URL and returns the raw response bytes plus Content-Type.
 * Throws on network errors, non-2xx status, missing Content-Type,
 * or responses exceeding the size limit. Does NOT filter by content type
 * or decode bytes — callers handle conversion.
 */
export async function fetchBody(
  url: string,
  options: FetchBodyOptions,
): Promise<FetchBodyResult> {
  const abortController = new AbortController();
  const timeoutId = setTimeout(() => {
    abortController.abort(new Error('Request timed out'));
  }, options.timeoutMs);

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

  const contentLength = response.headers.get('content-length');
  if (contentLength && parseInt(contentLength, 10) > options.maxResponseSize) {
    clearTimeout(timeoutId);
    throw new Error(
      `Response too large (exceeds ${(options.maxResponseSize / 1024 / 1024).toString()}MB limit)`,
    );
  }

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

  return {body: Buffer.concat(chunks), contentType};
}
