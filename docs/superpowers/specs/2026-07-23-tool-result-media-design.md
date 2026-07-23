# Deliver media in tool results to the LLM

- **Issue:** [#368 — Support non-text content in tool results](https://github.com/Soulike/OmniCraft/issues/368)
- **Follow-up (frontend rendering + media over SSE):** [#371](https://github.com/Soulike/OmniCraft/issues/371)
- **Date:** 2026-07-23
- **Status:** Approved design, ready for implementation plan

## Problem

The tool-result channel is text-only end to end. `ToolExecuteResult.content` is a
`string`, and both LLM adapters serialize a tool result as text
(`function_call_output.output` for OpenAI, a text `tool_result` for Claude).
Consequently, MCP tools that return `image` / `audio` / embedded-resource `blob`
content are collapsed to compact placeholders by `renderContentText`
(`apps/backend/src/agent/tools/mcp/mcp-tool-registry.ts`) — the bytes never reach
the model — and built-in tools cannot return non-text content at all.

Both pinned SDKs already accept media directly, with no Files API and no beta:

- **Anthropic** (`@anthropic-ai/sdk` 0.104.x): `ToolResultBlockParam.content` accepts
  `Array<TextBlockParam | ImageBlockParam | DocumentBlockParam | …>`; images take a
  base64 or URL source, documents a base64 PDF / plain-text / URL source.
- **OpenAI Responses** (`openai` 6.x): `function_call_output.output` accepts
  `string | Array<ResponseInputText | ResponseInputImage | ResponseInputFile>`;
  images fold base64 into a `data:` URL in `image_url`, files carry base64 in
  `file_data`.

The gap is entirely on our side (the flattening in `renderContentText` and the
`string` contract), not the SDKs.

## Goals

- Let tools (MCP **and** built-in) return `image` and `document` content and deliver
  the bytes to the LLM, through a provider-agnostic neutral representation.
- Give `read_file` the ability to load a local image/PDF and return it as media.
- Keep the change faithful to how both providers model tool-result content (an
  ordered array of typed blocks).
- Preserve every text-only consumer (compaction, `compactResult` hooks, reminders).

## Non-goals (this spec)

- **Frontend rendering of media** and **carrying media over SSE** — deferred to
  [#371](https://github.com/Soulike/OmniCraft/issues/371). This spec keeps the
  `tool-execute-end` SSE event text-only.
- **Audio delivery** — undeliverable on both SDKs; stays a placeholder (with clearer
  wording). Only MCP tools can emit audio.
- **File-reference / provider Files API storage** — rejected (see Decisions).

## Key decisions

1. **Inline base64, not file references.** Persistence is a JSON text file
   (`snapshot.json`), so any persisted media must be a string; base64 (~1.33×) is the
   natural encoding and is exactly what MCP hands us and what both SDKs consume — no
   encode/decode anywhere in the pipeline. File references do **not** reduce token
   cost (providers re-tokenize the image every turn regardless); they only shrink disk
   and request bytes, at the cost of per-provider Files APIs (Anthropic's is beta), a
   public-URL assumption a self-hosted deploy may not satisfy, blob lifecycle, and a
   provider id that can't live in the neutral layer. Not worth it here.
2. **Block set = `text` + `image` + `document`. Audio → placeholder.** Covers issue
   #368's deliverable types with one shared mechanism; both providers support all
   three natively.
3. **`content` is always `ToolResultBlock[]`** — no `string | ToolResultBlock[]`
   union. A mechanical change across the built-in tools; keeps every downstream layer
   simple (one shape).
4. **Base64 lives only in `content` (→ LLM), never in `data` (→ frontend).** So no
   media bytes cross SSE in this spec; the FE keeps receiving a text projection.
5. **1 MB inline cap per media block**, `web_fetch`-style: oversize media spills to a
   scratch file and yields a text block with the path. Uniform cap (protects per-turn
   request + snapshot size, which is identical regardless of the media's origin).
6. **Breaking change accepted; one-time local snapshot conversion script** migrates
   existing sessions. No external users.

## The neutral content-block type

The media-type enums are the shared contract and live in **`@omnicraft/tool-schemas`**
(the neutral package agent-core already depends on), because both the `ToolResultBlock`
schema and `readFileResultSchema` reference them — defining them there avoids
duplication. `ToolResultBlock` itself lives in
`apps/backend/src/agent-core/llm-api/types.ts` (backend-only in this spec; #371 can
promote it when the FE needs it). Zod schemas are the source of truth since they are
persisted.

```ts
// in @omnicraft/tool-schemas — the binding-constraint set (Anthropic's base64 source
// unions); OpenAI takes a data URL so it does not constrain further. A narrow enum —
// NOT a bare string and NOT a general MIME package — keeps the neutral layer to
// exactly what both adapters can emit.
export const imageMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
export const documentMediaTypeSchema = z.literal('application/pdf');

// in agent-core/llm-api/types.ts — discriminated union on `type`
type ToolResultBlock =
  | {type: 'text'; text: string}
  | {type: 'image'; mediaType: ImageMediaType; data: string} // data = base64
  | {
      type: 'document';
      mediaType: DocumentMediaType;
      data: string;
      name?: string;
    }; // data = base64
```

- `text.text` is the always-available textual representation used by text-only
  consumers.
- `image` carries base64 `data` plus MIME from `imageMediaTypeSchema` (the four types
  both providers accept). An image whose MIME falls outside that set degrades to a
  placeholder text block.
- `document` is **PDF only** (`documentMediaTypeSchema` = `application/pdf`): Anthropic's
  base64 document source only supports PDF, so we constrain the block type to keep both
  providers symmetric. Non-PDF binary resources become placeholder text blocks (see the
  MCP bridge rules). `document` optionally carries a filename.

**Media-type robustness.** The enums are the tiny closed set Anthropic accepts, so
neither a bare `string` nor a general MIME package (`mime-db` / `mime-types`, which
would admit hundreds of unsupported types) is used. Two safeguards:

- The Claude adapter carries a **compile-time assertion** that `ImageMediaType` is
  assignable to `Anthropic.Base64ImageSource['media_type']` (following the existing
  `AssertCacheControl<Anthropic.ToolResultBlockParam>` pattern in
  `claude/helpers.ts`). An SDK bump that narrows the set breaks the build. The neutral
  schema itself stays SDK-independent.
- Producers (MCP bridge, `read_file`) run incoming MIME through the enum's
  `.safeParse`; anything outside the set → placeholder text block (enforced by the
  schema, not a hand-written check).

A shared helper `toolResultBlocksToText(blocks): string` derives a text projection:
`text` blocks pass through; `image` / `document` blocks render as placeholders
(`[image: screenshot.png (image/png)]`), matching today's `renderContentText` output.

## Size guard + spill (`web_fetch`-style)

A shared producer-side helper in `agent-core` (constant `MAX_INLINE_MEDIA_BYTES =
1 * 1024 * 1024`, defined once so it is easy to tune). It is used by producers that
hold **in-memory** bytes (the MCP bridge):

```
guardMedia({data, mediaType, name, scratchDirectory}) -> ToolResultBlock
  if byteSize(data) <= MAX_INLINE_MEDIA_BYTES  -> inline media block
  else -> spill bytes to a scratch file, return a text block:
          "[image too large (2.1 MB), saved to <path>]"
```

- Mirrors `web_fetch`'s `MAX_INLINE_SIZE` → `writeToTempFile(..., scratchDirectory)`
  spill.
- **`read_file` shares the constant but not the spill.** Its source is already a file
  on disk, so over-cap is a `failure` with actionable guidance (see the `read_file`
  section), not a scratch copy.
- **Caveat (documented):** a spilled >1 MB image cannot be re-loaded inline by
  `read_file` (same cap). The spill's value is byte preservation + an honest,
  actionable path, not round-tripping to the model.
- 1 MB will reject many real screenshots (2–3 MB PNGs); that is acceptable and even
  desirable (smaller images = fewer tokens), and the constant is tunable.

## Layer-by-layer changes (bottom-up)

### Adapters (`llm-api/claude/helpers.ts`, `llm-api/openai-responses/helpers.ts`)

Map `ToolResultBlock[]` → provider content arrays. Any block a provider cannot
represent degrades to a text placeholder (belt-and-suspenders; both accept all three
today). Message conversion is shared with token counting, so counts follow
automatically.

| Block    | Anthropic `tool_result.content[]`                                               | OpenAI `function_call_output.output[]`                        |
| -------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| text     | `{type:'text', text}`                                                           | `{type:'input_text', text}`                                   |
| image    | `{type:'image', source:{type:'base64', media_type, data}}`                      | `{type:'input_image', image_url:'data:<mime>;base64,<data>'}` |
| document | `{type:'document', source:{type:'base64', media_type:'application/pdf', data}}` | `{type:'input_file', file_data:'<base64>', filename}`         |

### Neutral message + session (`llm-api/types.ts`, `llm-session/*`)

- `llmToolResultMessageSchema` overrides `content` to `z.array(toolResultBlockSchema)`.
  User/assistant messages keep `content: z.string()`.
- `ToolResult.content` (`llm-session/types.ts`) → `ToolResultBlock[]`.
- `submitToolResults` builds `LlmToolResultMessage` from the blocks directly.

### Compaction (`llm-session/compaction/compaction-message-slimmer.ts`)

For a `role: 'tool'` message, project blocks to text with **every media block replaced
by its placeholder** before truncation — base64 never enters a compaction summary.
`ToolCompactResultInput.content` stays `string` (the media-stripped projection), so
existing `compactResult` hooks (e.g. `web_fetch`) are untouched.

### Tool executor + turn runner (`agent/agent-tool-executor.ts`, `agent/agent-turn-runner.ts`)

- `ExecuteAgentToolResult.content` → `ToolResultBlock[]`; the `catch` error path
  returns `[{type:'text', text:'Error: …'}]`.
- Turn runner's unknown-tool result → `[{type:'text', text:'Error: Unknown tool: …'}]`.
- `toolResults` map stores blocks.
- SSE `tool-execute-end.result` is set from `toolResultBlocksToText(blocks)` (string;
  unchanged schema). `data` unchanged.

### Tool contract (`agent-core/tool/types.ts`)

- `ToolExecuteSuccessResult.content` and `ToolExecuteFailureResult.content` →
  `ToolResultBlock[]`.
- Every built-in tool updated to return `content: [{type:'text', text: …}]` (mechanical;
  includes tests). No helper — the change is small.

### MCP bridge (`agent/tools/mcp/mcp-tool-registry.ts`)

Replace `renderContentText` with a block builder producing `ToolResultBlock[]` from
`CallToolResult.content`:

- `text` → text block.
- `image` → image block via `guardMedia`.
- `resource` embedded text → text block.
- `resource` blob with image/PDF MIME → media block via `guardMedia`; otherwise a
  placeholder text block.
- `resource_link` → text block with the URI (as today).
- `audio` → **placeholder text block**: `[unsupported audio content (audio/wav): not
delivered to the model]`.

The empty-content / `structuredContent` fallback is preserved (as a text block).

### `read_file` media loading (`agent/tools/file/read-file.ts` + schema + widget)

- **Detection: content sniffing via the `file-type` package**, not extension.
  `read_file` already opens the file and reads a header slice for its binary check
  (`isBinaryFile` in `file/helpers.ts`, step 3 — which currently _rejects_ binary
  files); media detection slots in at that seam. Call `fileTypeFromFile(absolutePath)`
  → `{ext, mime} | undefined`, then narrow `mime` through the shared enum
  (`imageMediaTypeSchema` / `documentMediaTypeSchema` `.safeParse`). Extension is never
  used to decide the type (only, optionally, to fill `document.name`).
  - Supported image (png/jpg/gif/webp) → `image` block; PDF → `document` block; subject
    to `MAX_INLINE_MEDIA_BYTES`.
  - Recognized binary **not** in the enum (e.g. mp3, zip) → the existing
    "binary not supported" rejection.
  - `undefined` (text, incl. SVG which has no binary signature) → existing text path,
    unchanged.
  - Sniff the header cheaply first; read the full buffer for base64 only once a
    supported media type under the cap is confirmed (avoids fully reading large
    non-media files).
- New dependency: **`file-type`** in `apps/backend` (installed via `pnpm add file-type`,
  never a hand-written version). ESM-only, which matches the backend's nodenext setup.
- The source is already on disk, so **over-cap → a `failure`** whose message is
  actionable: instruct the agent to reduce the file via a shell command (downsample /
  resize an image, or extract specific pages / text from a PDF) and read the smaller
  artifact. No scratch copy.
- Text files: behavior unchanged. Line-range params (`offset` / `limit`) are ignored
  for media reads.
- **`readFileResultSchema` (`@omnicraft/tool-schemas`)** gains a `kind: 'text' |
'image' | 'document'` discriminant. Text keeps today's shape. Media variant carries
  **metadata only** — `{kind, filePath, mediaType, byteSize}`, where `mediaType` uses
  the shared `imageMediaTypeSchema` / `documentMediaTypeSchema` (same package) — and
  **no base64** (bytes stay in the `content` blocks → LLM). The media variant only
  occurs on success (i.e. inlined); the over-cap case is a `failure` rendered through
  the generic failure path, so no "inlined" flag is needed.
- **`ReadFileResult` widget** switches on `kind`: text renders as today; a media
  success renders a compact placeholder chip — `🖼 screenshot.png · image/png · 240 KB`.
  The over-cap case is a failure and renders through the existing failure UI (with the
  "reduce via a shell command" message), not this widget. This is the only frontend
  change in this spec; the real media renderer is #371.
- **Tool + parameter descriptions updated** (`readFileParametersSchema` in
  `@omnicraft/tool-schemas`, and the tool `description` in `read-file.ts`) so the agent
  knows the behavior up front, per the tool-description guidelines (what + when,
  generic):
  - Tool `description`: state that it reads **text files and images/PDFs** — text is
    returned in size-limited chunks (page through larger files via the line-range
    parameters), and images/PDFs are returned to the model only when under an inline
    size limit, otherwise the read fails and the file must be reduced first (e.g.
    downsampled/converted). **Interpolate the actual limits from the shared constants**
    (`MAX_INLINE_MEDIA_BYTES`, `MAX_RETURN_SIZE`) into the description via a template
    literal so the agent sees concrete numbers that stay in sync with the code — do not
    hard-code the figures. The runtime failure messages likewise report the limit from
    the same constant.
  - `startLine` / `lineCount` descriptions: note they apply to **text reads only** and
    are **ignored when the file is an image/PDF** (media is atomic — no partial read).

### Persistence + conversion script

- Load path (`agentSnapshotSchema.parse`) will reject old string-content tool messages
  after the schema change, so migration must run first.
- **One-time script** (`apps/backend/scripts/…`): walks `<getDataDir()>/sessions/*`
  and `<getDataDir()>/coding-sessions/*`; in each `snapshot.json`, rewrites every
  `role: 'tool'` message whose `content` is a string → `[{type:'text', text: content}]`.
  Idempotent (skips arrays); atomic write (tmp + rename, matching `agent-persistence`).
- The SSE event log (`sse-events.jsonl`) is **not** migrated — SSE stays text-only, so
  recorded events remain schema-valid.

## FE / model divergence (why "text-only to FE" holds with media results)

| Path                                              | Carries                             | For a media result                             |
| ------------------------------------------------- | ----------------------------------- | ---------------------------------------------- |
| `content: ToolResultBlock[]` → adapter → provider | real base64 bytes                   | model sees the image/PDF                       |
| SSE `tool-execute-end.result` (string) → FE       | `toolResultBlocksToText` projection | FE shows `[image: …]` placeholder (status quo) |

The base64 is never attached to the SSE event, so the FE is unchanged (except the
`read_file` placeholder chip). The #371 follow-up later adds media blocks to the SSE
event and builds the renderer.

## Provider capability summary

| MCP block           | Neutral         | Anthropic        | OpenAI        |
| ------------------- | --------------- | ---------------- | ------------- |
| text                | text            | ✅               | ✅            |
| image (base64)      | image           | ✅ base64 source | ✅ data-URL   |
| resource (PDF/text) | document/text   | ✅ document      | ✅ input_file |
| resource_link (URI) | text (URI)      | ✅               | ✅            |
| audio (base64)      | — (placeholder) | ❌               | ❌            |

## Testing strategy

- **Adapters:** unit tests mapping each block type → provider content; oversize/unknown
  → text placeholder; token-count path exercises the same conversion.
- **Size guard:** ≤ cap inlines; > cap spills to scratch and returns the path text block.
- **MCP bridge:** each `CallToolResult` block type → expected neutral block; audio →
  placeholder wording; `structuredContent` fallback preserved.
- **`read_file`:** image → image block; PDF → document block; over-cap → actionable
  failure; text unchanged; schema discriminant round-trips.
- **Compaction:** media blocks replaced by placeholders; `compactResult` hooks still
  receive strings.
- **Conversion script:** string content → single text block; idempotent on arrays;
  atomic write.

## Tunables / open items

- `MAX_INLINE_MEDIA_BYTES` = 1 MB — revisit after real usage (screenshots often exceed
  it).
