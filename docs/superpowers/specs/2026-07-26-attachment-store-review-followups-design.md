# Attachment store review follow-ups

- **PR:** [#389](https://github.com/Soulike/OmniCraft/pull/389) — review of `agent-attachment-store.ts`
- **Date:** 2026-07-26
- **Status:** Agreed, ready to implement

Nine changes from the file review. One is a behavior fix; the rest are structure
and naming. They should ship as **two commits** — the fix reviewed on its own, the
refactor reviewed as a refactor — because a behavior change buried in a rename sweep
is a behavior change nobody reads.

## 1. Bug: `readBase64` reads a file it never size-checked

`readFile` has no size limit. `describe` reports `byteSize` from an `lstat`, but
between that stat and the read the file can be replaced by a larger one — and there
is a writer that can do it, since `run_command`'s realpath allowlist covers the
scratch space by design (it is how an oversized image gets downsampled).

Two consequences, the second worse than the first:

- An arbitrarily large file is read fully into memory.
- The per-request byte budget is bypassed. `LlmSession.toRequestMessages` decides
  compaction from the **recorded** `byteSize`, while `readBase64` returns whatever is
  actually on disk. When those disagree, the assembled request can exceed the budget
  the compaction trigger just certified as safe.

### The check belongs in `readBase64`, not `describe`

`readBase64` is the only path that feeds a provider, and the cap is a statement about
what a provider request may carry — not about what a user may see. `describe` also
backs the HTTP download endpoint and the completions descriptor resolution, and an
attachment that the agent happened to overwrite with something larger should still be
viewable and deletable in the UI. Putting the cap in `describe` would conflate two
different policy questions.

Memory safety still holds: `readBase64` already calls `describe`, so it has a
**freshly stat'd** `byteSize` to compare against `capFor(mediaType)` before it reads a
byte.

The completions path is unaffected — its per-message sum comes from a fresh stat at
send time, so it is already correct.

A residual TOCTOU window remains (the stat is not the read). It is microseconds wide
and the only writer is our own agent, so a fresh bounded check is the right trade
against streaming the read through a capping transform.

### "Missing" would be a lie, so it needs its own placeholder

An over-cap attachment is still on disk. Rendering it as
`[attachment missing: …]` tells the model something false, and the inverse test makes
that concrete: if the placeholder were honest we would have to delete the file to
match it — which we must not do, because the file grew through the _agent's_ action
and deleting it would discard the user's data on the agent's behalf.

So the non-delivery reason has to survive to the block builder:

```ts
type ResolvedLlmAttachment = LlmAttachment &
  ({data: string} | {data: null; reason: 'missing' | 'too-large'});
```

```
[attachment missing: shot.png]
[attachment too large to deliver: shot.png (12.3 MB)]
```

The second is **actionable** in a way the first is not: the file is in the scratch
space, so the agent can downsample it with a shell command and read it back — the same
escape hatch `read_file` already points at when it refuses oversized media. Collapsing
it into "missing" closes that door.

`readBase64`'s return type changes from `string | null` to the same discriminated-union
shape, which matches what section 4 does to `writeCapped`.

**Implementation note.** `formatAttachmentSize` currently lives in
`llm-session/compaction/`, while the block builder is in `llm-api/helpers/`. `llm-api`
sits _below_ `llm-session` and must not import upward, so the formatter moves down
alongside the builder and the compaction slimmer imports it from there.

## 2. `sanitizeFileName`: delegate to `sanitize-filename`, keep one custom step

The hand-rolled sanitizer misses three things the well-known package gets right, and
gets one thing right that the package gets wrong for us.

|                                                  | ours today                        | `sanitize-filename`                                                    |
| ------------------------------------------------ | --------------------------------- | ---------------------------------------------------------------------- |
| separators                                       | takes the basename → `passwd.png` | deletes the characters → `....etcpasswd.png`                           |
| truncation                                       | by **character**                  | by **byte** (correct — this is the bug `budgetStem` had to paper over) |
| Windows reserved names (`CON`, `PRN`, `COM1`, …) | not handled                       | handled                                                                |
| trailing dots and spaces                         | trims spaces only                 | handled                                                                |

Only the first row favours our version, and it favours it clearly: a client that
hands us `Downloads/photo.png` should get `photo.png`, not `Downloadsphoto.png`.

So: **package for the capability, one custom step on top.**

```ts
import sanitize from 'sanitize-filename';

function sanitizeFileName(raw: string): string | null {
  const base = raw.split(/[/\\]/).pop() ?? ''; // ours: basename semantics
  const cleaned = sanitize(base); // package: everything else
  if (cleaned === '' || cleaned === '.' || cleaned === '..') return null;
  return cleaned;
}
```

`isControlCharacter`, `hasControlCharacter`, and most of the current
`sanitizeFileName` body go away.

**Idempotence is preserved**, which section 3 depends on: after the first pass there
are no separators left, so `split().pop()` is the identity on a second pass, and the
package is stable on already-sanitized input. `sanitize(sanitize(x)) === sanitize(x)`
still holds, so every name `save()` produces remains a fixed point.

`budgetStem` stays. It reserves room for the ` (100)` uniquify suffix and the
extension — something no general-purpose package can know — and its budget
(255 − suffix − extension bytes) is strictly tighter than the package's 255, so the
package's truncation never fires after it.

Install notes: `pnpm add sanitize-filename` (currently 1.6.4, one transitive
dependency, `truncate-utf8-bytes`). **Do not install `@types/sanitize-filename`** — it
is a deprecated stub; the package ships its own `index.d.ts`. It is CJS, so it is
consumed as a default import under the backend's nodenext resolution.

## 3. `resolveInside`: validate by sanitizing and comparing

Replace the four hand-rolled checks with one:

```ts
function resolveInside(directory: string, fileName: string): string | null {
  if (sanitizeFileName(fileName) !== fileName) return null;
  return path.join(directory, fileName);
}
```

This is not a shortening for its own sake. It leans on section 2 — `sanitizeFileName`
becomes the single definition of "a legal name", used by both the write and the read
path — and establishes an invariant worth having:
**the read path accepts exactly the names the write path can produce.** Every name
`save()` returns is a fixed point of `sanitizeFileName` by construction, so the two
sides can no longer drift apart as either evolves.

It also covers strictly more than the checks it replaces — control characters,
separators of both kinds, `.`/`..`, empty, over-length — plus leading and trailing
whitespace, which the current code accepts.

**Sanitizing rather than rejecting on the read path stays wrong**, and this change
does not do it. A read names an _existing_ file: sanitizing `../secret.png` into
`secret.png` would silently serve a different file than the caller asked for, turning
a rejection into a guess. Compare-and-reject keeps the answer "that name is not one
of ours."

## 4. `writeCapped`: structured result, and it owns its own cleanup

`Promise<number | null>` with `null` meaning "too large" is unreadable at the call
site, and inconsistent with `SaveAttachmentResult` two screens up. Return a
discriminated union instead.

Separately: the temp file **is** cleaned up today — `save()`'s
`finally { rm(temporaryPath, {force: true}) }` covers every exit — so there is no
leak. But `writeCapped` creates the file and `save` removes it, which splits
responsibility across a boundary. On a failure path `writeCapped` should remove what
it wrote; `save`'s `finally` then becomes a backstop for the success path's temp
file rather than the only thing standing between a failed upload and a stray file.

## 5. Extract module helpers into `helpers/`

Eight module-private functions sit above the class, which is not how this codebase is
laid out — `dispatcher/helpers/`, `llm-api/helpers/`, and `agent/tools/file/helpers.ts`
are all the established shape.

`statRegularFile` goes further, into **`src/helpers/fs.ts`**: it is `lstat` +
`isFile()` + ENOENT-to-`null` with nothing attachment-specific about it, and
`isFileNotFoundError` / `isFileExistsError` already live there.

A previous review defended the single file on cohesion grounds ("keep the
security-relevant checks together"). That argument does not survive contact with the
alternative: the helpers stay in one file either way, just not in the class's file.

## 6. Naming

- `toMediaType` → **`toSupportedMediaType`**. The current name does not convey that an
  unsupported type returns `null`, which is the whole point of the function.
- `OpenedAttachment` → **`AttachmentDescriptor`**. Nothing is opened and no handle is
  returned; the name describes an operation the type does not perform. `describe` as a
  method name is fine and stays — "given a name, tell me what this is" is what it does.

## Testing

The refactor is covered by the existing 30 tests in `agent-attachment-store.test.ts`;
a rename or a file move that breaks behavior breaks them.

The fix needs its own, and they must reproduce the condition rather than assert the
happy path:

- A file that grows past its type cap between upload and read resolves to
  `{reason: 'too-large'}` from `readBase64`, and the block builder renders the
  too-large placeholder — not the missing one.
- That same file is **still** downloadable over HTTP and still describable, proving the
  cap did not leak into `describe`.
- A file at exactly the cap is still delivered.
- A file deleted between `describe` and the read still yields `{reason: 'missing'}`,
  so the two reasons are not confused with one another.
- `resolveInside`'s new rule accepts every name `save()` produces — assert this by
  round-tripping saved names through it, not by listing cases, so the invariant is
  what is tested.
- Leading/trailing whitespace in a read path name is rejected (new behavior).
- `sanitizeFileName` keeps basename semantics after delegating to the package:
  `Downloads/photo.png` → `photo.png`, not `Downloadsphoto.png`.
- `sanitizeFileName` is idempotent — assert `sanitize(sanitize(x)) === sanitize(x)`
  over a spread of hostile inputs, since section 3's invariant rests on it.
