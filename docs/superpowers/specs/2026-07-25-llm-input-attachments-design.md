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
   `{fileName, mediaType, byteSize}`; the bytes live in a file. Base64 is
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
  snapshot.json          attachments: [{fileName, mediaType, byteSize}]
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

**No absolute path is ever persisted.** `DATA_DIR` is configurable and a data
directory can be backed up and restored elsewhere; a stored absolute path would rot.
Paths are always derived from `sessionsDir + agentId + fileName` at use time.
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

- **The store knows only `{fileName, mediaType, byteSize}`.** No `uploadedBy`, no
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

### Persisted (`agent-core/llm-api/types.ts`)

```ts
export const llmAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mediaType: z.union([imageMediaTypeSchema, documentMediaTypeSchema]),
  byteSize: z.number().int().nonnegative(),
});

export type LlmAttachment = z.infer<typeof llmAttachmentSchema>;

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
       201 {fileName, mediaType, byteSize}     fileName may differ — see pipeline
       400 unsupported media type / invalid name
       413 over the per-type cap
       404 session not found

GET    /api/chat/session/:id/attachments/:fileName
       200 raw byte stream, Content-Type: <mediaType>
           Cache-Control: private, max-age=31536000, immutable
       404 session or file not found

DELETE /api/chat/session/:id/attachments/:fileName
       204 / 404

POST   /api/chat/session/:id/completions
       {message: string /* min 1 */, attachmentFileNames?: string[]}
```

**`completions` takes file names, not descriptors.** The **service layer** turns
each name into a `LlmAttachment` by re-stating and re-sniffing the file on disk
before calling `Agent.enqueueUserTurn`, so a client cannot misreport `mediaType` or
`byteSize`, and the descriptor persisted in the snapshot always matches the bytes.
An unknown or unreadable name is a 400 and the turn does not start.

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
8. `rename` tmp → final. Return `{fileName, mediaType, byteSize}`.

### Path safety

`:fileName` must be a pure basename, and the resolved absolute path must still be
inside the attachments directory after `realpath`. This follows the pattern and
reasoning already documented in `agent-scratch-directory-service.ts:23-43`
(a symlink pre-planted at a path segment can otherwise escape the root).
`@koa/router` decodes percent-encoded slashes, which is exactly why
`dispatcher/helpers/session-id.ts` exists — the same care applies here.

**Known and accepted:** the agent can modify or delete files under `scratch/`, so an
attachment referenced by a past message can disappear. The download endpoint 404s,
the adapter emits `[attachment missing: …]`, and the frontend will show a
placeholder. Guarding against this is not worth the complexity.

## Agent plumbing

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
compaction, but they are still on disk — re-read any of them with read_file if you
need them again (media over 1 MB must be reduced with a shell command first).

- /abs/…/scratch/attachments/invoice.pdf — application/pdf, 235 KB
- /abs/…/scratch/attachments/shot.png — image/png, 812 KB
```

**The wording deliberately says nothing about where the files came from.** What the
model needs to act correctly is that it has seen them, that they are gone from
context, and that they are still readable — not who produced them. Attributing them
to the user would also go stale the moment
[#388](https://github.com/Soulike/OmniCraft/issues/388) lets a tool result land in
the same list, and would mislead the model about a tool-produced file.

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

## Change-site checklist

**Schemas**

- `agent-core/llm-api/types.ts` — `llmAttachmentSchema`, `llmUserMessageSchema.attachments`,
  `LlmRequestMessage`, `LlmCompletionOptions` / `LlmTokenCountOptions`
- `agent-core/llm-api/token-estimator.ts` — `PromptTokenInput.messages` widened to the
  `LlmMessage | LlmRequestMessage` union; user-message attachment term
- `agent-core/llm-api/index.ts` — export surface
- `packages/api-schema/src/chat/schema.ts` — `attachmentFileNames` on the completions
  request; upload request/response schemas
- `packages/sse-events/src/schema.ts` — `attachments` on `sseMessageStartEventSchema`

**Adapters**

- `llm-api/claude/helpers.ts` — user branch; extract the shared block mapper
- `llm-api/openai-responses/helpers.ts` — user branch (`ResponseInputMessageContentList`,
  not the tool-result-specific list type); same shared mapper

**Storage + service**

- `agent-core/agent/persistence/agent-persistence.ts` — `attachmentsPath`
- new `agent-core/agent/attachments/agent-attachment-store.ts` — save from a stream,
  resolve to base64, delete, uniquify, path safety. Source-agnostic (see
  [The attachment store is source-agnostic](#the-attachment-store-is-source-agnostic)).
- `services/{chat,coding}-agent-session/` — upload / download / delete delegation,
  and name → `LlmAttachment` resolution for the completions request

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
