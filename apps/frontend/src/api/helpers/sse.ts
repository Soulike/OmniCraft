/** SSE field prefix for data payloads (with the conventional trailing space). */
const SSE_DATA_PREFIX = 'data: ';

/** SSE events are separated by double newlines. */
const SSE_EVENT_DELIMITER = '\n\n';

/**
 * Valid SSE field prefixes per the Server-Sent Events specification.
 * Any non-empty line that doesn't start with one of these is malformed.
 * Note: `data:` without a trailing space is also valid per spec.
 */
const VALID_SSE_PREFIXES = ['data:', 'event:', 'id:', 'retry:', ':'];

/** Maximum characters of a malformed line to include in the error message. */
const MAX_ERROR_PREVIEW_LENGTH = 120;

function isSseLineValid(line: string): boolean {
  return VALID_SSE_PREFIXES.some((prefix) => line.startsWith(prefix));
}

/**
 * Validates that every non-empty line in a block starts with a known SSE
 * field prefix. Throws if any line is malformed.
 */
function validateSseBlock(block: string): void {
  for (const line of block.split('\n')) {
    const trimmedLine = line.trim();
    if (trimmedLine === '') continue;

    if (!isSseLineValid(trimmedLine)) {
      const preview =
        trimmedLine.length > MAX_ERROR_PREVIEW_LENGTH
          ? `${trimmedLine.slice(0, MAX_ERROR_PREVIEW_LENGTH)}... (${trimmedLine.length} chars)`
          : trimmedLine;
      throw new Error(`Malformed SSE line: ${preview}`);
    }
  }
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

      validateSseBlock(trimmed);

      if (!trimmed.startsWith('data:')) continue;

      // Extract the data payload. Per the SSE spec, the space after
      // "data:" is optional, so handle both "data: value" and "data:value".
      const dataLine = trimmed.startsWith(SSE_DATA_PREFIX)
        ? trimmed.slice(SSE_DATA_PREFIX.length)
        : trimmed.slice('data:'.length);

      yield dataLine;
    }
  }
}
