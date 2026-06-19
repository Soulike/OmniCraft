/**
 * Effectively-invisible code points that a model's tokenizer might ignore — so
 * they could be sprinkled inside a `<system-reminder>` tag (even inside the tag
 * name) to slip it past the delimiter filter. Stripped wholesale before
 * delimiter matching. Covers the whole Unicode format category (`\p{Cf}`:
 * ZWSP/ZWNJ/ZWJ/word-joiner/BOM/SOFT HYPHEN/…), all variation selectors
 * (`\p{Variation_Selector}`, e.g. U+FE0F), and the combining grapheme joiner
 * (U+034F), which is an invisible joiner outside those properties. Visible text
 * — letters, accents, CJK, emoji — is unaffected.
 */
const INVISIBLE_PATTERN = new RegExp(
  '[\\p{Cf}\\p{Variation_Selector}\\u034f]',
  'gu',
);

/**
 * Matches a `<system-reminder>` delimiter in any form once zero-width
 * characters are gone — opening or closing (`/` or `\` before the name),
 * self-closing (`/` before `>`), and attribute-bearing. After the tag name,
 * `[^>]*>` consumes any run of non-`>` characters then requires the closing
 * `>`: a single greedy class followed by a required literal, which is linear
 * (no ambiguous adjacent quantifiers, so no catastrophic backtracking even on
 * unterminated tag-like input).
 */
const DELIMITER_PATTERN = /<[\s/\\]*system-reminder[^>]*>/gi;

/** Replacement for a stripped delimiter, kept non-empty so neighbouring
 *  fragments cannot fuse into a fresh delimiter after removal. */
const REDACTION = '[redacted-tag]';

/**
 * Removes `<system-reminder>` wrapper delimiters from untrusted reminder text
 * so it cannot break out of the privileged wrapper it gets embedded in
 * (second-order prompt injection).
 *
 * Two linear passes, no fixed-point re-scan and no catastrophic backtracking:
 * first drop all invisible code points (closing the "invisible char inside the
 * tag name" bypass), then replace each delimiter with a non-empty placeholder
 * (so removing one can never bring its neighbours together to form another).
 */
export function sanitizeReminderContent(content: string): string {
  return content
    .replace(INVISIBLE_PATTERN, '')
    .replace(DELIMITER_PATTERN, REDACTION);
}
