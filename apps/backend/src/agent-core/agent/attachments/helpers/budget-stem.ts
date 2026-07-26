/** Placement attempts before a save gives up. Bounded so a directory another
 *  writer is filling fails cleanly instead of spinning forever. */
export const MAX_PLACEMENT_ATTEMPTS = 100;

/** Conservative NAME_MAX for typical filesystems (ext4, APFS, ...). Bounds
 *  how long a stored file name is allowed to be, in bytes. */
const NAME_MAX_BYTES = 255;

/** The longest suffix `placeUniquely` can append, e.g. ` (100)` when
 *  `MAX_PLACEMENT_ATTEMPTS` is 100. Reserved up front so the stem is budgeted
 *  for the worst case rather than just the first candidate. */
const LONGEST_PLACEMENT_SUFFIX = ` (${MAX_PLACEMENT_ATTEMPTS})`;

/**
 * Trims `stem` — by code point, never inside a multi-byte character — so
 * that `stem` plus the longest possible uniquify suffix plus `extension`
 * fits within `NAME_MAX_BYTES`.
 *
 * `sanitizeFileName`'s own truncation (delegated to the `sanitize-filename`
 * package) only bounds the *sanitized* name to 255 bytes before any uniquify
 * suffix is appended — something no general-purpose package can know about.
 * `budgetStem`'s budget (255 minus the suffix and the extension) is strictly
 * tighter, so the package's truncation never fires after this one already
 * has, and `placeUniquely`'s `link` never throws `ENAMETOOLONG`.
 */
export function budgetStem(stem: string, extension: string): string {
  const budget =
    NAME_MAX_BYTES -
    Buffer.byteLength(LONGEST_PLACEMENT_SUFFIX) -
    Buffer.byteLength(extension);

  const codePoints = Array.from(stem);
  while (Buffer.byteLength(codePoints.join('')) > budget) {
    codePoints.pop();
  }
  const budgeted = codePoints.join('');
  return budgeted === '' ? 'attachment' : budgeted;
}
