/**
 * Parses an SSE stream from a fetch Response into raw data strings.
 *
 * Handles buffering across chunk boundaries. For each event (delimited
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

      buffer += normalizeLineEndings(value);
      const events = buffer.split(SSE_EVENT_DELIMITER);
      buffer = events.pop() ?? '';

      for (const event of events) {
        if (event.trim() === '') continue;

        if (!isSseEventValid(event)) {
          const preview =
            event.length > MAX_ERROR_PREVIEW_LENGTH
              ? `${event.slice(0, MAX_ERROR_PREVIEW_LENGTH)}... (${event.length} chars)`
              : event;
          throw new Error(`Malformed SSE event: ${preview}`);
        }

        const data = extractDataFromEvent(event);
        if (data === undefined) continue;

        yield data;
      }
    }
  } finally {
    await lineReader.cancel();
  }
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** SSE events are separated by double newlines. */
const SSE_EVENT_DELIMITER = '\n\n';

/**
 * Known SSE field prefixes. While the SSE spec ignores unknown field names,
 * we intentionally reject them to surface server-side bugs early.
 * Note: `data:` without a trailing space is also valid per spec.
 */
const SSE_FIELD_PREFIXES = Object.freeze({
  data: 'data:',
  event: 'event:',
  id: 'id:',
  retry: 'retry:',
  comment: ':',
});

/** Maximum characters of a malformed event to include in the error message. */
const MAX_ERROR_PREVIEW_LENGTH = 120;

/**
 * The SSE spec recognizes three line ending styles: `\r\n` (CRLF), `\r` (CR),
 * and `\n` (LF). We normalize them all to `\n` so that the rest of the parser
 * only needs to split on `\n`. CRLF must be replaced first — otherwise
 * replacing `\r` alone would turn a single `\r\n` into two `\n`s.
 */
function normalizeLineEndings(text: string): string {
  return text.replaceAll('\r\n', '\n').replaceAll('\r', '\n');
}

function isSseLineValid(line: string): boolean {
  return Object.values(SSE_FIELD_PREFIXES).some((prefix) =>
    line.startsWith(prefix),
  );
}

/**
 * Checks whether every non-empty line in an event starts with a known SSE
 * field prefix. Leading whitespace on a line is treated as malformed — while
 * the SSE spec would see it as an unknown field name, we intentionally reject
 * it to catch server-side bugs.
 */
function isSseEventValid(event: string): boolean {
  for (const line of event.split('\n')) {
    if (line === '') continue;

    if (!isSseLineValid(line)) return false;
  }
  return true;
}

/**
 * Extracts and concatenates all `data:` field values from an SSE event.
 * Per the SSE spec, multiple `data:` lines in a single event are joined with
 * newlines. The space after "data:" is optional. Trailing whitespace in the
 * field value is preserved.
 */
function extractDataFromEvent(event: string): string | undefined {
  const dataValues: string[] = [];

  for (const line of event.split('\n')) {
    if (!line.startsWith(SSE_FIELD_PREFIXES.data)) continue;

    // Per the SSE spec, the space after "data:" is optional.
    // Strip "data:" then strip at most one leading space.
    const value = line.slice(SSE_FIELD_PREFIXES.data.length);
    dataValues.push(value.startsWith(' ') ? value.slice(1) : value);
  }

  if (dataValues.length === 0) return undefined;
  return dataValues.join('\n');
}
