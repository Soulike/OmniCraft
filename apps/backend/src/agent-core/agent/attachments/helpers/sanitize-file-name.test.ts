import {describe, expect, it} from 'vitest';

import {sanitizeFileName} from './sanitize-file-name.js';

// A literal NUL is written via fromCharCode so this file stays copy/paste-safe.
const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(0x7f);
// Bidi formatting characters, by code point for the same copy/paste reason.
const RLO = String.fromCodePoint(0x202e);
const LRI = String.fromCodePoint(0x2066);
const PDI = String.fromCodePoint(0x2069);
const RLM = String.fromCodePoint(0x200f);
const LRM = String.fromCodePoint(0x200e);
const LS = String.fromCodePoint(0x2028);
const PS = String.fromCodePoint(0x2029);

describe('sanitizeFileName', () => {
  it('takes the basename before sanitizing a forward-slash path', () => {
    expect(sanitizeFileName('Downloads/photo.png')).toBe('photo.png');
  });

  it('takes the basename before sanitizing a backslash path', () => {
    expect(sanitizeFileName('sub\\shot.png')).toBe('shot.png');
  });

  it('reduces a traversal attempt with an embedded control character to its basename', () => {
    expect(sanitizeFileName(`../../etc/pa${NUL}ss.png`)).toBe('pass.png');
  });

  it('strips a control character from an otherwise plain name', () => {
    expect(sanitizeFileName(`sh${NUL}ot.png`)).toBe('shot.png');
  });

  it('strips trailing whitespace', () => {
    expect(sanitizeFileName('shot.png ')).toBe('shot.png');
  });

  it('strips trailing dots', () => {
    expect(sanitizeFileName('shot.png...')).toBe('shot.png');
  });

  // Documents the boundary precisely: `sanitize-filename` only trims
  // *trailing* dots/spaces, never leading ones. A purely-leading-whitespace
  // name is therefore left untouched (and, per `resolveInside`, still a fixed
  // point — not rejected on read).
  it('does not strip leading whitespace', () => {
    expect(sanitizeFileName('  leading.png')).toBe('  leading.png');
  });

  it.each([
    ['empty string', ''],
    ['a single dot', '.'],
    ['a double dot', '..'],
    ['an all-whitespace name', '   '],
    ['an all-tab-and-newline name', '\t\n'],
  ])('returns null for %s', (_label, raw) => {
    expect(sanitizeFileName(raw)).toBeNull();
  });

  it.each([['CON'], ['con'], ['PRN.png'], ['COM1'], ['lpt9.txt']])(
    'returns null for the Windows-reserved name %s',
    (raw) => {
      expect(sanitizeFileName(raw)).toBeNull();
    },
  );

  // Regression coverage for a real gap in a single delegate call: the
  // `sanitize-filename` package checks for a Windows-reserved name *before*
  // trimming trailing dots/spaces, so `'CON '` (trailing space) does not match
  // the reserved-name check on a first pass and survives as `'CON'` — which a
  // *second* pass then recognizes and empties. Applying the delegate only
  // once would make `sanitizeFileName('CON ')` return `'CON'` while
  // `sanitizeFileName('CON')` returns `null`: a file `save()` placed under
  // the name `'CON'` could never be read back. Applying it twice closes that
  // gap, so both must return `null` here.
  it.each([['CON '], ['CON.png '], ['PRN.txt.']])(
    'returns null for the reserved name %s exposed only after trailing whitespace/dots are trimmed',
    (raw) => {
      expect(sanitizeFileName(raw)).toBeNull();
    },
  );

  it('truncates an over-long, mostly multi-byte name to at most 255 bytes without throwing', () => {
    const result = sanitizeFileName(`${'あ'.repeat(200)}.png`);
    expect(result).not.toBeNull();
    if (result === null) return;
    expect(Buffer.byteLength(result)).toBeLessThanOrEqual(255);
  });

  // Required invariant: `resolveInside` treats `sanitizeFileName`'s output as
  // the definition of "a legal name", so every non-null result must be its
  // own fixed point — sanitizing it again must return the exact same string.
  // Verified over a spread of hostile inputs, including the reserved-name-
  // after-trim class above, rather than only the small set of cases already
  // asserted individually.
  it('is idempotent over a spread of hostile inputs', () => {
    const hostileInputs = [
      '',
      '.',
      '..',
      '   ',
      '\t\n',
      'CON',
      'CON ',
      'CON.png ',
      'con.PNG',
      'PRN',
      'NUL.txt   ',
      `sh${NUL}ot.png`,
      `${NUL} shot.png`,
      `sh${DEL}ot.png`,
      `CON${DEL} `,
      DEL,
      `${DEL}${DEL}`,
      `invoice${RLO}gnp.png`,
      `CON${RLO} `,
      RLO,
      `${LRI}sh${PDI}ot.png`,
      `${RLM}${LRM}shot.png`,
      `shot${LS}a.png`,
      `con.${LS}png`,
      `shot${PS}a.png`,
      LS,
      '../../etc/passwd',
      `../../etc/pa${NUL}ss.png`,
      'sub\\shot.png',
      '/etc/passwd',
      'a/b\\c<d>e:f*g|h".png',
      '....',
      'shot.png...   ',
      '  leading and trailing  ',
      `${'あ'.repeat(200)}.png`,
      'a'.repeat(400),
      'shot.png',
      'invoice.pdf',
    ];

    for (const raw of hostileInputs) {
      const once = sanitizeFileName(raw);
      if (once === null) continue;
      expect(sanitizeFileName(once)).toBe(once);
    }
  });

  // `sanitize-filename` sweeps C0 controls but leaves DEL, so this is our own
  // step. It runs *before* the delegate on purpose: stripping DEL afterwards
  // is not idempotent, because `CON<DEL><space>` survives the package as
  // `CON<DEL>` (not a reserved name) and only becomes the reserved `CON` once
  // DEL is removed — which a second pass would then reject.
  it('strips DEL, and does so before the delegate runs', () => {
    expect(sanitizeFileName(`sh${DEL}ot.png`)).toBe('shot.png');
    expect(sanitizeFileName(DEL)).toBeNull();
    // The order-sensitive case: stripping DEL after the package would yield
    // 'CON' here, which is not a fixed point.
    expect(sanitizeFileName(`CON${DEL} `)).toBeNull();
  });

  // Bidi formatting characters render as nothing but reorder what surrounds
  // them, so a stored name could display as something other than what it is
  // wherever it is shown — the compaction path list, the UI, a downloaded
  // file. The package leaves them, same as DEL, so they are stripped in the
  // same step and for the same reason.
  it('strips bidirectional formatting characters', () => {
    expect(sanitizeFileName(`invoice${RLO}gnp.png`)).toBe('invoicegnp.png');
    expect(sanitizeFileName(`${LRI}sh${PDI}ot.png`)).toBe('shot.png');
    expect(sanitizeFileName(`${RLM}${LRM}shot.png`)).toBe('shot.png');
    expect(sanitizeFileName(RLO)).toBeNull();
  });

  // Same order-sensitivity as DEL: a bidi character hides a reserved name
  // from the package, so stripping after it would not be a fixed point.
  it('strips them before the delegate, so a hidden reserved name is still caught', () => {
    expect(sanitizeFileName(`CON${RLO} `)).toBeNull();
    expect(sanitizeFileName(`${LRM}CON`)).toBeNull();
  });

  // A stored name is interpolated into the compaction attachment list, one
  // entry per line. The package sweeps the C0 controls, so `\n` and `\r`
  // cannot get in, but it leaves U+2028/U+2029 — which a model reads as line
  // breaks all the same, letting a third-party filename add its own entries.
  it('strips line and paragraph separators', () => {
    expect(sanitizeFileName(`shot${LS}a.png`)).toBe('shota.png');
    expect(sanitizeFileName(`shot${PS}a.png`)).toBe('shota.png');
    expect(sanitizeFileName(LS)).toBeNull();
  });

  // These are the reason the package misses them: a JavaScript `.` does not
  // match a line terminator, so U+2028 hides a reserved word from the
  // package's own regex. Stripping first is what makes the check see `con`.
  it('strips them before the delegate, so a line separator cannot hide a reserved word', () => {
    expect(sanitizeFileName(`con.${LS}png`)).toBeNull();
    expect(sanitizeFileName(`CON${PS}`)).toBeNull();
  });
});
