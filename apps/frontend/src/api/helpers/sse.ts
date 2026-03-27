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

/** Strips only a trailing carriage return (for CRLF line endings). */
function stripCr(line: string): string {
  if (line.endsWith('\r')) return line.slice(0, -1);
  return line;
}

/**
 * Validates that every non-empty line in a block starts with a known SSE
 * field prefix. Leading whitespace on a line is genuinely malformed per the
 * SSE spec. Only trailing `\r` is stripped (for CRLF compatibility).
 * Throws if any line is malformed.
 */
function validateSseBlock(block: string): void {
  for (const line of block.split('\n')) {
    const cleaned = stripCr(line);
    if (cleaned === '') continue;

    if (!isSseLineValid(cleaned)) {
      const preview =
        cleaned.length > MAX_ERROR_PREVIEW_LENGTH
          ? `${cleaned.slice(0, MAX_ERROR_PREVIEW_LENGTH)}... (${cleaned.length} chars)`
          : cleaned;
      throw new Error(`Malformed SSE line: ${preview}`);
    }
  }
}

/**
 * Extracts and concatenates all `data:` field values from an SSE event block.
 * Per the SSE spec, multiple `data:` lines in a single event are joined with
 * newlines. The space after "data:" is optional. Trailing whitespace in the
 * field value is preserved.
 */
function extractDataFromBlock(block: string): string | undefined {
  const dataValues: string[] = [];

  for (const line of block.split('\n')) {
    const cleaned = stripCr(line);
    if (cleaned.startsWith(SSE_DATA_PREFIX)) {
      dataValues.push(cleaned.slice(SSE_DATA_PREFIX.length));
    } else if (cleaned.startsWith('data:')) {
      dataValues.push(cleaned.slice('data:'.length));
    }
  }

  if (dataValues.length === 0) return undefined;
  return dataValues.join('\n');
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
      if (part.trim() === '') continue;

      validateSseBlock(part);

      const data = extractDataFromBlock(part);
      if (data === undefined) continue;

      yield data;
    }
  }
}
