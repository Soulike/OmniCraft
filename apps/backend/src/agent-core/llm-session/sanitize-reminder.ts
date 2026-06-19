/**
 * Whitespace plus zero-width / BOM code points a model might still parse as
 * padding inside a tag: ZWSP, ZWNJ, ZWJ, word-joiner, BOM/ZWNBSP. Written as
 * an alternation rather than a character class so the zero-width code points
 * are not flagged as a misleading combining sequence.
 */
const GAP = '(?:\\s|\\u200b|\\u200c|\\u200d|\\u2060|\\ufeff)*';

/**
 * Matches a literal `<system-reminder>` / `</system-reminder>` delimiter,
 * tolerating surrounding whitespace and zero-width characters.
 */
const DELIMITER_PATTERN = new RegExp(
  `<${GAP}/?${GAP}system-reminder${GAP}>`,
  'gi',
);

/** Replacement for a stripped delimiter, kept non-empty so neighbouring
 *  fragments cannot fuse into a fresh delimiter after removal. */
const REDACTION = '[redacted-tag]';

/**
 * Removes `<system-reminder>` wrapper delimiters from untrusted reminder text
 * so it cannot break out of the privileged wrapper it gets embedded in
 * (second-order prompt injection).
 *
 * Single linear pass: replacing each match with a non-empty placeholder means
 * removing one delimiter can never bring its neighbours together to form
 * another, so no fixed-point re-scan (and its O(n^2) worst case) is needed.
 */
export function sanitizeReminderContent(content: string): string {
  return content.replace(DELIMITER_PATTERN, REDACTION);
}
