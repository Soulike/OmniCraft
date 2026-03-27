/** SSE field prefix for data payloads (with the conventional trailing space). */
const SSE_DATA_PREFIX = 'data: ';

/** SSE events are separated by double newlines. */
const SSE_EVENT_DELIMITER = '\n\n';

/**
 * Known SSE field prefixes. While the SSE spec ignores unknown field names,
 * we intentionally reject them to surface server-side bugs early.
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
 * field prefix. Leading whitespace on a line is treated as malformed — while
 * the SSE spec would see it as an unknown field name, we intentionally reject
 * it to catch server-side bugs. Only trailing `\r` is stripped (for CRLF
 * compatibility). Throws if any line is malformed.
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
 * Handles buffering across chunk boundaries. For each event block (delimited
 * by `\n\n`), validates that every line starts with a known SSE field prefix
 * and throws on malformed lines. Extracts and concatenates all `data:` field
 * values (joined with `\n` for multi-line data). The space after `data:` is
 * optional per spec. Callers are responsible for further parsing (e.g., JSON).
 *
 * The reader is cancelled in a finally block so that the underlying fetch
 * connection is properly cleaned up on early exit or error.
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

  try {
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
  } finally {
    // Best-effort cleanup: catch so a cancel failure doesn't mask the
    // original error thrown from the try block.
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    await lineReader.cancel().catch(() => {});
  }
}
