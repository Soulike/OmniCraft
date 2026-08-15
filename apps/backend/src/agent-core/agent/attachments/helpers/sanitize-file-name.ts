import sanitize from 'sanitize-filename';

/**
 * Invisible characters the delegate leaves in place, stripped before it runs.
 *
 * U+007F (DEL) sits just past the C0 block the package sweeps (`\x00-\x1f`,
 * `\x80-\x9f`) — an oversight rather than an intent.
 *
 * U+2028 and U+2029 are Unicode's line and paragraph separators. The package
 * sweeps the C0 controls, which covers `\n` and `\r`, but not these — and a
 * stored name is interpolated into the compaction attachment list, one entry
 * per line, so a name carrying one could add entries the model reads as
 * separate lines. That the package misses them is not incidental either: a
 * JavaScript `.` does not match a line terminator, so a `U+2028` inside a name
 * also hides it from the package's own Windows-reserved-name regex.
 *
 * The rest are Unicode's bidirectional formatting characters. They render as
 * nothing but reorder the text around them, so `invoice<U+202E>gnp.png` can
 * display as a different name than it is — the "Trojan Source" trick applied
 * to a file name. Impact is limited here because the extension is always
 * rebuilt from the sniffed media type, so a spoofed name can never disagree
 * with the real content type; the point is to keep the name itself
 * unambiguous wherever it is shown, which is the same reason DEL goes.
 *
 * Written as code points, not literals, so the source stays copy/paste-safe
 * and no control-character regex class trips eslint's `no-control-regex`.
 */
const STRIPPED_CODE_POINTS = [
  0x7f, // DEL
  0x061c, // ARABIC LETTER MARK
  0x200e, // LEFT-TO-RIGHT MARK
  0x200f, // RIGHT-TO-LEFT MARK
  0x202a, // LEFT-TO-RIGHT EMBEDDING
  0x202b, // RIGHT-TO-LEFT EMBEDDING
  0x202c, // POP DIRECTIONAL FORMATTING
  0x202d, // LEFT-TO-RIGHT OVERRIDE
  0x202e, // RIGHT-TO-LEFT OVERRIDE
  0x2066, // LEFT-TO-RIGHT ISOLATE
  0x2067, // RIGHT-TO-LEFT ISOLATE
  0x2068, // FIRST STRONG ISOLATE
  0x2069, // POP DIRECTIONAL ISOLATE
  0x2028, // LINE SEPARATOR
  0x2029, // PARAGRAPH SEPARATOR
];

/** Built from the code points rather than written as a literal class, so the
 *  source contains no invisible characters. The `u` flag makes `\u{...}`
 *  escapes match whole code points. */
const STRIPPED_PATTERN = new RegExp(
  `[${STRIPPED_CODE_POINTS.map((codePoint) => `\\u{${codePoint.toString(16)}}`).join('')}]`,
  'gu',
);

function stripInvisible(value: string): string {
  return value.replace(STRIPPED_PATTERN, '');
}

/** Passes over `MAX_SANITIZE_PASSES`, which no input should approach — each
 *  pass is a self-composition of one that already runs twice internally. */
const MAX_SANITIZE_PASSES = 8;

/**
 * Applies the delegate until it stops changing the value.
 *
 * Two passes are not enough, which is the whole reason this exists. The
 * package trims trailing dots and spaces, checks Windows-reserved names, and
 * truncates to 255 bytes — in that order — so truncation can *reintroduce*
 * trailing spaces after the trim that would have removed them, and removing
 * those on the next pass can expose a reserved name that was hidden behind
 * them. `'con' + ' '.repeat(252) + 'JUNKJUNK'` is such an input: it reduces to
 * `'con'`, which sanitizes to `''`.
 *
 * Iterating terminates because no pass ever lengthens its input, so the byte
 * count strictly decreases until it settles. The bound is a backstop against a
 * future package change turning that into a cycle; failing closed there costs
 * a rejected upload, where returning a non-fixed-point name would store a file
 * no read path could ever look up again.
 */
function toFixedPoint(value: string): string {
  let current = sanitize(value);
  for (let pass = 0; pass < MAX_SANITIZE_PASSES; pass++) {
    const next = sanitize(current);
    if (next === current) return current;
    current = next;
  }
  return '';
}

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
 * Second, {@link STRIPPED_CODE_POINTS} are removed, also *before* the package
 * runs. They matter because a stored name ends up in the model-facing
 * compaction path list, in the UI, and in HTTP headers. The order is
 * load-bearing: stripping them *after* the package would break idempotence,
 * because `'CON<DEL> '` sanitizes to `'CON<DEL>'` (not a reserved name, so it
 * survives) and only becomes the reserved `'CON'` once the character is
 * removed — which a second pass would then reject. Stripping first lets the
 * package's reserved-name check see the final character set.
 *
 * Returns `null` when nothing usable survives. Never used to build a path on
 * its own — the result is re-checked by `resolveInside`, which relies on this
 * function being idempotent: `sanitizeFileName(sanitizeFileName(x))` must
 * equal `sanitizeFileName(x)` for every `x`, so that every name `save()`
 * produces is a fixed point the read paths can recognize.
 *
 * The package is applied until it stops changing the value, not once. It
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
  const cleaned = toFixedPoint(stripInvisible(base));
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}
