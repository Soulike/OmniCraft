/** SSE field prefix for data payloads. */
const SSE_DATA_PREFIX = 'data: ';

/** SSE events are separated by double newlines. */
const SSE_EVENT_DELIMITER = '\n\n';

/**
 * Valid SSE field prefixes per the Server-Sent Events specification.
 * Any non-empty line that doesn't start with one of these is malformed.
 */
const VALID_SSE_PREFIXES = [SSE_DATA_PREFIX, 'event:', 'id:', 'retry:', ':'];

function isSseFieldValid(line: string): boolean {
  return VALID_SSE_PREFIXES.some((prefix) => line.startsWith(prefix));
}

/**
 * Parses an SSE stream from a fetch Response into raw data strings.
 *
 * Handles buffering across chunk boundaries and extracts the string
 * after the `data: ` prefix for each event. Callers are responsible
 * for further parsing (e.g., JSON).
 */
export async function* parseSseStream(
  response: Response,
): AsyncGenerator<string, void, undefined> {
  const body = response.body;
  if (!body) {
    throw new Error('Response body is null');
  }

  const textStream = body.pipeThrough(new TextDecoderStream());
  const lineReader = textStream.getReader();

  // Buffer for incomplete SSE events across read() calls.
  // A single read() may not align with SSE event boundaries (\n\n),
  // so we accumulate data and only process complete events.
  let buffer = '';

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
  while (true) {
    const {done, value} = await lineReader.read();
    if (done) break;

    buffer += value;
    const parts = buffer.split(SSE_EVENT_DELIMITER);
    buffer = parts.pop() ?? '';

    for (const part of parts) {
      const trimmed = part.trim();
      if (trimmed === '') continue;

      if (!isSseFieldValid(trimmed)) {
        throw new Error(`Malformed SSE event: ${trimmed}`);
      }

      if (!trimmed.startsWith(SSE_DATA_PREFIX)) continue;

      yield trimmed.slice(SSE_DATA_PREFIX.length);
    }
  }
}
