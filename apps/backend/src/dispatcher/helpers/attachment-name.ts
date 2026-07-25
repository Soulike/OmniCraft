/**
 * Parses and validates the `:fileName` attachment path parameter.
 *
 * `@koa/router` decodes percent-encoded slashes, so an unvalidated value flows
 * straight into `path.join` — the same hazard {@link parseSessionId} exists for.
 * Only a bare, separator-free, control-character-free name is accepted; the
 * attachment store additionally rejects a symlink planted at the leaf.
 *
 * @returns the validated name, or `null` when it is not usable.
 */
export function parseAttachmentFileName(
  raw: string | undefined,
): string | null {
  if (raw === undefined) return null;
  if (raw === '' || raw === '.' || raw === '..') return null;
  if (raw.includes('/') || raw.includes('\\')) return null;
  // Checked by code point rather than a regex: a control-character class in a
  // regex literal trips eslint's `no-control-regex` and is easy to corrupt when
  // the source is copied around.
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) return null;
  }
  return raw;
}
