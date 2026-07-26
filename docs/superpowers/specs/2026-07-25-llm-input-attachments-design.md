# Image and PDF attachments for LLM input (backend)

- **Issue:** [#378 — Image / PDF Support in Chat Input](https://github.com/Soulike/OmniCraft/issues/378)
- **Follow-up (tool results adopt the same store):** [#388](https://github.com/Soulike/OmniCraft/issues/388)
- **Date:** 2026-07-25
- **Status:** Approved design, ready for implementation plan

This spec builds a **general mechanism for attaching binary input to an LLM
request**, and wires up its first producer: a user uploading a file in the chat
input. The store, the schema, and the resolution seam are deliberately
source-agnostic — see [The attachment store is source-agnostic](#the-attachment-store-is-source-agnostic).

## Problem

A user cannot send an image or a PDF to the model. The user-message channel is
text-only from the HTTP boundary all the way down:

| Layer                                       | Today                                   |
| ------------------------------------------- | --------------------------------------- |
| `chatCompletionsRequestSchema`              | `z.strictObject({message: z.string()})` |
| `chatAgentSessionService.sendCompletion`    | `(id, message: string)`                 |
| `Agent.enqueueUserTurn` → `AgentTurnRunner` | `userMessage: string`                   |
| `LlmSession.sendUserMessage`                | `content: string`                       |
| `llmMessageBaseSchema.content` (persisted)  | `z.string()`                            |
| `sseMessageStartEventSchema.content`        | `z.string()`                            |

Meanwhile [#368](https://github.com/Soulike/OmniCraft/issues/368) (shipped in PR
#372) already built the entire media-delivery machinery — for the _tool-result_
channel only:

- `imageMediaTypeSchema` (png/jpeg/gif/webp) and `documentMediaTypeSchema`
  (`application/pdf`) in `@omnicraft/tool-schemas` — the intersection of what both
  providers accept.
- Neutral media blocks and their mapping to Anthropic
  (`source: {type: 'base64', media_type, data}`) and OpenAI Responses
  (`input_image` / `input_file`) in `llm-api/claude/helpers.ts:81-109` and
  `llm-api/openai-responses/helpers.ts:66-94`.
- `file-type` magic-byte sniffing, `guardMedia`, `toolResultBlocksToText`.
- `read_file` returning a local image/PDF to the model as media.

Both pinned SDKs (`@anthropic-ai/sdk@0.104.2`, `openai@6.46.0`) accept image and
document blocks in a **user** message with no beta and no Files API. The gap is
entirely the user-message side of our own code.

## Goals

- An HTTP API to upload an image/PDF into a session and attach it to a user message.
- Deliver the bytes to both providers through the existing neutral blocks.
- Persist attachments without bloating `snapshot.json` or `sse-events.jsonl`.
- Expose an endpoint the frontend can point an `<img src>` at.
- Keep attachments reachable by the agent after context compaction.

## Non-goals (this spec)

- **Frontend rendering** — the next round.
- **Audio** — undeliverable on both SDKs, same as #372.
- **Provider Files API / URL sources** — available in both pinned SDKs but rejected
  for the same reasons as #372 (no token saving, per-provider APIs, public-URL
  assumption a self-hosted deploy may not satisfy).
- **Cross-session attachment dedup (content-addressed store)** — no evidence it is
  needed.
- **Migrating tool-result media onto this store** — [#388](https://github.com/Soulike/OmniCraft/issues/388).
  The right end state, but it changes shipped code and needs a second snapshot
  migration. Sequenced after this spec so the store is first proven on a path with
  no migration and no existing behavior at risk.
- **Scheduled orphan collection** — an explicit `DELETE` endpoint plus the existing
  recursive session delete cover the realistic cases.

## Key decisions

1. **Reference storage, not inline base64.** The snapshot holds
   `{fileName, mediaType, lastKnownByteSize}`; the bytes live in a file. Base64 is
   materialized transiently when a request is built, and never persisted.

   This deliberately **diverges from #372**, which inlines tool-result base64 into
   `snapshot.json`. The difference is justified, not accidental:

   - `snapshot.json` is rewritten in full (pretty-printed) after **every turn**. A
     3 MB inline image means ~3 MB of redundant disk writes per turn for the life of
     the session.
   - `sse-events.jsonl` is **replayed in full on every reconnect**. The frontend
     rebuilds history from it, so inline bytes would be re-streamed to the browser
     on every page load.
   - Unlike a tool result, a user attachment **must be rendered by the frontend**, so
     it needs an addressable URL regardless. Once there is a URL, there is a file.

2. **Blobs live in the session scratch space**, at
   `<sessionsDir>/<sid>/scratch/attachments/`. This is the load-bearing decision:
   it makes an attachment an ordinary file the agent can re-open with `read_file`
   (which already returns local images/PDFs as media since #372), and reduce with a
   shell command via `run_command` (whose realpath allowlist already covers the
   scratch directory). Compaction survival therefore needs **no new mechanism** —
   only a path list in the summary.

3. **`content` stays `string`; `attachments` is a sibling field.** Not a widening
   of `content` into a block array as #372 did for tool results. This keeps the
   change small, keeps `.default([])` back-compat viable (no migration script), and
   lets the adapters emit a bare string for the overwhelmingly common no-attachment
   case, leaving the prompt-cache prefix untouched.

4. **Two-step upload with a raw binary request body.** Upload → `fileName`, then
   send the message with the names. A raw body needs no new dependency
   (`@koa/bodyparser` only handles json/form and leaves `ctx.req` unconsumed for
   other content types), streams straight to disk, and lets each file have its own
   progress, retry, and cancel. Multipart's only real advantages — a native filename
   field and multiple files per request — are not worth a parser dependency here.

5. **The on-disk name is the sanitized original filename, not a UUID.** The whole
   value of decision 2 is a path list the model can act on;
   `.../attachments/invoice.pdf` carries information that
   `.../attachments/a3f9-….pdf` does not.

6. **Caps: 5 MB per image, 10 MB per PDF.** `read_file`'s `MAX_INLINE_MEDIA_BYTES`
   (1 MB) stays untouched — see [Two caps, deliberately different](#two-caps-deliberately-different).

7. **`message` keeps `.min(1)`.** An attachment never substitutes for text. This is
   a complexity-reduction choice: no empty-message branch anywhere, and title
   generation always has text to work with.

## Storage layout

```
<dataDir>/sessions/<sid>/
  snapshot.json          attachments: [{fileName, mediaType, lastKnownByteSize}]
  metadata.json
  sse-events.jsonl       message-start carries the same descriptors
  scratch/
    attachments/
      invoice.pdf        <- the bytes
      shot.png
```

`agentPersistence` gains `attachmentsPath(sessionsDir, id)` →
`path.join(sessionsDir, id, 'scratch', 'attachments')`, matching the existing
`scratchPath` / `eventsPath` / `metadataPath` helpers.

**No absolute path is ever persisted in a descriptor.** `DATA_DIR` is configurable
and a data directory can be backed up and restored elsewhere; a stored absolute path
would rot. Descriptor paths are always derived from
`sessionsDir + agentId + fileName` at use time.

**One deliberate exception: the compaction summary.** That message is prose written
for the model, and it embeds absolute paths resolved when compaction ran (see
[Compaction](#compaction)). Rendering them lazily would mean carrying the attachment
list on the compaction metadata and re-rendering the message content at request time
— a change to the core compaction structures. Accepted instead, because the failure
mode is graceful: after a `DATA_DIR` move the model reads a stale path, the read
fails, and it continues. Nothing is corrupted, and nothing but that one file list is
affected.
Absolute paths are also never sent to the browser — they are server filesystem
detail. The frontend only receives descriptors and builds
`/api/chat/session/:sid/attachments/:fileName`.

Session deletion already does `rm -rf` on the session directory
(`main-agent-store.ts` `deleteFromDisk`), so attachment lifecycle closes for free.

## The attachment store is source-agnostic

The store is **not** a user-upload feature that happens to be reusable. It is the
session's blob store for anything destined to become binary LLM input, and a user
upload is simply its first producer. Concretely, this constrains the
implementation:

- **The store knows only `{fileName, mediaType, lastKnownByteSize}`.** No `uploadedBy`, no
  `source`, no user-specific field anywhere in `LlmAttachment` or in the store's
  API. If a later producer needs provenance, it belongs on the message, not on the
  attachment.
- **Naming carries no "user".** The module is
  `agent-core/agent/attachments/agent-attachment-store.ts`, alongside
  `agent-persistence.ts` and `agent-scratch-directory-service.ts`; the type is
  `LlmAttachment`, not `UserAttachment`.
- **The store's write API takes a stream and a desired name**, not an HTTP request.
  The HTTP upload endpoint is a thin caller. A producer holding in-memory bytes
  (an MCP tool result) must be able to use the same API without going through HTTP.
- **Name collisions are resolved by the store, not the caller** — every producer
  writes into one flat namespace per session, so uniquifying has to live at the
  bottom.

Anticipated producers beyond user upload: tool results
([#388](https://github.com/Soulike/OmniCraft/issues/388)), and any future
"attach a workspace file" or MCP-resource path. Building these constraints in now
costs nothing; retrofitting them after a `UserAttachment` type has spread across
eight layers is a rename through the whole stack.

## Types

### Persisted (`@omnicraft/tool-schemas`)

`llmAttachmentSchema` is referenced from three packages — the backend's message
schema, the SSE event schema, and the HTTP upload response — so it lives in the
neutral leaf package next to `media-type-schemas.ts`, exactly where #372 put the
media-type enums and for the same reason. `packages/sse-events` already depends on
`@omnicraft/tool-schemas`; `packages/api-schema` gains that dependency (it is a
leaf with only a `zod` dependency, so no cycle is possible).

```ts
// packages/tool-schemas/src/attachment-schemas.ts
export const llmAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mediaType: z.union([imageMediaTypeSchema, documentMediaTypeSchema]),
  lastKnownByteSize: z.number().int().nonnegative(),
});

export type LlmAttachment = z.infer<typeof llmAttachmentSchema>;
```

### Persisted (`agent-core/llm-api/types.ts`)

```ts
export const llmUserMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('user'),
  // Defaulted so snapshots written before attachments still validate, restoring
  // as an empty list — same convention as `todos` in agentSnapshotSchema.
  attachments: z.array(llmAttachmentSchema).default([]),
});
```

`llmMessageBaseSchema` is untouched. `content` remains `z.string()` for user
messages.

### Request-time (not persisted, no schema needed)

```ts
export interface ResolvedLlmAttachment extends LlmAttachment {
  /** base64 of the file; `null` when the file is no longer on disk. */
  readonly data: string | null;
}

export interface LlmRequestUserMessage extends Omit<
  LlmUserMessage,
  'attachments'
> {
  readonly attachments: readonly ResolvedLlmAttachment[];
}

export type LlmRequestMessage =
  | LlmRequestUserMessage
  | LlmAssistantMessage
  | LlmToolResultMessage;
```

`LlmCompletionOptions.messages` and `LlmTokenCountOptions.messages` take
`readonly LlmRequestMessage[]` — both end in a real provider call
(`streamCompletion`, and `client.messages.countTokens` in `claude/token-count.ts`),
so both need bytes. The split is honest: disk stores references, the wire carries
bytes.

**`estimatePromptTokens` is the exception and must not be widened.** It is called
from two places with two different message types: from
`llm-compaction-token-estimator.ts` with the session's **persisted** messages, and
as the failure fallback inside both `token-count.ts` adapters with **resolved**
messages. It only ever reads `mediaType`, never `data`. So
`PromptTokenInput.messages` becomes
`readonly (LlmMessage | LlmRequestMessage)[]` — a union, because neither type is
assignable to the other (`data` is required on `ResolvedLlmAttachment`, and a
`readonly` element-type widening does not hold in the other direction). Resolving
attachments merely to count tokens would be pointless work: the estimate is a
bounded per-type constant.

### Resolution seam

`LlmSession` takes an injected resolver:

```ts
type AttachmentResolver = (attachment: LlmAttachment) => Promise<string | null>; // base64, or null when missing
```

`Agent` binds one to its own attachments directory and passes it down.
`agent-core` therefore never reaches up into `services/`, and tests inject a fake.
A `LlmSession` constructed without a resolver resolves everything to `null`. In this
spec that covers sub-agents, which have no producer wired up — but the resolver is a
constructor parameter rather than a `MainAgent`-only concern precisely so #388 can
give sub-agents one without reshaping the seam.

`data === null` renders as a text block `[attachment missing: invoice.pdf]` rather
than being silently dropped, so the model is told rather than confused.

## Provider adapters

A shared block→provider mapper is extracted from the existing tool-result mappers
so one place knows how a media block becomes provider content. The tool-result path
keeps its current behavior.

The user branch in each adapter:

```ts
case 'user': {
  if (message.attachments.length === 0) {
    return {role: 'user', content: message.content}; // unchanged, bare string
  }
  return {
    role: 'user',
    content: [...attachmentBlocks, {type: 'text', text: message.content}],
  };
}
```

| Attachment | Anthropic                                                                       | OpenAI Responses                                              |
| ---------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| image      | `{type:'image', source:{type:'base64', media_type, data}}`                      | `{type:'input_image', image_url:'data:<mime>;base64,<data>'}` |
| document   | `{type:'document', source:{type:'base64', media_type:'application/pdf', data}}` | `{type:'input_file', filename, file_data:'data:…'}`           |
| missing    | `{type:'text', text:'[attachment missing: …]'}`                                 | `{type:'input_text', text:'[attachment missing: …]'}`         |

**Media before text, deliberately.** Anthropic documents this ordering as the
better one, and it also resolves a latent hazard: `addCacheBreakpoint`
(`claude/helpers.ts:115-138`) currently special-cases string content, and its array
branch `Object.assign`s `cache_control` onto the **last** block. With media first,
that last block is always the text block, which the existing `AssertCacheControl`
checks already cover.

## HTTP API

Mirrored under `/api/chat/...` and `/api/coding/...`, following the existing
near-identical router pair.

```
POST   /api/chat/session/:id/attachments?name=<original filename>
       Content-Type: <ignored>, body = raw bytes
       201 {fileName, mediaType, lastKnownByteSize}     fileName may differ — see pipeline
       400 unsupported media type / invalid name
       413 over the per-type cap
       404 session not found

GET    /api/chat/session/:id/attachments/:fileName
       200 raw byte stream, Content-Type: <mediaType>
           Cache-Control: private, max-age=31536000, immutable
       404 session or file not found

DELETE /api/chat/session/:id/attachments/:fileName
       204 removed
       404 session or file not found
       409 already sent to the model (frozen — see below)

POST   /api/chat/session/:id/completions
       {message: string /* min 1 */, attachmentFileNames?: string[]}
```

**`completions` takes file names, not descriptors.** `Agent.claimAttachments` turns
each name into a `LlmAttachment` by re-stating and re-sniffing the file on disk, so a
client cannot misreport `mediaType` or `lastKnownByteSize`, and the descriptor persisted in the
snapshot always matches the bytes. An unknown or unreadable name is a 400 and the turn
does not start.

**The per-message cap lives on the Agent, and is asserted again below it.** It is
load-bearing for compaction rather than a presentation concern — a single message over
`COMPACTION_TRIGGER_ATTACHMENT_BYTES` would trip a compaction that cannot relieve it,
since compaction's only lever is dropping attachments from _older_ messages. So
`claimAttachments` enforces it and returns `attachments-too-large` (413), which each
session service forwards unchanged, and `Agent.runTrackedTurn` — where
`enqueueUserTurn` and `tryStartUserTurn` both land — `assert`s the same bound. The two
are not redundant: the first is a business outcome for names resolved off disk; the
second catches a producer that assembled descriptors some other way, which is a bug in
this process and not something a client did, so it throws.

The cap runs **last**, after the freeze, because it needs sizes and the sizes must
come from the pinned file (see "Freeze first, then describe" below). A claim the cap
rejects therefore leaves its attachments frozen without them ever reaching the model —
accepted, for the reasons under "A stranded claim is inert".

**`Cache-Control` middleware fix.** `dispatcher/index.ts:15-18` sets
`no-store` on every `/api` response _after_ `await next()`, overwriting whatever a
handler set. It changes to only set `no-store` when the handler left
`Cache-Control` unset. Attachment bytes are immutable for a given name, so the
download endpoint is aggressively cacheable.

## Upload pipeline

1. Validate `:id` as a UUID (`parseSessionId`) → 404. Ensure the session exists.
   Create `<scratch>/attachments/` on demand (`mkdir` recursive) **after** the
   scratch directory itself has been resolved and validated by
   `agentScratchDirectoryService`, so the existing symlink check still gates the
   `{agentId}` segment.
2. Sanitize `?name`: take the basename only, strip path separators and control
   characters, reject empty, cap length at 255.
3. Stream `ctx.req` into `<attachments>/.<uuid>.tmp` while counting bytes. Past the
   **larger** of the two caps (10 MB) — the type is not yet known — destroy the
   stream and unlink → 413.
4. `fileTypeFromFile(tmp)` → narrow the sniffed MIME through
   `imageMediaTypeSchema` / `documentMediaTypeSchema` `.safeParse`. Anything else:
   unlink → 400. The client's `Content-Type` header is never trusted.
5. Re-check the byte count against the type-specific cap (image 5 MB, PDF 10 MB) → 413.
6. **Force the extension to match the sniffed type.** A file claiming `.png` that is
   really a PDF is stored as `.pdf`, so neither the model reading the path list nor
   the frontend is misled.
7. Uniquify on collision (`invoice.pdf` → `invoice (2).pdf`).
8. `rename` tmp → final. Return `{fileName, mediaType, lastKnownByteSize}`.

### Path safety

`:fileName` must be a pure basename, and the resolved absolute path must still be
inside the attachments directory after `realpath`. This follows the pattern and
reasoning already documented in `agent-scratch-directory-service.ts:23-43`
(a symlink pre-planted at a path segment can otherwise escape the root).
`@koa/router` decodes percent-encoded slashes, which is exactly why
`dispatcher/helpers/session-id.ts` exists — the same care applies here.

### The download opens under constraint, and asks the handle

`describe` refuses a symlink (it `lstat`s and requires a regular file), but that
refusal does not carry over to the route's `open()` — the two resolve the same name
at different moments, and `open` by path follows links. A link planted in that gap
turned the endpoint into an arbitrary file read returning `200`.

So the open is constrained rather than re-validated: `O_NOFOLLOW` makes the kernel
refuse a symlinked final component, and `O_NONBLOCK` keeps a planted FIFO from
blocking the request until a writer appears (verified: without it the request hangs
rather than fails). Neither flag changes anything for a regular file. `ELOOP` joins
`ENOENT` as a 404 — to a client, "not a servable attachment" is one answer.

`O_NOFOLLOW` does not cover a directory or a device node, so the `fstat` already
taken for `Content-Length` also gates on `isFile()`. Asking the open handle is what
makes it final: a third path resolution would just be one more moment for something
to change underneath.

This is the same correction as the two above it — bind to the object you actually
operate on, never re-resolve the name — applied to the last place in the request
that was still trusting a path.

### Frozen once sent

An attachment is a **mutable file until the moment its bytes reach the model, and a
permanent fact afterwards.** `Agent.claimAttachments` sets the file to `0400`, and
`remove()` refuses a file without the owner-write bit (409, not 404 — the file is
there; the request conflicts with a state it cannot leave).

#### Freeze first, then describe

Both steps resolve by **file name**, and they are separate awaits, so anything landing
between them can swap the file a name points at — a `DELETE` plus a same-name
re-upload suffices, since `placeUniquely` always starts at the bare name. Describing
first records a `lastKnownByteSize` for one file and then pins whatever occupies the name a
moment later. That is the stale-descriptor bug freezing exists to prevent, reintroduced
one layer down; an early version of this shipped with it.

Ordering fixes it with no identity tracking, because the invariant needed is _"the
descriptor describes the frozen bytes"_ — **not** "the descriptor describes the file
that was there when the request arrived". Which file wins a race does not matter. Once
`freeze` returns, `remove` refuses the name, so it cannot be released and rebound, and
`describe` necessarily reads the file that was pinned. If a swap beats the `chmod`
itself, the new file is both pinned and described, which is equally consistent.

#### A stranded claim is inert

A claim can freeze files that never reach the model: the cap rejects it, `describe`
refuses the type, or the turn is aborted or fails before delivery (`sendMessages` rolls
the user message back on any incomplete stream, which includes an ordinary user abort).

Accepted, and deliberately not released. Such a file is **unreachable** — there is no
list endpoint and nothing enumerates the directory, so no client can see it. It
contributes nothing to the byte accounting, which sums over history. Its only cost is
disk space (bounded by the per-file caps, and the subject of #390) and a ` (2)` suffix
on the next upload of the same name.

Releasing it would have to distinguish "frozen by this claim" from "frozen by an
earlier message that also referenced this name", and every form of that check misfires
after compaction — where an attachment survives only as a path in the summary and so
reads as unreferenced. Freeing it there would leave the summary pointing at a name the
user can now delete. That trades an invisible leak for a dangling reference, which is
the class of bug this section exists to prevent.

This is what makes the byte accounting true rather than approximate. The compaction
trigger, the per-message cap, and the per-file caps all compare against a `lastKnownByteSize`
recorded when the message was sent, while `toRequestMessages` re-reads the bytes from
disk on every round. If a name could be freed and rebound, those two would diverge:
ten descriptors accepted at 1 KiB, deleted, and re-uploaded as 2 MiB files would
materialize 20 MiB against accounting that still read 10 KiB. Worse than the budget
hole, a historical turn's content could change under a model that had already reasoned
about it — it would see image B where it had reasoned about image A, with no signal.

Freezing closes this for every path with an API contract. `placeUniquely` never
overwrites (it falls through to `(2)` on EEXIST), so freeing the name via `DELETE` was
the _only_ way an API caller could rebind it.

**The marker is the file mode, not a registry.** No snapshot field, no back-compat
default, no question about what compaction does to it, and it survives a restart.

**Known and accepted:** `run_command` has no write allowlist — only a _cwd_ allowlist
(`run-command.ts:120-140`) — so the agent can still `chmod` the bit back and overwrite
a frozen file with an absolute path. The read-only bit stops a mistake, not an intent.
What closes the gap is that the agent has no reason to try: a file that is read-only is
one it has already been shown, and re-reading gives it exactly what it already has. The
system prompt says so, and says to write a modified copy elsewhere under a new name
(`system-prompts/attachments.ts`). A file that disappears anyway still degrades safely:
the download endpoint 404s, the adapter emits `[attachment missing: …]`, and the
frontend shows a placeholder.

## Attachment content is untrusted, and that changes nothing

A PDF or image goes into the same `user` message as the typed request, so a document
can try to steer the model into tool calls the user never asked for. There is no
confirmation boundary in front of tool execution — `AgentTurnRunner` runs what the
model returns.

**Accepted by design.** OmniCraft is deliberately a YOLO agent: no tool-approval gate
anywhere. Gating only attachment-bearing turns would be worse than gating nothing,
because the same untrusted content already arrives through `read_file` on a repository
file, `web_fetch` on a page, and any MCP tool result — a door on the newest entrance
implies a boundary the other entrances do not have. And prompt injection has no
complete defense to reach for in the first place.

By provenance, attachments are the _most_ trustworthy of those channels, not the least:
the user picked the file. `web_fetch` retrieves a URL the user may never have seen.

Revisit this only as a product-wide decision about tool-call approval — never as an
attachment-specific mitigation.

- `chatAgentSessionService.sendCompletion(id, message, attachments)`
- `Agent.enqueueUserTurn(userMessage, attachments)` → `AgentTurnRunner` →
  `LlmSession.sendUserMessage(content, attachments, …)`
- `sseMessageStartEventSchema` gains
  `attachments: z.array(llmAttachmentSchema).default([])`. Old event-log lines keep
  parsing. No base64 and no absolute paths cross this boundary.
- Title generation is unaffected: it reads `event.content`, which is still plain
  text, and `message` is still `.min(1)`.

## Compaction

`llm-history-compactor` replaces the whole history with one synthetic `role: 'user'`
text message, so attachments would otherwise vanish from the model's view. Two
changes:

**`compaction-message-slimmer.ts`** — the user branch appends an attachment
placeholder to the projected text before truncation, mirroring what the tool branch
already does via `toolResultBlocksToText`:

```
[attachment: invoice.pdf (application/pdf, 235 KB)]
```

Base64 never enters a compaction summary, and character-based truncation never sees
binary.

**`llm-history-compactor.ts`** — before replacing history, collect every
`LlmAttachment` from the messages being compacted, dedupe by `fileName`, and append
to the synthetic message:

```
## Attachments you saw earlier in this conversation

You have already seen these files. They were dropped from the context by
compaction, but they are still on disk — read them again if you need them.

- /abs/…/scratch/attachments/invoice.pdf — application/pdf, 235 KB
- /abs/…/scratch/attachments/shot.png — image/png, 812 KB
```

**The wording names neither the source nor a tool.** Two deliberate omissions:

- **No source attribution.** What the model needs to act correctly is that it has
  seen the files, that they are gone from context, and that they are still
  readable — not who produced them. Attributing them to the user would also go
  stale the moment [#388](https://github.com/Soulike/OmniCraft/issues/388) lets a
  tool result land in the same list, and would mislead the model about a
  tool-produced file.
- **No tool name and no size caveat.** Hardcoding `read_file` couples this string
  to one built-in tool's existence and name, across agents whose tool catalogs
  differ. Restating the 1 MB media limit would duplicate a number that
  `read_file`'s own description and failure message already interpolate from
  `MAX_INLINE_MEDIA_BYTES` — a second source of truth that silently goes stale when
  the constant changes (and it will change; see
  [#388](https://github.com/Soulike/OmniCraft/issues/388)). The model has each
  file's size in the list, and an over-cap read fails with an actionable message
  telling it exactly how to proceed.

Absolute paths, because in a coding session `workingDirectory` is the workspace and
the scratch space is elsewhere. (In a chat session `workingDirectory` _is_ the
scratch directory, so a relative path would also work there — absolute covers both.)

## Token estimation

`estimateMessageTokens` (`llm-api/token-estimator.ts:56-58`) currently returns
`estimateText(message.content)` for user messages. It gains the per-attachment
term using the existing bounded constants:

```
estimateText(content) + Σ (IMAGE_TOKEN_ESTIMATE | DOCUMENT_TOKEN_ESTIMATE)
```

Reference storage already keeps base64 out of `content`, so the pathological
"1 MB PDF estimated as 350 000 tokens" case cannot arise — but without this the
estimate under-counts and compaction fires too late.

## Two caps, deliberately different (until #388)

| Cap                                         | Value | Protects                                       |
| ------------------------------------------- | ----- | ---------------------------------------------- |
| `MAX_INLINE_MEDIA_BYTES` (`read_file`, MCP) | 1 MB  | `snapshot.json` — this base64 is **persisted** |
| Upload cap (image)                          | 5 MB  | Per-request bytes only                         |
| Upload cap (PDF)                            | 10 MB | Per-request bytes only                         |

Raising `MAX_INLINE_MEDIA_BYTES` to match would let a 5 MB MCP tool image inline
itself into every snapshot write — precisely what that cap exists to prevent. As
long as tool-result media stays inline, the two protect different things and stay
different.

The consequence is explicit and acceptable: an attachment over 1 MB **cannot be
re-read directly** after compaction; `read_file` fails with its existing actionable
message telling the agent to downsample or extract pages first, which it can do with
`run_command` inside the scratch space. The compaction path list carries each
file's size so the model knows before it tries.

**This whole section is temporary.** Once
[#388](https://github.com/Soulike/OmniCraft/issues/388) moves tool-result media onto
this store, no persisted base64 remains, `MAX_INLINE_MEDIA_BYTES` loses its
snapshot-protecting job, and the caps collapse into a single per-request budget —
taking the "cannot be re-read after compaction" wart with them. It is the main
reason #388 is worth doing.

Image sizing rationale: Anthropic's per-image limit is 5 MB, and image token cost is
already flat (`IMAGE_TOKEN_ESTIMATE = 1600`) because providers downsample anything
above ~1.15 MP — so a larger cap costs request bytes, not tokens. PDFs are capped
lower relative to the provider limit (32 MB) because PDF token cost scales with page
count while `DOCUMENT_TOKEN_ESTIMATE` is a flat 3000; accurate page-based estimation
is tracked in [#373](https://github.com/Soulike/OmniCraft/issues/373).

## Bounding total request bytes

Per-file caps bound one attachment; they do not bound a **request**, which carries
every attachment still in history. Four 10 MB PDFs accumulated over a session are
~53 MB of base64 in every subsequent request — past the provider's 32 MB request
limit — and the token estimator cannot detect it, because image and document
estimates are deliberately flat (a correct choice for tokens; useless as a byte
backstop). Without a bound, such a session wedges permanently: every turn fails at
the provider and no amount of waiting clears it.

**Compaction is the existing lever, so byte pressure triggers compaction.** It
already exists for "context grew too large", it already emits the SSE event the
frontend renders, and it already ends with the attachment file list telling the
model the files are still on disk. Crucially it also _works_: compaction replaces
the whole history with one synthetic message carrying `attachments: []`, so
attachment bytes drop to whatever the newest message carries.

Two constants, and the relationship between them is load-bearing:

| Constant                              | Value | Enforced at                                                           |
| ------------------------------------- | ----- | --------------------------------------------------------------------- |
| `MAX_MESSAGE_ATTACHMENT_BYTES`        | 12 MB | the completions endpoint — over it is a 413 and the turn never starts |
| `COMPACTION_TRIGGER_ATTACHMENT_BYTES` | 16 MB | the compaction decision, alongside the existing token ratio           |

**`MAX_MESSAGE_ATTACHMENT_BYTES` must stay strictly below
`COMPACTION_TRIGGER_ATTACHMENT_BYTES`, and at or above the largest per-file cap.**
Both bounds are real constraints, not tuning:

- **Below the trigger.** `LlmSession.sendMessages` appends the new message to
  history _before_ `compactBeforeModelCall` runs. If one legal message could reach
  the trigger on its own, compaction would fire on the very turn the attachment
  arrived — the model would never see the image, only a summary of it — and after
  compaction that same message would still sit above the trigger, re-firing
  compaction on every following turn.
- **At or above the largest per-file cap** (10 MB, for PDFs), or a single legal PDF
  could never be sent.

12 MB decoded is ~16.5 MB as base64; 16 MB is ~22 MB, leaving ~10 MB of the
provider's 32 MB for text, tool definitions, and the system prompt.

### The bound lives at materialization

`MAX_MATERIALIZED_ATTACHMENT_BYTES` (`llm-api/attachment-limits.ts`) caps the
attachment bytes one provider request may carry, charged against what each read
**actually returns** — never against a recorded `lastKnownByteSize`.

That distinction is the whole design. Every other limit here is checked against a
record, and a record can be defeated: the attachments directory must stay writable
for uploads to land, so anything running as this process's user can replace a file,
and `unlink` plus recreate does it without ever consulting the frozen read-only bit.
Ten attachments recorded at 1 KiB can each be 2 MiB on disk; the compaction trigger
would see 10 KiB while the request carried 20 MiB. No permission scheme closes that,
which is why the defense cannot be another record.

It lives in `llm-api` rather than beside the per-file caps in `cap-for.ts` because it
is a statement about what a _provider request_ may carry — the per-file caps are
store-admission policy — and because `llm-session`, which enforces it while building
the request, cannot reach `agent/`: the dependency runs `agent` → `llm-session` →
`llm-api`, never back.

Two properties of `toRequestMessages`' walk are load-bearing:

- **Sequential, not `Promise.all`.** A running budget is meaningless if the reads
  race — each would see the same "remaining" and the total could overshoot
  arbitrarily.
- **Newest attachment first.** History is oldest-first, so charging in that order
  would spend the budget on stale turns and drop the image the user just asked
  about. Resolution order is reversed; emission order is not.

Over-budget attachments resolve to the existing `too-large` placeholder, so a turn
degrades rather than fails. Reaching the ceiling at all means the accounting was
already wrong, which is why it sits strictly above the compaction trigger — see
`compaction-constants.test.ts`.

`llmApi.streamCompletion` then `assert`s the same bound before dispatching to a
provider adapter, the same two-layer shape the per-message cap uses
(`claimAttachments` enforces, `runTrackedTurn` asserts). Not redundant: by that point
degrading is no longer possible, so arriving over budget means a producer assembled
request messages without going through `toRequestMessages`. Two such producers already
exist — `compaction-summary-generator` and `agent-title` build their own
`LlmRequestMessage[]` and call `streamCompletion` directly. Both pass
`attachments: []` today, and both would still compile if they stopped. The check sits
before the provider dispatch, so it covers every adapter, and it sums what each
attachment actually delivered — never a `lastKnownByteSize`, which is precisely the
thing this limit exists not to trust.

**Known imprecision, accepted.** The sum uses each descriptor's
`lastKnownByteSize`, not a fresh `stat`. Anything running as this process's user can
replace a file in the scratch space, so a recorded size can be stale — and no
permission scheme prevents that, since `unlink` plus recreate never consults the
frozen file's mode. Under-reporting only delays compaction; it cannot lose data.
Re-`stat`ing every attachment on every compaction decision would put I/O on the hot
path to sharpen a number that is a _scheduling hint_, not a bound.

The bound lives at materialization instead, where the bytes are actually read and can
therefore be measured rather than trusted. That is the division `lastKnownByteSize`'s
name is meant to keep visible: display and scheduling may use the record; anything
that bounds memory, frames a response, or decides what to send must measure.

**Out of scope, and not a small gap:** tool-result media still inlines base64 in
message content (see [#388](https://github.com/Soulike/OmniCraft/issues/388)) and
`COMPACTION_TRIGGER_ATTACHMENT_BYTES` does not count it — that sum only walks
`role: 'user'` messages' `attachments` (`sumUserAttachmentBytes` in
`llm-compaction-decision-service.ts`). This is not merely inert: the compaction
notice above (`## Attachments you saw earlier…`) actively **invites** the model to
re-read those files, and each re-read comes back as a tool-result media block —
capped at 1 MB per block by `MAX_INLINE_MEDIA_BYTES`, but invisible to the byte
trigger regardless of how many blocks accumulate. A model that repeatedly re-reads
files after compaction can still grow a request without ever tripping
`COMPACTION_TRIGGER_ATTACHMENT_BYTES`. Do not read the byte trigger as a bound on
_all_ request media — it only bounds upload attachments. What actually bounds the
re-read loop is the **token** trigger: `estimateTokensFromLatestUsage` prefers the
provider's own `usage.currentContextInputTokens`, which reflects every token
actually sent, tool-result media included, so `COMPACTION_TRIGGER_PROMPT_TOKEN_RATIO`
still catches the growth even though the byte sum does not.

## Change-site checklist

**Schemas**

- `packages/tool-schemas/src/attachment-schemas.ts` — new: `llmAttachmentSchema`,
  `LlmAttachment` (the cross-package contract)
- `packages/api-schema` — gains a `@omnicraft/tool-schemas` dependency;
  `attachmentFileNames` on the completions request; upload response schema
- `packages/sse-events/src/schema.ts` — `attachments` on `sseMessageStartEventSchema`
- `agent-core/llm-api/types.ts` — `llmUserMessageSchema.attachments`,
  `LlmRequestMessage`, `LlmCompletionOptions` / `LlmTokenCountOptions`
- `agent-core/llm-api/token-estimator.ts` — `PromptTokenInput.messages` widened to the
  `LlmMessage | LlmRequestMessage` union; user-message attachment term
- `agent-core/llm-api/index.ts` — export surface

**Adapters**

- `llm-api/claude/helpers.ts` — user branch; extract the shared block mapper
- `llm-api/openai-responses/helpers.ts` — user branch (`ResponseInputMessageContentList`,
  not the tool-result-specific list type); same shared mapper

**Storage + service**

- `agent-core/agent/persistence/agent-persistence.ts` — `attachmentsPath`
- new `agent-core/agent/attachments/agent-attachment-store.ts` — save from a stream,
  resolve to base64, delete, uniquify, path safety. Source-agnostic (see
  [The attachment store is source-agnostic](#the-attachment-store-is-source-agnostic)).
- `agent-core/agent/agent.ts` — `saveAttachment` / `describeAttachment` /
  `removeAttachment` / `claimAttachments`. The Agent owns its scratch space, so
  it owns operations on it; nothing outside needs its path.
- new `services/agent-attachments/` — one `createAgentAttachmentService(getStore)`
  factory. The only per-family difference is which store resolves the id, and that
  lookup is the access boundary, so the two bindings stay separate.
- new `dispatcher/helpers/attachment-routes.ts` — the three handlers registered
  once and bound to both routers.

**Dispatcher**

- `dispatcher/{chat,coding}-agent-session/{path,router}.ts` — three new routes,
  widened completions body
- `dispatcher/index.ts` — conditional `Cache-Control`

**Session / agent**

- `llm-session/llm-session.ts` — `sendUserMessage` signature, resolver, resolution
  before `streamCompletion`
- `agent-core/agent/agent.ts`, `agent-turn-runner.ts` — thread `attachments`
- `llm-session/compaction/compaction-message-slimmer.ts`, `llm-history-compactor.ts`

## Testing strategy

- **Upload pipeline:** name sanitizing; collision uniquifying; extension corrected to
  the sniffed type; streaming abort past the cap (assert the temp file is unlinked);
  per-type cap enforcement; non-image/non-PDF rejected; lying `Content-Type` ignored.
- **Path safety:** `../`, absolute paths, percent-encoded separators, and a symlink
  planted inside the attachments directory are all rejected.
- **Adapters:** user message with 0 attachments emits a bare string (prefix
  unchanged); 1 image / 1 PDF / a missing file emit the expected provider shapes;
  media precedes text; the cache breakpoint lands on the text block.
- **Token estimator:** user message with attachments adds the bounded per-type term.
- **Compaction:** slimmer projects attachments to placeholders and never emits
  base64; compactor's path list is absolute, deduped by `fileName`, and carries sizes.
- **Back-compat:** a snapshot without `attachments` parses; an `sse-events.jsonl`
  line without `attachments` parses. No migration script is needed.
- **Round trip:** upload → completions → assert `snapshot.json` contains the
  descriptors and **no base64**, and that the bytes are at the expected scratch path.

## Tunables / known costs

- **Caps** — image 5 MB, PDF 10 MB. Chosen to be revisited; nothing depends on the
  exact values.
- **Per-turn re-read.** History is re-sent to the provider on every tool round
  (`llm-session.ts:313`), so every attachment is re-read and re-encoded each round.
  A turn with 5 images and 10 tool rounds is ~150 MB of read+encode — a few hundred
  ms on local SSD. A process-wide LRU keyed by path+mtime would eliminate it, but
  costs memory against a 50-session agent cache. Deliberately **not** added; measure
  first.
- **Orphans.** An attachment uploaded and then not sent stays in the session's
  scratch space. The explicit `DELETE` endpoint covers the user removing it; session
  deletion covers everything else. No sweeper.
