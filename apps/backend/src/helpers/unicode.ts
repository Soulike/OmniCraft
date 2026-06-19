/**
 * The complete set of Unicode line terminators: LF, VT, FF, CR, NEL (U+0085),
 * LINE SEPARATOR (U+2028), PARAGRAPH SEPARATOR (U+2029). Any of these can render
 * text as multiple lines, so callers that need a single-line invariant (e.g.
 * before embedding untrusted text in a privileged block) reject or collapse
 * them. Built from a string so no literal control characters appear in source.
 */

const LINE_TERMINATORS = '\\n|\\u000b|\\f|\\r|\\u0085|\\u2028|\\u2029';

/** Tests whether a string contains any Unicode line terminator. */
export function hasLineTerminator(value: string): boolean {
  return new RegExp(LINE_TERMINATORS).test(value);
}

/** Replaces every run of Unicode line terminators with a single space. */
export function collapseLineTerminators(value: string): string {
  return value.replace(new RegExp(`(?:${LINE_TERMINATORS})+`, 'g'), ' ');
}
