/**
 * Zero-width and BOM code points (ZWSP, ZWNJ, ZWJ, word-joiner, ZWNBSP/BOM)
 * that are invisible but a model's tokenizer might ignore — so they could be
 * sprinkled inside a `<system-reminder>` tag (even inside the tag name) to slip
 * it past a naive filter. Stripped wholesale before delimiter matching.
 */
const ZERO_WIDTH_PATTERN = new RegExp(
  '\\u200b|\\u200c|\\u200d|\\u2060|\\ufeff',
  'g',
);

/**
 * Matches a `<system-reminder>` / `</system-reminder>` delimiter once
 * zero-width characters are gone. `[\s/]*` (a single quantified class, no
 * adjacent `*` groups) tolerates whitespace and the optional closing slash
 * without the ambiguous backtracking that an `\s*\/?\s*` form would invite.
 */
const DELIMITER_PATTERN = /<[\s/]*system-reminder\s*>/gi;

/** Replacement for a stripped delimiter, kept non-empty so neighbouring
 *  fragments cannot fuse into a fresh delimiter after removal. */
const REDACTION = '[redacted-tag]';

/**
 * Removes `<system-reminder>` wrapper delimiters from untrusted reminder text
 * so it cannot break out of the privileged wrapper it gets embedded in
 * (second-order prompt injection).
 *
 * Two linear passes, no fixed-point re-scan and no catastrophic backtracking:
 * first drop all zero-width/BOM code points (closing the "invisible char inside
 * the tag name" bypass), then replace each delimiter with a non-empty
 * placeholder (so removing one can never bring its neighbours together to form
 * another).
 */
export function sanitizeReminderContent(content: string): string {
  return content
    .replace(ZERO_WIDTH_PATTERN, '')
    .replace(DELIMITER_PATTERN, REDACTION);
}
