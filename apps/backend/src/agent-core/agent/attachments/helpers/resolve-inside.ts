import path from 'node:path';

import {sanitizeFileName} from './sanitize-file-name.js';

/**
 * Resolves `fileName` inside `directory`, or `null` when `fileName` is not
 * exactly what `sanitizeFileName` would produce for it.
 *
 * This makes `sanitizeFileName` the single definition of "a legal name",
 * shared by the write path (`save`, via `sanitizeFileName` directly) and
 * every read path (`describe`, `readBase64`, `remove`, via this function):
 * every name `save()` returns is a fixed point of `sanitizeFileName` by
 * construction, so the two sides cannot drift apart as either evolves. It
 * also covers control characters, separators of both kinds, `.`/`..`, empty,
 * over-length, and trailing whitespace — a name that sanitizes to something
 * else is never a name we could have written ourselves.
 *
 * Sanitizing rather than rejecting here would be wrong: a read names an
 * *existing* file, so silently sanitizing `../secret.png` into `secret.png`
 * would serve a different file than the caller asked for. Compare-and-reject
 * keeps the answer "that name is not one of ours" instead of a guess.
 *
 * This does not itself guard `directory` (the session's `attachments` folder)
 * being a symlink — every caller (`save`, `describe`, `remove`) confirms that
 * via `AgentAttachmentStore.verifyRealDirectoryOrAbsent` before reaching this
 * function, so a resolved path here is guaranteed to sit under a real
 * directory, not one reached by following a planted symlink.
 */
export function resolveInside(
  directory: string,
  fileName: string,
): string | null {
  if (sanitizeFileName(fileName) !== fileName) return null;
  return path.join(directory, fileName);
}
