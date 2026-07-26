import sanitize from 'sanitize-filename';

/** U+007F. Written as a code point so the source survives copy/paste, and
 *  because a control-character regex class trips eslint's `no-control-regex`. */
const DEL = String.fromCharCode(0x7f);

/**
 * Reduces a client-supplied name to a bare, printable file name. Delegates
 * everything — control characters, `/`/`\` (deleted, not just rejected),
 * Windows-reserved names (`CON`, `PRN`, `COM1`, ...), trailing dots and
 * spaces, and length — to the well-known `sanitize-filename` package, with
 * two custom steps on top.
 *
 * First, the basename is taken *before* sanitizing, so a client-supplied path
 * like `Downloads/photo.png` collapses to `photo.png` rather than the
 * package's own separator handling, which deletes the characters instead
 * (`Downloadsphoto.png`).
 *
 * Second, DEL (U+007F) is stripped, also *before* the package runs. The
 * package sweeps every C0 control character but leaves DEL — an oversight
 * rather than an intent, and one that matters here because a stored name ends
 * up in the model-facing compaction path list, in the UI, and in HTTP headers.
 * The order is load-bearing: stripping DEL *after* the package would break
 * idempotence, because `'CON '` sanitizes to `'CON'` (not a
 * reserved name, so it survives) and only becomes the reserved `'CON'` once
 * DEL is removed — which a second pass would then reject. Stripping first
 * lets the package's reserved-name check see the final character set.
 *
 * Returns `null` when nothing usable survives. Never used to build a path on
 * its own — the result is re-checked by `resolveInside`, which relies on this
 * function being idempotent: `sanitizeFileName(sanitizeFileName(x))` must
 * equal `sanitizeFileName(x)` for every `x`, so that every name `save()`
 * produces is a fixed point the read paths can recognize.
 *
 * The package is applied twice (`sanitize(sanitize(base))`), not once. It
 * checks a Windows-reserved name (`CON`, `PRN.png`, ...) *before* trimming
 * trailing dots/spaces, so `'CON '` survives a single pass as `'CON'` — a
 * reserved name a second pass then empties. A single pass is thus not a
 * fixed point: `sanitizeFileName('CON ')` would return `'CON'`, but
 * `sanitizeFileName('CON')` returns `null`, so a file `save()` placed under
 * the name `'CON'` could never be read back. Applying the delegate twice
 * closes that gap; the package's own `module.exports` uses the same
 * self-composition to solve the equivalent problem for its `replacement`
 * option. A third pass never differs from the second: both reserved-name
 * checks replace their *entire* match with `''`, so there is no partial
 * residue left for a third pass to react to.
 */
export function sanitizeFileName(raw: string): string | null {
  // Split on both separators so a Windows-style path is reduced too; POSIX
  // `path.basename` would keep `sub\shot.png` whole.
  const base = raw.split(/[/\\]/).pop() ?? '';
  const withoutDel = base.split(DEL).join('');
  const cleaned = sanitize(sanitize(withoutDel));
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}
