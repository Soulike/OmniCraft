# LLM Input Attachments Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user upload an image or PDF into a chat/coding session and have its bytes delivered to the LLM, stored as ordinary files rather than base64 in the snapshot.

**Architecture:** A session-scoped, source-agnostic attachment store writes blobs to `<sessionsDir>/<id>/scratch/attachments/`. Messages persist only `{fileName, mediaType, byteSize}`. Base64 is materialized transiently by an injected resolver just before each provider call, and the existing #372 media-block mappers carry it to Anthropic and OpenAI. A two-step HTTP API (upload → send message with names) keeps JSON bodies small and streams bytes straight to disk.

**Tech Stack:** Node.js + TypeScript (nodenext), Koa 3 + `@koa/router`, Zod (schemas are the source of truth for anything persisted), Vitest, `file-type` for magic-byte sniffing, `@anthropic-ai/sdk` 0.104 / `openai` 6.x.

**Spec:** `docs/superpowers/specs/2026-07-25-llm-input-attachments-design.md` — read it before starting. Issue [#378](https://github.com/Soulike/OmniCraft/issues/378); follow-up [#388](https://github.com/Soulike/OmniCraft/issues/388).

## Global Constraints

Every task's requirements implicitly include this section.

- **Package manager is pnpm.** Never edit a version number in `package.json` by hand; use `pnpm add`. No new dependency is needed by this plan.
- **No `any`.** Use `unknown` and narrow with type guards or `.safeParse`.
- **No default exports** (config files exempted). No `console` — use `logger` from `@/logger.js`, or `ctx.log` inside a request.
- **Relative imports carry the `.js` extension** (nodenext). Use the `@/*` alias when importing across modules; relative paths within a module.
- **A module's `index.ts` is its facade.** Import another module through its `index.ts` (`@/agent-core/tool/index.js`), never its internal files. Within a module, import files relatively and never import your own `index.ts`.
- **Never re-export a `@omnicraft/*` workspace package's exports** from a local module. Import the package directly.
- **Early return** for `if`; no deep nesting.
- **File names are kebab-case**; unit tests are `<file-name>.test.ts`.
- **Zod schemas are the source of truth for persisted types.** New persisted fields get `.default(...)` so existing snapshots keep validating (the `todos: z.array(sseTodoItemSchema).default([])` precedent in `agent/types.ts`).
- **Conventional Commits** (`feat:`, `fix:`, `refactor:`, `test:`, `docs:`).
- **Size caps (exact values):** image `5 * 1024 * 1024`, PDF `10 * 1024 * 1024`. `MAX_INLINE_MEDIA_BYTES` (1 MB, in `agent-core/tool/media-guard.ts`) is **not** changed by this plan.
- **Supported media types are exactly** `imageMediaTypeSchema` (`image/png`, `image/jpeg`, `image/gif`, `image/webp`) and `documentMediaTypeSchema` (`application/pdf`) from `@omnicraft/tool-schemas`. Never a bare string, never a MIME package.
- **The client's `Content-Type` header is never trusted.** Media type always comes from `file-type` magic-byte sniffing.
- **Nothing user-facing may say "user upload".** The store, the types, and the model-facing compaction text are source-agnostic — a tool result will land in the same store in #388.
- **No absolute filesystem path is persisted or sent to the browser.** Paths are derived from `sessionsDir + agentId + fileName` at use time.

### Commands

```bash
# backend unit tests (whole suite)
pnpm --filter @omnicraft/backend test

# a single backend test file
pnpm --filter @omnicraft/backend test src/agent-core/llm-api/types.test.ts

# workspace packages
pnpm --filter @omnicraft/sse-events test
pnpm --filter @omnicraft/api-schema test

# repo-wide gates (CI runs these)
pnpm typecheck:all
pnpm lint:all
```

Note: **Vitest does not type-check.** A green test run does not mean the build is green — run `pnpm typecheck:all` wherever a task says to.

---

## File Structure

**New files**

| File                                                                           | Responsibility                                                                                                                       |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `apps/backend/src/agent-core/agent/attachments/agent-attachment-store.ts`      | The whole blob store: caps, sanitizing, sniffing, capped streaming write, collision-free rename, safe read, delete. Source-agnostic. |
| `apps/backend/src/agent-core/agent/attachments/agent-attachment-store.test.ts` | Its tests.                                                                                                                           |
| `apps/backend/src/agent-core/agent/attachments/index.ts`                       | Module facade.                                                                                                                       |
| `apps/backend/src/agent-core/llm-api/helpers/attachments-to-blocks.ts`         | Maps `ResolvedLlmAttachment[]` → neutral media blocks (shared by both adapters).                                                     |
| `apps/backend/src/agent-core/llm-api/helpers/attachments-to-blocks.test.ts`    | Its tests.                                                                                                                           |
| `apps/backend/src/dispatcher/chat-agent-session/attachment-name.ts`            | Parses/validates the `:fileName` path param and the `?name` query param.                                                             |
| `apps/backend/src/services/chat-agent-session/attachments.ts`                  | Chat-session attachment service functions.                                                                                           |
| `apps/backend/src/services/coding-agent-session/attachments.ts`                | Coding-session mirror.                                                                                                               |

**Modified files** — see each task's `Files:` block for exact paths and what changes.

The store is one file on purpose: caps, sanitizing, uniquifying, and path safety are a single cohesive responsibility, and splitting them would scatter the security-relevant checks. It stays under ~250 lines.

---

## Task 1: Persisted `LlmAttachment` on the user message

Widens the persisted user-message schema. Additive only — no adapter, session, or HTTP change yet, so the suite must still pass at the end.

`llmAttachmentSchema` goes in **`@omnicraft/tool-schemas`**, not the backend. Three packages reference it (the backend message schema, the SSE event schema, the HTTP upload response), and `packages/sse-events` cannot import from `apps/backend`. This is exactly where #372 put the media-type enums, for the same reason. `tool-schemas` is a leaf with only a `zod` dependency, so nothing can cycle.

**Files:**

- Create: `packages/tool-schemas/src/attachment-schemas.ts`
- Create: `packages/tool-schemas/src/attachment-schemas.test.ts`
- Modify: `packages/tool-schemas/src/index.ts`
- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/index.ts`
- Test: `apps/backend/src/agent-core/llm-api/types.test.ts`
- Modify (mechanical, add `attachments: []`): `apps/backend/src/agent-core/llm-session/llm-session.ts:104-109` and `:139-145`; `apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor.ts:60-70`; `apps/backend/src/agent-core/llm-session/compaction/compaction-summary-generator.ts:24-31`; `apps/backend/src/agent-core/agent/title/agent-title.ts:16-27`
- Modify (test fixtures, add `attachments: []`): `llm-session/llm-session.test.ts:54,224,263,296`; `llm-session/compaction/llm-compaction-decision-service.test.ts:22`; `llm-session/compaction/compaction-message-slimmer.test.ts:28,42,178`; `llm-session/compaction/llm-compaction-token-estimator.test.ts:10,19,96`; `llm-session/compaction/compaction-summary-generator.test.ts:45,72`; `llm-session/compaction/llm-history-compactor.test.ts:19`; `llm-session/compaction/llm-compaction-event-factory.test.ts:21`; `llm-session/compaction/llm-session-compactor.test.ts:28,40`; `agent/agent.test.ts:599,804`; `llm-api/token-estimator.test.ts:7`

**Interfaces:**

- Consumes: `imageMediaTypeSchema`, `documentMediaTypeSchema` from `./media-type-schemas.js` (same package).
- Produces, exported from `@omnicraft/tool-schemas`:

  ```ts
  export const llmAttachmentSchema: z.ZodObject<{
    fileName: z.ZodString;
    mediaType: z.ZodUnion<
      [typeof imageMediaTypeSchema, typeof documentMediaTypeSchema]
    >;
    byteSize: z.ZodNumber;
  }>;
  export type LlmAttachment = {
    fileName: string;
    mediaType: ImageMediaType | DocumentMediaType;
    byteSize: number;
  };
  ```

  And from `agent-core/llm-api/index.js`: `llmUserMessageSchema` now yields
  `{id, createdAt, content, role: 'user', attachments: LlmAttachment[]}`.

- [ ] **Step 1: Write the failing schema tests**

Create `packages/tool-schemas/src/attachment-schemas.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {llmAttachmentSchema} from './attachment-schemas.js';

describe('llmAttachmentSchema', () => {
  it('accepts every deliverable image type and PDF', () => {
    for (const mediaType of [
      'image/png',
      'image/jpeg',
      'image/gif',
      'image/webp',
      'application/pdf',
    ]) {
      const parsed = llmAttachmentSchema.parse({
        fileName: 'file',
        mediaType,
        byteSize: 1,
      });
      expect(parsed.mediaType).toBe(mediaType);
    }
  });

  it('rejects a media type outside the deliverable set', () => {
    expect(() =>
      llmAttachmentSchema.parse({
        fileName: 'diagram.svg',
        mediaType: 'image/svg+xml',
        byteSize: 1,
      }),
    ).toThrow();
  });

  it('rejects an empty file name', () => {
    expect(() =>
      llmAttachmentSchema.parse({
        fileName: '',
        mediaType: 'image/png',
        byteSize: 1,
      }),
    ).toThrow();
  });

  it('rejects a negative or fractional byte size', () => {
    const base = {fileName: 'a.png', mediaType: 'image/png'};
    expect(() => llmAttachmentSchema.parse({...base, byteSize: -1})).toThrow();
    expect(() => llmAttachmentSchema.parse({...base, byteSize: 1.5})).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/tool-schemas test`
Expected: FAIL — cannot resolve `./attachment-schemas.js`.

- [ ] **Step 3: Add the shared schema**

Create `packages/tool-schemas/src/attachment-schemas.ts`:

```ts
import {z} from 'zod';

import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from './media-type-schemas.js';

/**
 * A binary file delivered to the model alongside a message. A reference only —
 * the bytes live in the session's attachment store, and base64 is materialized
 * just before a provider call.
 *
 * Deliberately source-agnostic: it records what the file is, never who produced
 * it. A user upload is the first producer; tool results follow in
 * https://github.com/Soulike/OmniCraft/issues/388.
 *
 * Lives here rather than in the backend because the backend message schema, the
 * SSE event schema, and the HTTP upload response all reference it, and
 * `@omnicraft/sse-events` cannot import from `apps/backend`.
 */
export const llmAttachmentSchema = z.object({
  fileName: z.string().min(1),
  mediaType: z.union([imageMediaTypeSchema, documentMediaTypeSchema]),
  byteSize: z.number().int().nonnegative(),
});

export type LlmAttachment = z.infer<typeof llmAttachmentSchema>;
```

Add to `packages/tool-schemas/src/index.ts`, as the first export block (alphabetical by file):

```ts
export {type LlmAttachment, llmAttachmentSchema} from './attachment-schemas.js';
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/tool-schemas test`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Write the failing backend tests**

Append to `apps/backend/src/agent-core/llm-api/types.test.ts`:

```ts
describe('llmUserMessageSchema attachments', () => {
  it('defaults attachments to an empty list for pre-attachment snapshots', () => {
    const parsed = llmUserMessageSchema.parse({
      id: 'u1',
      createdAt: 1,
      role: 'user',
      content: 'hello',
    });
    expect(parsed.attachments).toEqual([]);
  });

  it('round-trips an image and a document attachment', () => {
    const parsed = llmUserMessageSchema.parse({
      id: 'u1',
      createdAt: 1,
      role: 'user',
      content: 'look',
      attachments: [
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: 812345},
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          byteSize: 235000,
        },
      ],
    });
    expect(parsed.attachments).toHaveLength(2);
    expect(parsed.attachments[0]?.fileName).toBe('shot.png');
    expect(parsed.attachments[1]?.mediaType).toBe('application/pdf');
  });

  it('rejects an attachment with an undeliverable media type', () => {
    expect(() =>
      llmUserMessageSchema.parse({
        id: 'u1',
        createdAt: 1,
        role: 'user',
        content: 'look',
        attachments: [
          {fileName: 'diagram.svg', mediaType: 'image/svg+xml', byteSize: 10},
        ],
      }),
    ).toThrow();
  });
});
```

Make sure the file imports `llmUserMessageSchema` from `./types.js` and `describe, expect, it` from `vitest`.

- [ ] **Step 6: Run them to verify they fail**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/types.test.ts`
Expected: FAIL — `parsed.attachments` is `undefined`, and the invalid case does not throw.

- [ ] **Step 7: Widen the user message schema**

In `apps/backend/src/agent-core/llm-api/types.ts`, extend the existing
`@omnicraft/tool-schemas` import to bring in `llmAttachmentSchema` (and
`type LlmAttachment`), then replace `llmUserMessageSchema` with:

```ts
/** A message from the user. */
export const llmUserMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('user'),
  // Defaulted so snapshots written before attachments still validate, restoring
  // as an empty list — same convention as `todos` in agentSnapshotSchema.
  attachments: z.array(llmAttachmentSchema).default([]),
});
```

- [ ] **Step 8: Run them to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/types.test.ts`
Expected: PASS, 3 new tests.

- [ ] **Step 9: Fix the five production construction sites**

`attachments` is now required on the _output_ type, so every literal typed as `LlmMessage` / `LlmUserMessage` must carry it. Add `attachments: []` to each:

`llm-session.ts` — in `sendUserMessage`:

```ts
const userMessage = {
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  role: 'user' as const,
  content,
  attachments: [],
};
```

`llm-session.ts` — in `sendReminder`:

```ts
const reminderMessage = {
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  role: 'user' as const,
  content: `<system-reminder>\n${safeContent}\n</system-reminder>`,
  attachments: [],
};
```

`compaction/llm-history-compactor.ts`:

```ts
const replacementMessages: LlmMessage[] = [
  {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    role: 'user',
    content: this.promptBuilder.buildCompactedMessageContent({
      summary,
      recentContext: recentContext.content,
    }),
    attachments: [],
  },
];
```

`compaction/compaction-summary-generator.ts`:

```ts
const messages: LlmMessage[] = [
  {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    role: 'user',
    content: prompt,
    attachments: [],
  },
];
```

`agent/title/agent-title.ts` — add `attachments: [],` after the `content: [...].join('\n'),` line of its inline message literal.

- [ ] **Step 10: Fix the test fixtures**

Add `attachments: []` to every `LlmMessage`-typed user literal listed in the `Files:` block above. These are mechanical one-line additions. Do **not** touch `llm-api/claude/helpers.test.ts` — its `role: 'user'` literals are Anthropic SDK `MessageParam` values, not `LlmMessage`. Do **not** touch `llm-session.test.ts:143` — it is a partial `toMatchObject` assertion.

- [ ] **Step 11: Do not re-export the shared schema**

Leave `apps/backend/src/agent-core/llm-api/index.ts` alone in this task. `LlmAttachment` and `llmAttachmentSchema` belong to `@omnicraft/tool-schemas`, and the repo rule is that a workspace package's exports are never re-exported from a local module — every consumer imports `@omnicraft/tool-schemas` directly.

- [ ] **Step 12: Verify the build and the full suite**

Run: `pnpm typecheck:all`
Expected: no errors. If one remains, it is a construction site missed in steps 9–10 — the error text names the file and line.

Run: `pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/tool-schemas test`
Expected: PASS, no regressions.

- [ ] **Step 13: Commit**

```bash
git add packages/tool-schemas apps/backend/src/agent-core
git commit -m "feat(agent-core): persist attachment references on user messages"
```

---

## Task 2: The attachment store

The blob store. Everything security-relevant about attachments lives here: caps, name sanitizing, magic-byte sniffing, capped streaming write, collision-free placement, and rejection of anything that is not a regular file directly inside the attachments directory.

**Files:**

- Create: `apps/backend/src/agent-core/agent/attachments/agent-attachment-store.ts`
- Create: `apps/backend/src/agent-core/agent/attachments/index.ts`
- Create: `apps/backend/src/agent-core/agent/attachments/agent-attachment-store.test.ts`
- Modify: `apps/backend/src/agent-core/agent/persistence/agent-persistence.ts` (add `attachmentsPath`)
- Modify: `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts` (cover it)
- Modify: `apps/backend/src/agent-core/agent/index.ts` (re-export the store)

**Interfaces:**

- Consumes: `LlmAttachment` (Task 1); `imageMediaTypeSchema` / `documentMediaTypeSchema` from `@omnicraft/tool-schemas`; `fileTypeFromFile` from `file-type`; `agentPersistence.scratchPath`.
- Produces:

  ```ts
  export const MAX_IMAGE_ATTACHMENT_BYTES: number; // 5 * 1024 * 1024
  export const MAX_DOCUMENT_ATTACHMENT_BYTES: number; // 10 * 1024 * 1024

  export type SaveAttachmentFailureReason =
    | 'invalid-name'
    | 'unsupported-type'
    | 'too-large';

  export type SaveAttachmentResult =
    | {readonly ok: true; readonly attachment: LlmAttachment}
    | {readonly ok: false; readonly reason: SaveAttachmentFailureReason};

  export interface OpenedAttachment {
    readonly attachment: LlmAttachment;
    readonly absolutePath: string;
  }

  class AgentAttachmentStore {
    directory(scratchDirectory: string): string;
    async save(
      scratchDirectory: string,
      desiredName: string,
      body: Readable,
    ): Promise<SaveAttachmentResult>;
    async describe(
      scratchDirectory: string,
      fileName: string,
    ): Promise<OpenedAttachment | null>;
    async readBase64(
      scratchDirectory: string,
      fileName: string,
    ): Promise<string | null>;
    async remove(scratchDirectory: string, fileName: string): Promise<boolean>;
  }
  export const agentAttachmentStore: AgentAttachmentStore;
  ```

  Every method takes the already-validated, already-realpath'd `scratchDirectory` that `agentScratchDirectoryService.createScratchDirectory()` returned — the store never re-derives it from an agent id, so the existing symlink gate on the `{agentId}` segment is not duplicated or bypassed.

- [ ] **Step 1: Write the failing test for `attachmentsPath`**

Append to `apps/backend/src/agent-core/agent/persistence/agent-persistence.test.ts`:

```ts
describe('attachmentsPath', () => {
  it('nests the attachments directory inside the session scratch space', () => {
    expect(agentPersistence.attachmentsPath('/data/sessions', 'abc')).toBe(
      '/data/sessions/abc/scratch/attachments',
    );
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/persistence/agent-persistence.test.ts`
Expected: FAIL — `agentPersistence.attachmentsPath is not a function`.

- [ ] **Step 3: Add `attachmentsPath`**

In `apps/backend/src/agent-core/agent/persistence/agent-persistence.ts`, directly below `scratchPath`:

```ts
  attachmentsPath(sessionsDir: string, id: string): string {
    return path.join(this.scratchPath(sessionsDir, id), 'attachments');
  }
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/persistence/agent-persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing store tests**

Create `apps/backend/src/agent-core/agent/attachments/agent-attachment-store.test.ts`:

```ts
import {mkdtemp, readFile, rm, symlink, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {
  agentAttachmentStore,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from './agent-attachment-store.js';

// Real magic bytes — the store sniffs content, never the declared type.
const PNG_HEADER = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49,
  0x48, 0x44, 0x52,
]);
const PDF_HEADER = Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'binary');

function pngOf(totalBytes: number): Buffer {
  return Buffer.concat([
    PNG_HEADER,
    Buffer.alloc(Math.max(0, totalBytes - PNG_HEADER.length)),
  ]);
}

function streamOf(buffer: Buffer): Readable {
  return Readable.from([buffer]);
}

// A literal NUL is written via fromCharCode so this file stays copy/paste-safe.
const NUL = String.fromCharCode(0);

let scratchDirectory: string;

beforeEach(async () => {
  scratchDirectory = await mkdtemp(path.join(os.tmpdir(), 'attachment-store-'));
});

afterEach(async () => {
  await rm(scratchDirectory, {recursive: true, force: true});
});

describe('save', () => {
  it('stores a PNG and reports the sniffed type and size', async () => {
    const bytes = pngOf(2048);
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(bytes),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment).toEqual({
      fileName: 'shot.png',
      mediaType: 'image/png',
      byteSize: 2048,
    });

    const stored = await readFile(
      path.join(scratchDirectory, 'attachments', 'shot.png'),
    );
    expect(stored.equals(bytes)).toBe(true);
  });

  it('ignores the declared extension and uses the sniffed type', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'invoice.png',
      streamOf(Buffer.concat([PDF_HEADER, Buffer.alloc(64)])),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.mediaType).toBe('application/pdf');
    expect(result.attachment.fileName).toBe('invoice.pdf');
  });

  it('strips directory components and control characters from the name', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      `../../etc/pa${NUL}ss.png`,
      streamOf(pngOf(64)),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.fileName).toBe('pass.png');
  });

  it('uniquifies a colliding name instead of overwriting', async () => {
    const first = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );
    const second = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(128)),
    );

    expect(first.ok && first.attachment.fileName).toBe('shot.png');
    expect(second.ok && second.attachment.fileName).toBe('shot (2).png');
    expect(second.ok && second.attachment.byteSize).toBe(128);
  });

  it('rejects a name that sanitizes to nothing', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      '..',
      streamOf(pngOf(64)),
    );
    expect(result).toEqual({ok: false, reason: 'invalid-name'});
  });

  it('rejects a media type outside the deliverable set', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'notes.txt',
      streamOf(Buffer.from('just some text, no magic bytes')),
    );
    expect(result).toEqual({ok: false, reason: 'unsupported-type'});
  });

  it('rejects an image over the image cap and leaves no temp file behind', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'huge.png',
      streamOf(pngOf(MAX_IMAGE_ATTACHMENT_BYTES + 1)),
    );
    expect(result).toEqual({ok: false, reason: 'too-large'});

    const {readdir} = await import('node:fs/promises');
    const entries = await readdir(path.join(scratchDirectory, 'attachments'));
    expect(entries).toEqual([]);
  });

  it('accepts a PDF between the image cap and the document cap', async () => {
    const size = MAX_IMAGE_ATTACHMENT_BYTES + 1024;
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'big.pdf',
      streamOf(
        Buffer.concat([PDF_HEADER, Buffer.alloc(size - PDF_HEADER.length)]),
      ),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.attachment.byteSize).toBe(size);
  });

  it('aborts a stream past the largest cap without buffering it', async () => {
    const result = await agentAttachmentStore.save(
      scratchDirectory,
      'huge.pdf',
      streamOf(
        Buffer.concat([
          PDF_HEADER,
          Buffer.alloc(MAX_DOCUMENT_ATTACHMENT_BYTES + 1),
        ]),
      ),
    );
    expect(result).toEqual({ok: false, reason: 'too-large'});
  });
});

describe('describe / readBase64 / remove', () => {
  it('describes a stored attachment', async () => {
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(256)),
    );

    const found = await agentAttachmentStore.describe(
      scratchDirectory,
      'shot.png',
    );
    expect(found?.attachment).toEqual({
      fileName: 'shot.png',
      mediaType: 'image/png',
      byteSize: 256,
    });
    expect(found?.absolutePath).toBe(
      path.join(scratchDirectory, 'attachments', 'shot.png'),
    );
  });

  it('returns null for a missing file', async () => {
    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'nope.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'nope.png'),
    ).toBeNull();
  });

  it('reads bytes back as base64', async () => {
    const bytes = pngOf(64);
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(bytes),
    );

    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'shot.png'),
    ).toBe(bytes.toString('base64'));
  });

  it('removes a stored attachment and reports whether it existed', async () => {
    await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      streamOf(pngOf(64)),
    );

    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toBe(true);
    expect(
      await agentAttachmentStore.remove(scratchDirectory, 'shot.png'),
    ).toBe(false);
  });
});

describe('path safety', () => {
  it.each([
    ['a traversal segment', '../snapshot.json'],
    ['a nested path', 'sub/shot.png'],
    ['a backslash path', 'sub\\shot.png'],
    ['an absolute path', '/etc/passwd'],
    ['a dot name', '.'],
    ['a dot-dot name', '..'],
    ['an empty name', ''],
  ])('rejects %s on read', async (_label, fileName) => {
    expect(
      await agentAttachmentStore.describe(scratchDirectory, fileName),
    ).toBeNull();
    expect(await agentAttachmentStore.remove(scratchDirectory, fileName)).toBe(
      false,
    );
  });

  it('rejects a symlink planted inside the attachments directory', async () => {
    const secret = path.join(scratchDirectory, 'secret.png');
    await writeFile(secret, pngOf(64));
    // Create the attachments dir via a legitimate save first.
    await agentAttachmentStore.save(
      scratchDirectory,
      'real.png',
      streamOf(pngOf(64)),
    );
    await symlink(
      secret,
      path.join(scratchDirectory, 'attachments', 'link.png'),
    );

    expect(
      await agentAttachmentStore.describe(scratchDirectory, 'link.png'),
    ).toBeNull();
    expect(
      await agentAttachmentStore.readBase64(scratchDirectory, 'link.png'),
    ).toBeNull();
  });
});
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/attachments/agent-attachment-store.test.ts`
Expected: FAIL — cannot resolve `./agent-attachment-store.js`.

- [ ] **Step 7: Implement the store**

Create `apps/backend/src/agent-core/agent/attachments/agent-attachment-store.ts`:

```ts
import crypto from 'node:crypto';
import {createWriteStream} from 'node:fs';
import {link, lstat, mkdir, readFile, rm, unlink} from 'node:fs/promises';
import path from 'node:path';
import type {Readable} from 'node:stream';

import type {
  DocumentMediaType,
  ImageMediaType,
  LlmAttachment,
} from '@omnicraft/tool-schemas';
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';
import {fileTypeFromFile} from 'file-type';

import {isFileExistsError, isFileNotFoundError} from '@/helpers/fs.js';

/** Max bytes for an image attachment. Anthropic's own per-image limit is 5 MB,
 *  and image token cost is flat regardless of file size, so a larger cap costs
 *  request bytes rather than tokens. */
export const MAX_IMAGE_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** Max bytes for a PDF attachment. Held well under the provider's 32 MB request
 *  limit because PDF token cost scales with page count while our estimate is
 *  flat — see https://github.com/Soulike/OmniCraft/issues/373. */
export const MAX_DOCUMENT_ATTACHMENT_BYTES = 10 * 1024 * 1024;

const MAX_ANY_ATTACHMENT_BYTES = Math.max(
  MAX_IMAGE_ATTACHMENT_BYTES,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
);

const MAX_FILE_NAME_LENGTH = 255;

/** Placement attempts before a save gives up. Bounded so a directory another
 *  writer is filling fails cleanly instead of spinning forever. */
const MAX_PLACEMENT_ATTEMPTS = 100;

/** The extension each deliverable media type is stored under. The stored name
 *  always matches the sniffed type, so a path list never misdescribes a file. */
const EXTENSION_BY_MEDIA_TYPE: Readonly<
  Record<ImageMediaType | DocumentMediaType, string>
> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'application/pdf': '.pdf',
};

export type SaveAttachmentFailureReason =
  | 'invalid-name'
  | 'unsupported-type'
  | 'too-large'
  | 'name-unavailable';

export type SaveAttachmentResult =
  | {readonly ok: true; readonly attachment: LlmAttachment}
  | {readonly ok: false; readonly reason: SaveAttachmentFailureReason};

export interface OpenedAttachment {
  readonly attachment: LlmAttachment;
  readonly absolutePath: string;
}

/**
 * Reduces a client-supplied name to a bare, printable file name. Returns `null`
 * when nothing usable survives. Never used to build a path on its own — the
 * result is re-checked by {@link resolveInside}.
 */
function sanitizeFileName(raw: string): string | null {
  // Checked by code point rather than a regex: a control-character class in a
  // regex literal trips eslint's `no-control-regex` and is easy to corrupt when
  // the source is copied around. Same approach as parseAttachmentFileName.
  let printable = '';
  for (const character of raw) {
    const code = character.codePointAt(0) ?? 0;
    if (code < 0x20 || code === 0x7f) continue;
    printable += character;
  }
  printable = printable.trim();
  // Split on both separators so a Windows-style path is reduced too; POSIX
  // `path.basename` would keep `sub\shot.png` whole.
  const base = printable.split(/[/\\]/).pop() ?? '';
  if (base === '' || base === '.' || base === '..') return null;
  return base.slice(0, MAX_FILE_NAME_LENGTH);
}

/**
 * Resolves `fileName` inside `directory`, or `null` when it is not a bare name.
 * A bare name cannot escape via `path.join`; the remaining risk is a symlink
 * planted at the leaf, which the `lstat` in the read paths rejects.
 */
function resolveInside(directory: string, fileName: string): string | null {
  if (fileName === '' || fileName === '.' || fileName === '..') return null;
  if (fileName !== path.basename(fileName)) return null;
  if (fileName.includes('/') || fileName.includes('\\')) return null;
  return path.join(directory, fileName);
}

function capFor(mediaType: ImageMediaType | DocumentMediaType): number {
  return mediaType === 'application/pdf'
    ? MAX_DOCUMENT_ATTACHMENT_BYTES
    : MAX_IMAGE_ATTACHMENT_BYTES;
}

/**
 * Streams `body` to `destination`, aborting once `cap` is exceeded. Returns the
 * byte count, or `null` when the cap was blown. The payload is never fully
 * buffered, so an oversized upload costs bounded memory.
 */
async function writeCapped(
  body: Readable,
  destination: string,
  cap: number,
): Promise<number | null> {
  const out = createWriteStream(destination, {mode: 0o600});
  let byteSize = 0;
  try {
    for await (const chunk of body) {
      const buffer = chunk as Buffer;
      byteSize += buffer.length;
      if (byteSize > cap) return null;
      if (!out.write(buffer)) {
        await new Promise<void>((resolve, reject) => {
          out.once('drain', resolve);
          out.once('error', reject);
        });
      }
    }
    await new Promise<void>((resolve, reject) => {
      out.end(resolve);
      out.once('error', reject);
    });
    return byteSize;
  } finally {
    out.destroy();
  }
}

/** Narrows a sniffed MIME string to a deliverable media type. */
function toMediaType(
  mime: string | undefined,
): ImageMediaType | DocumentMediaType | null {
  if (mime === undefined) return null;
  const image = imageMediaTypeSchema.safeParse(mime);
  if (image.success) return image.data;
  const document = documentMediaTypeSchema.safeParse(mime);
  if (document.success) return document.data;
  return null;
}

class AgentAttachmentStore {
  /** The attachments directory for a session, given its scratch directory. */
  directory(scratchDirectory: string): string {
    return path.join(scratchDirectory, 'attachments');
  }

  /**
   * Writes `body` into the session's attachment store under a name derived from
   * `desiredName` and the sniffed media type. The caller's declared content type
   * is never consulted.
   */
  async save(
    scratchDirectory: string,
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult> {
    const sanitized = sanitizeFileName(desiredName);
    if (sanitized === null) return {ok: false, reason: 'invalid-name'};

    const directory = this.directory(scratchDirectory);
    await mkdir(directory, {recursive: true, mode: 0o700});

    const temporaryPath = path.join(directory, `.${crypto.randomUUID()}.tmp`);

    try {
      // The type is unknown until the bytes are on disk, so guard with the
      // larger cap first and re-check against the type-specific one after.
      const byteSize = await writeCapped(
        body,
        temporaryPath,
        MAX_ANY_ATTACHMENT_BYTES,
      );
      if (byteSize === null) return {ok: false, reason: 'too-large'};

      const detected = await fileTypeFromFile(temporaryPath);
      const mediaType = toMediaType(detected?.mime);
      if (mediaType === null) return {ok: false, reason: 'unsupported-type'};
      if (byteSize > capFor(mediaType)) return {ok: false, reason: 'too-large'};

      const fileName = await this.placeUniquely(
        directory,
        temporaryPath,
        sanitized,
        mediaType,
      );
      if (fileName === null) return {ok: false, reason: 'name-unavailable'};
      return {ok: true, attachment: {fileName, mediaType, byteSize}};
    } finally {
      await rm(temporaryPath, {force: true});
    }
  }

  /** Returns an attachment's descriptor and absolute path, or `null`. */
  async describe(
    scratchDirectory: string,
    fileName: string,
  ): Promise<OpenedAttachment | null> {
    const absolutePath = resolveInside(
      this.directory(scratchDirectory),
      fileName,
    );
    if (absolutePath === null) return null;

    // lstat, not stat: a symlink planted at the leaf must be rejected rather
    // than followed to a target outside the session.
    let byteSize: number;
    try {
      const stats = await lstat(absolutePath);
      if (!stats.isFile()) return null;
      byteSize = stats.size;
    } catch (error: unknown) {
      if (isFileNotFoundError(error)) return null;
      throw error;
    }

    const mediaType = toMediaType((await fileTypeFromFile(absolutePath))?.mime);
    if (mediaType === null) return null;

    return {attachment: {fileName, mediaType, byteSize}, absolutePath};
  }

  /** Reads an attachment's bytes as base64, or `null` when it is gone. */
  async readBase64(
    scratchDirectory: string,
    fileName: string,
  ): Promise<string | null> {
    const found = await this.describe(scratchDirectory, fileName);
    if (found === null) return null;
    return (await readFile(found.absolutePath)).toString('base64');
  }

  /** Deletes an attachment. Returns whether it existed. */
  async remove(scratchDirectory: string, fileName: string): Promise<boolean> {
    const found = await this.describe(scratchDirectory, fileName);
    if (found === null) return false;
    await unlink(found.absolutePath);
    return true;
  }

  /**
   * Hard-links the temp file to the first free `<stem><suffix><ext>`, then lets
   * save()'s `finally` remove the temp file.
   *
   * `link` fails atomically with EEXIST when the name is taken, so neither a
   * concurrent save nor a writer outside this process can be clobbered — and
   * there IS such a writer: `run_command`'s realpath allowlist covers the
   * scratch space, which is deliberate (it is how an oversized image gets
   * downsampled). A mutex would only serialize our own saves.
   *
   * Returns `null` when every candidate is taken, which the caller surfaces as
   * a `name-unavailable` failure rather than spinning.
   */
  private async placeUniquely(
    directory: string,
    temporaryPath: string,
    sanitized: string,
    mediaType: ImageMediaType | DocumentMediaType,
  ): Promise<string | null> {
    const extension = EXTENSION_BY_MEDIA_TYPE[mediaType];
    const existing = path.extname(sanitized);
    const stem =
      existing === '' ? sanitized : sanitized.slice(0, -existing.length);
    const base = stem === '' ? 'attachment' : stem;

    for (let index = 1; index <= MAX_PLACEMENT_ATTEMPTS; index++) {
      const candidate =
        index === 1 ? `${base}${extension}` : `${base} (${index})${extension}`;
      try {
        await link(temporaryPath, path.join(directory, candidate));
        return candidate;
      } catch (error: unknown) {
        // Anything other than "name taken" is a real filesystem failure and
        // must not be disguised as a business-level result.
        if (!isFileExistsError(error)) throw error;
      }
    }
    return null;
  }
}

export const agentAttachmentStore = new AgentAttachmentStore();
```

Create `apps/backend/src/agent-core/agent/attachments/index.ts`:

```ts
export type {
  OpenedAttachment,
  SaveAttachmentFailureReason,
  SaveAttachmentResult,
} from './agent-attachment-store.js';
export {
  agentAttachmentStore,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from './agent-attachment-store.js';
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/attachments/agent-attachment-store.test.ts`
Expected: PASS, all cases including the symlink and traversal rejections.

- [ ] **Step 9: Re-export from the agent module facade**

In `apps/backend/src/agent-core/agent/index.ts`, add:

```ts
export {
  agentAttachmentStore,
  MAX_DOCUMENT_ATTACHMENT_BYTES,
  MAX_IMAGE_ATTACHMENT_BYTES,
} from './attachments/index.js';
export type {
  OpenedAttachment,
  SaveAttachmentResult,
} from './attachments/index.js';
```

Keep the file's existing export ordering convention.

- [ ] **Step 10: Verify the build and the full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test`
Expected: no type errors; suite green.

- [ ] **Step 11: Commit**

```bash
git add apps/backend/src/agent-core/agent
git commit -m "feat(agent-core): add the session attachment store"
```

---

## Task 3: Request-time types and provider adapters

Splits the persisted message from the message that goes on the wire, and teaches both adapters to emit media blocks for a user message. The resolver is **not** wired yet — `data` is `null` everywhere, which exercises the missing-attachment path end to end and keeps this task independently reviewable.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/index.ts`
- Create: `apps/backend/src/agent-core/llm-api/helpers/attachments-to-blocks.ts`
- Create: `apps/backend/src/agent-core/llm-api/helpers/attachments-to-blocks.test.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/helpers.ts` + `claude/helpers.test.ts`
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts` + its test file
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts` (map history to request messages)
- Modify: `apps/backend/src/agent-core/llm-session/compaction/compaction-summary-generator.ts` (annotation only)

**Interfaces:**

- Consumes: `LlmAttachment`, `ToolResultBlock` (existing).
- Produces:

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

  // helpers/attachments-to-blocks.ts
  export function attachmentsToBlocks(
    attachments: readonly ResolvedLlmAttachment[],
  ): ToolResultBlock[];
  ```

  `LlmCompletionOptions.messages` and `LlmTokenCountOptions.messages` become `readonly LlmRequestMessage[]`.

- [ ] **Step 1: Write the failing test for the shared mapper**

Create `apps/backend/src/agent-core/llm-api/helpers/attachments-to-blocks.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {attachmentsToBlocks} from './attachments-to-blocks.js';

describe('attachmentsToBlocks', () => {
  it('maps an image attachment to an image block', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          byteSize: 3,
          data: 'AAA=',
        },
      ]),
    ).toEqual([{type: 'image', mediaType: 'image/png', data: 'AAA='}]);
  });

  it('maps a PDF to a document block carrying the file name', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          byteSize: 3,
          data: 'BBB=',
        },
      ]),
    ).toEqual([
      {
        type: 'document',
        mediaType: 'application/pdf',
        data: 'BBB=',
        name: 'invoice.pdf',
      },
    ]);
  });

  it('maps a missing attachment to a text placeholder naming the file', () => {
    expect(
      attachmentsToBlocks([
        {
          fileName: 'gone.png',
          mediaType: 'image/png',
          byteSize: 10,
          data: null,
        },
      ]),
    ).toEqual([{type: 'text', text: '[attachment missing: gone.png]'}]);
  });

  it('preserves order across mixed attachments', () => {
    const blocks = attachmentsToBlocks([
      {fileName: 'a.png', mediaType: 'image/png', byteSize: 1, data: 'AA=='},
      {
        fileName: 'b.pdf',
        mediaType: 'application/pdf',
        byteSize: 1,
        data: null,
      },
    ]);
    expect(blocks.map((block) => block.type)).toEqual(['image', 'text']);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/helpers/attachments-to-blocks.test.ts`
Expected: FAIL — cannot resolve `./attachments-to-blocks.js`.

- [ ] **Step 3: Add the request-time types**

In `apps/backend/src/agent-core/llm-api/types.ts`, directly below `export type LlmMessage = z.infer<typeof llmMessageSchema>;`:

```ts
// ---------------------------------------------------------------------------
// Request-time types — not persisted, so no schema. Disk stores attachment
// references; the wire carries bytes.
// ---------------------------------------------------------------------------

/** An attachment with its bytes materialized for a provider call. */
export interface ResolvedLlmAttachment extends LlmAttachment {
  /** base64 of the file; `null` when the file is no longer on disk. */
  readonly data: string | null;
}

/** A user message whose attachments have been resolved to bytes. */
export interface LlmRequestUserMessage extends Omit<
  LlmUserMessage,
  'attachments'
> {
  readonly attachments: readonly ResolvedLlmAttachment[];
}

/** A message as handed to a provider adapter. */
export type LlmRequestMessage =
  | LlmRequestUserMessage
  | LlmAssistantMessage
  | LlmToolResultMessage;
```

Then change both option types to take request messages:

```ts
/** Options for a streaming LLM completion request. */
export interface LlmCompletionOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmRequestMessage[];
  readonly systemPrompt?: string;
  readonly tools: readonly AnyToolDefinition[];
  readonly signal?: AbortSignal;
}
```

`LlmTokenCountOptions` is `Omit<LlmCompletionOptions, 'signal'>` and follows automatically.

- [ ] **Step 4: Implement the shared mapper**

Create `apps/backend/src/agent-core/llm-api/helpers/attachments-to-blocks.ts`:

```ts
import type {ResolvedLlmAttachment, ToolResultBlock} from '../types.js';

/**
 * Maps resolved attachments to the neutral media blocks both provider adapters
 * already know how to emit. An attachment whose file has gone missing becomes a
 * text placeholder rather than being dropped, so the model is told rather than
 * silently left with less than it was promised.
 */
export function attachmentsToBlocks(
  attachments: readonly ResolvedLlmAttachment[],
): ToolResultBlock[] {
  return attachments.map((attachment) => {
    if (attachment.data === null) {
      return {
        type: 'text',
        text: `[attachment missing: ${attachment.fileName}]`,
      };
    }
    if (attachment.mediaType === 'application/pdf') {
      return {
        type: 'document',
        mediaType: attachment.mediaType,
        data: attachment.data,
        name: attachment.fileName,
      };
    }
    return {
      type: 'image',
      mediaType: attachment.mediaType,
      data: attachment.data,
    };
  });
}
```

- [ ] **Step 5: Run the mapper tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/helpers/attachments-to-blocks.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Write the failing adapter tests**

Append to `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts`:

```ts
describe('toSdkMessage user attachments', () => {
  const base = {id: 'u1', createdAt: 1, role: 'user' as const, content: 'look'};

  it('keeps bare string content when there are no attachments', () => {
    expect(toSdkMessage({...base, attachments: []})).toEqual({
      role: 'user',
      content: 'look',
    });
  });

  it('emits media before the text block', () => {
    const result = toSdkMessage({
      ...base,
      attachments: [
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          byteSize: 3,
          data: 'AAA=',
        },
      ],
    });

    expect(result).toEqual({
      role: 'user',
      content: [
        {
          type: 'image',
          source: {type: 'base64', media_type: 'image/png', data: 'AAA='},
        },
        {type: 'text', text: 'look'},
      ],
    });
  });

  it('emits a document block with a title for a PDF', () => {
    const result = toSdkMessage({
      ...base,
      attachments: [
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          byteSize: 3,
          data: 'BBB=',
        },
      ],
    });

    expect(result.content).toEqual([
      {
        type: 'document',
        source: {
          type: 'base64',
          media_type: 'application/pdf',
          data: 'BBB=',
        },
        title: 'invoice.pdf',
      },
      {type: 'text', text: 'look'},
    ]);
  });

  it('puts the cache breakpoint on the text block, not the media block', () => {
    const message = toSdkMessage({
      ...base,
      attachments: [
        {
          fileName: 'shot.png',
          mediaType: 'image/png',
          byteSize: 3,
          data: 'AAA=',
        },
      ],
    });
    const marked = addCacheBreakpoint(message);

    expect(Array.isArray(marked.content)).toBe(true);
    if (!Array.isArray(marked.content)) return;
    expect(marked.content[0]).not.toHaveProperty('cache_control');
    expect(marked.content[1]).toMatchObject({
      type: 'text',
      cache_control: {type: 'ephemeral'},
    });
  });
});
```

Add the equivalent to the OpenAI adapter's test file (create `apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts` if it does not exist):

```ts
describe('toInputItems user attachments', () => {
  const base = {id: 'u1', createdAt: 1, role: 'user' as const, content: 'look'};

  it('keeps bare string content when there are no attachments', () => {
    expect(toInputItems([{...base, attachments: []}])).toEqual([
      {type: 'message', role: 'user', content: 'look'},
    ]);
  });

  it('emits input_image before input_text', () => {
    expect(
      toInputItems([
        {
          ...base,
          attachments: [
            {
              fileName: 'shot.png',
              mediaType: 'image/png',
              byteSize: 3,
              data: 'AAA=',
            },
          ],
        },
      ]),
    ).toEqual([
      {
        type: 'message',
        role: 'user',
        content: [
          {
            type: 'input_image',
            detail: 'auto',
            image_url: 'data:image/png;base64,AAA=',
          },
          {type: 'input_text', text: 'look'},
        ],
      },
    ]);
  });

  it('emits input_file with the file name for a PDF', () => {
    const items = toInputItems([
      {
        ...base,
        attachments: [
          {
            fileName: 'invoice.pdf',
            mediaType: 'application/pdf',
            byteSize: 3,
            data: 'BBB=',
          },
        ],
      },
    ]);

    expect(items[0]).toMatchObject({
      content: [
        {
          type: 'input_file',
          filename: 'invoice.pdf',
          file_data: 'data:application/pdf;base64,BBB=',
        },
        {type: 'input_text', text: 'look'},
      ],
    });
  });

  it('emits a text placeholder for a missing attachment', () => {
    const items = toInputItems([
      {
        ...base,
        attachments: [
          {
            fileName: 'gone.png',
            mediaType: 'image/png',
            byteSize: 3,
            data: null,
          },
        ],
      },
    ]);

    expect(items[0]).toMatchObject({
      content: [
        {type: 'input_text', text: '[attachment missing: gone.png]'},
        {type: 'input_text', text: 'look'},
      ],
    });
  });
});
```

- [ ] **Step 7: Run the adapter tests to verify they fail**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/claude/helpers.test.ts src/agent-core/llm-api/openai-responses/helpers.test.ts`
Expected: FAIL — the user branch still returns bare string content.

- [ ] **Step 8: Update the Claude adapter**

In `apps/backend/src/agent-core/llm-api/claude/helpers.ts`:

Change the import of the message type and add the mapper:

```ts
import {attachmentsToBlocks} from '../helpers/attachments-to-blocks.js';
import type {LlmRequestMessage, ToolResultBlock} from '../types.js';
```

(remove the now-unused `LlmMessage` import).

Change the signature and the `user` branch:

```ts
/** Converts our unified request message to the Anthropic SDK message format. */
export function toSdkMessage(message: LlmRequestMessage): SdkMessageParam {
  switch (message.role) {
    case 'user': {
      if (message.attachments.length === 0) {
        return {role: 'user', content: message.content};
      }
      // Media first: Anthropic recommends that ordering, and it also keeps
      // addCacheBreakpoint's "mark the last block" rule landing on the text
      // block, which the AssertCacheControl checks above already cover.
      return {
        role: 'user',
        content: [
          ...toClaudeToolResultContent(attachmentsToBlocks(message.attachments)),
          {type: 'text', text: message.content},
        ],
      };
    }
```

`toClaudeToolResultContent` already returns exactly the block shapes a top-level user `content` array accepts, so it is reused as-is. Leave the rest of the function unchanged.

Update the call site in `claude/stream.ts` and `claude/token-count.ts` only if their local type annotations name `LlmMessage`; the option types changed in Step 3 already flow through.

- [ ] **Step 9: Update the OpenAI adapter**

In `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts`, add the import:

```ts
import {attachmentsToBlocks} from '../helpers/attachments-to-blocks.js';
import type {LlmRequestMessage, ToolResultBlock} from '../types.js';
```

Change the signature to `messages: readonly LlmRequestMessage[]` and replace the `user` branch:

```ts
      case 'user': {
        if (message.attachments.length === 0) {
          items.push({type: 'message', role: 'user', content: message.content});
          break;
        }
        items.push({
          type: 'message',
          role: 'user',
          content: [
            ...toOpenAIContentItems(attachmentsToBlocks(message.attachments)),
            {type: 'input_text', text: message.content},
          ],
        });
        break;
      }
```

Extract the block mapping out of `toOpenAIToolResultOutput` so both paths share it. Replace that function with:

```ts
/** Maps neutral media blocks to OpenAI Responses input content items. */
export function toOpenAIContentItems(
  blocks: readonly ToolResultBlock[],
): OpenAI.Responses.ResponseInputMessageContentList {
  return blocks.map((block) => {
    switch (block.type) {
      case 'text':
        return {type: 'input_text', text: block.text};
      case 'image':
        return {
          type: 'input_image',
          detail: 'auto',
          image_url: `data:${block.mediaType};base64,${block.data}`,
        };
      case 'document':
        // OpenAI's Responses API takes an inline file as `file_data` (a base64
        // data URL) plus a `filename` — see the input_file reference and the
        // official SDK examples. `filename` is always set so the model can
        // infer the file type.
        return {
          type: 'input_file',
          filename: block.name ?? 'document.pdf',
          file_data: `data:${block.mediaType};base64,${block.data}`,
        };
    }
  });
}

/**
 * Maps neutral tool-result blocks to an OpenAI function_call_output `output`.
 * All-text results stay a plain string (matches prior behavior); media results
 * become a content-item array.
 */
export function toOpenAIToolResultOutput(
  blocks: readonly ToolResultBlock[],
): string | OpenAI.Responses.ResponseFunctionCallOutputItemList {
  if (blocks.every((block) => block.type === 'text')) {
    return toolResultBlocksToText(blocks);
  }
  return toOpenAIContentItems(
    blocks,
  ) as OpenAI.Responses.ResponseFunctionCallOutputItemList;
}
```

The cast is safe and narrow: both list types are arrays of the same three item shapes, and the tool-result list is the narrower of the two. If the SDK ever diverges, this line is where it will fail to compile.

- [ ] **Step 10: Feed request messages from the session**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, add a private mapper and use it in `streamCompletion`. The resolver arrives in Task 4 — for now every attachment resolves to `null`:

```ts
  /**
   * Projects persisted history onto the request-time shape. Attachment bytes are
   * materialized here and never stored, so the snapshot stays free of base64.
   */
  private toRequestMessages(): LlmRequestMessage[] {
    return this.messages.map((message) => {
      if (message.role !== 'user') return message;
      return {
        ...message,
        attachments: message.attachments.map((attachment) => ({
          ...attachment,
          data: null,
        })),
      };
    });
  }
```

In `streamCompletion`, replace `messages: this.messages,` with `messages: this.toRequestMessages(),`.

Import `LlmRequestMessage` from `../llm-api/index.js`.

- [ ] **Step 11: Fix the one annotated construction site**

In `apps/backend/src/agent-core/llm-session/compaction/compaction-summary-generator.ts`, change the annotation so the literal satisfies the request shape:

```ts
    const messages: LlmRequestMessage[] = [
```

and update its import to bring in `LlmRequestMessage` instead of `LlmMessage` (keep `LlmMessage` if the file still uses it elsewhere).

`agent-title.ts` needs no change — its literal is contextually typed by `streamCompletion`, and `attachments: []` satisfies both shapes.

- [ ] **Step 12: Export the new types**

In `apps/backend/src/agent-core/llm-api/index.ts`, add `LlmRequestMessage`, `LlmRequestUserMessage`, and `ResolvedLlmAttachment` to the `export type {...}` list, and `attachmentsToBlocks` alongside the existing `toolResultBlocksToText` export.

- [ ] **Step 13: Run the tests and the build**

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS — including the new adapter cases.

Run: `pnpm typecheck:all`
Expected: no errors.

- [ ] **Step 14: Commit**

```bash
git add apps/backend/src/agent-core
git commit -m "feat(agent-core): deliver user-message attachments to both providers"
```

---

## Task 4: Wire the real attachment resolver

Replaces Task 3's `data: null` stub with bytes read from the store. This is the task that makes an uploaded file actually reach the model.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`

**Interfaces:**

- Consumes: `agentAttachmentStore.readBase64` (Task 2); `LlmRequestMessage`, `ResolvedLlmAttachment` (Task 3).
- Produces:

  ```ts
  // llm-session/types.ts
  export type AttachmentResolver = (
    attachment: LlmAttachment,
  ) => Promise<string | null>;

  // LlmSession's constructor gains an optional third parameter:
  constructor(
    getConfig: () => Promise<LlmConfig>,
    snapshot?: LlmSessionSnapshot,
    resolveAttachment?: AttachmentResolver,
  );
  ```

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/agent-core/llm-session/llm-session.test.ts`, following the file's existing pattern for stubbing `llmApi` and capturing the options it was called with:

```ts
describe('attachment resolution', () => {
  it('materializes base64 for the request without persisting it', async () => {
    const resolveAttachment = vi.fn(async (attachment: LlmAttachment) =>
      attachment.fileName === 'shot.png' ? 'AAA=' : null,
    );
    const session = new LlmSession(getConfig, undefined, resolveAttachment);

    const {stream} = session.sendUserMessage('look', [], '', undefined, [
      {fileName: 'shot.png', mediaType: 'image/png', byteSize: 3},
    ]);
    for await (const _event of stream) {
      // drain
    }

    const sent = capturedCompletionOptions();
    expect(sent.messages[0]).toMatchObject({
      role: 'user',
      content: 'look',
      attachments: [
        {fileName: 'shot.png', mediaType: 'image/png', data: 'AAA='},
      ],
    });

    // The snapshot keeps a reference only — never the bytes.
    const snapshot = session.toSnapshot();
    expect(snapshot.messages[0]).toMatchObject({
      attachments: [
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: 3},
      ],
    });
    expect(JSON.stringify(snapshot)).not.toContain('AAA=');
  });

  it('resolves a vanished file to null so the adapter can flag it', async () => {
    const session = new LlmSession(getConfig, undefined, async () => null);

    const {stream} = session.sendUserMessage('look', [], '', undefined, [
      {fileName: 'gone.png', mediaType: 'image/png', byteSize: 3},
    ]);
    for await (const _event of stream) {
      // drain
    }

    expect(capturedCompletionOptions().messages[0]).toMatchObject({
      attachments: [{fileName: 'gone.png', data: null}],
    });
  });

  it('resolves nothing when no resolver was injected', async () => {
    const session = new LlmSession(getConfig);

    const {stream} = session.sendUserMessage('look', [], '', undefined, [
      {fileName: 'shot.png', mediaType: 'image/png', byteSize: 3},
    ]);
    for await (const _event of stream) {
      // drain
    }

    expect(capturedCompletionOptions().messages[0]).toMatchObject({
      attachments: [{fileName: 'shot.png', data: null}],
    });
  });
});
```

Reuse the file's existing `getConfig` stub and its mechanism for reading back the options passed to `llmApi.streamCompletion` — the assertion at `llm-session.test.ts:143` shows the established pattern; extract it into a `capturedCompletionOptions()` helper in this file if one does not already exist. Import `LlmAttachment` from `@omnicraft/tool-schemas` and `vi` from `vitest`.

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/llm-session.test.ts`
Expected: FAIL — `sendUserMessage` takes no attachments parameter, and `data` is `null` even when the resolver returns bytes.

- [ ] **Step 3: Declare the resolver type**

In `apps/backend/src/agent-core/llm-session/types.ts`:

```ts
/**
 * Materializes an attachment's bytes as base64 for a provider call, or `null`
 * when the file is no longer on disk. Injected so `agent-core` never reaches up
 * into the service layer, and so tests can supply a fake.
 */
export type AttachmentResolver = (
  attachment: LlmAttachment,
) => Promise<string | null>;
```

Import `LlmAttachment` from `@omnicraft/tool-schemas` at the top of the file.

- [ ] **Step 4: Accept and use the resolver in `LlmSession`**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, add the field and constructor parameter:

```ts
  private readonly resolveAttachment: AttachmentResolver | null;

  constructor(
    getConfig: () => Promise<LlmConfig>,
    snapshot?: LlmSessionSnapshot,
    resolveAttachment?: AttachmentResolver,
  ) {
    this.getConfig = getConfig;
    this.resolveAttachment = resolveAttachment ?? null;
    // ...existing body unchanged
```

Replace Task 3's stub `toRequestMessages` with the resolving version:

```ts
  /**
   * Projects persisted history onto the request-time shape, materializing
   * attachment bytes. Nothing here is stored, so the snapshot stays free of
   * base64. History is re-sent on every tool round, so this re-reads each
   * attachment per round — see the plan's "Tunables" note before adding a cache.
   */
  private async toRequestMessages(): Promise<LlmRequestMessage[]> {
    return Promise.all(
      this.messages.map(async (message): Promise<LlmRequestMessage> => {
        if (message.role !== 'user') return message;
        const attachments = await Promise.all(
          message.attachments.map(async (attachment) => ({
            ...attachment,
            data: this.resolveAttachment
              ? await this.resolveAttachment(attachment)
              : null,
          })),
        );
        return {...message, attachments};
      }),
    );
  }
```

In `streamCompletion`, `await` it:

```ts
const messages = await this.toRequestMessages();
const eventStream = llmApi.streamCompletion({
  config: llmConfig,
  messages,
  systemPrompt: systemPrompt || undefined,
  tools,
  signal,
});
```

- [ ] **Step 5: Accept attachments in `sendUserMessage`**

```ts
  sendUserMessage(
    content: string,
    tools: readonly AnyToolDefinition[],
    systemPrompt: string,
    signal?: AbortSignal,
    attachments: readonly LlmAttachment[] = [],
  ): SendUserMessageResult {
    const userMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user' as const,
      content,
      attachments: [...attachments],
    };
```

`attachments` is last and defaulted so the existing four-argument call in `agent-turn-runner.ts` keeps compiling; Task 6 passes the real value.

- [ ] **Step 6: Bind the resolver in `Agent`**

In `apps/backend/src/agent-core/agent/agent.ts`, pass a bound method into both `LlmSession` constructions:

```ts
this.llmSession = new LlmSession(getConfig, snapshot.llmSession, (a) =>
  this.resolveAttachment(a),
);
```

```ts
this.llmSession = new LlmSession(getConfig, undefined, (a) =>
  this.resolveAttachment(a),
);
```

And add the private method:

```ts
  /**
   * Reads an attachment's bytes from this session's store. An arrow closure is
   * used at the LlmSession call sites because `scratchDirectory` is assigned
   * after the session is constructed — resolution only ever happens later.
   */
  private resolveAttachmentData(
    attachment: LlmAttachment,
  ): Promise<string | null> {
    return agentAttachmentStore.readBase64(
      this.scratchDirectory,
      attachment.fileName,
    );
  }
```

Import `agentAttachmentStore` from `./attachments/index.js` (in-module relative import) and `LlmAttachment` from `@omnicraft/tool-schemas`.

- [ ] **Step 7: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/llm-session.test.ts`
Expected: PASS, 3 new tests.

- [ ] **Step 8: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test`
Expected: no type errors; suite green.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent-core
git commit -m "feat(agent-core): resolve attachment bytes for provider requests"
```

---

## Task 5: Token estimation for attachments

Without this, compaction fires too late: an attachment costs the model 1600–3000 tokens that the estimator scores as zero.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/token-estimator.ts`
- Modify: `apps/backend/src/agent-core/llm-api/token-estimator.test.ts`

**Interfaces:**

- Consumes: `LlmMessage`, `LlmRequestMessage` (Task 3).
- Produces: `PromptTokenInput.messages` becomes `readonly (LlmMessage | LlmRequestMessage)[]`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/backend/src/agent-core/llm-api/token-estimator.test.ts`:

```ts
describe('user message attachments', () => {
  it('charges a bounded per-image cost on top of the text', () => {
    const withoutImage = estimatePromptTokens({
      messages: [
        {id: 'u', createdAt: 0, role: 'user', content: 'hi', attachments: []},
      ],
    });
    const withImage = estimatePromptTokens({
      messages: [
        {
          id: 'u',
          createdAt: 0,
          role: 'user',
          content: 'hi',
          attachments: [
            {fileName: 'a.png', mediaType: 'image/png', byteSize: 4_000_000},
          ],
        },
      ],
    });

    // Bounded and independent of byteSize — matches the tool-result image cost.
    expect(withImage - withoutImage).toBe(1600);
  });

  it('charges a larger bounded cost for a PDF', () => {
    const base = estimatePromptTokens({
      messages: [
        {id: 'u', createdAt: 0, role: 'user', content: 'hi', attachments: []},
      ],
    });
    const withPdf = estimatePromptTokens({
      messages: [
        {
          id: 'u',
          createdAt: 0,
          role: 'user',
          content: 'hi',
          attachments: [
            {fileName: 'a.pdf', mediaType: 'application/pdf', byteSize: 10},
          ],
        },
      ],
    });

    expect(withPdf - base).toBe(3000);
  });

  it('accepts a resolved request message without counting the base64', () => {
    const estimate = estimatePromptTokens({
      messages: [
        {
          id: 'u',
          createdAt: 0,
          role: 'user',
          content: 'hi',
          attachments: [
            {
              fileName: 'a.png',
              mediaType: 'image/png',
              byteSize: 3,
              data: 'A'.repeat(100_000),
            },
          ],
        },
      ],
    });

    // 'hi' is 1 token; the image is the flat 1600. The base64 must not be
    // counted as text — that would over-count by ~30,000 tokens.
    expect(estimate).toBeLessThan(1700);
  });
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/token-estimator.test.ts`
Expected: FAIL — the differences are `0`, and the third case does not type-check against `PromptTokenInput`.

- [ ] **Step 3: Widen the input type and charge for attachments**

In `apps/backend/src/agent-core/llm-api/token-estimator.ts`:

```ts
import type {LlmAttachment} from '@omnicraft/tool-schemas';

import type {LlmMessage, LlmRequestMessage, ToolResultBlock} from './types.js';
```

```ts
/** The parts of a request that contribute to the prompt token count. */
export interface PromptTokenInput {
  /**
   * A union rather than one type: compaction estimates over *persisted*
   * messages, while both adapters' token-count fallbacks estimate over
   * *resolved* ones. Neither is assignable to the other, and this function only
   * ever reads `mediaType` — resolving attachments merely to count tokens would
   * be pointless work.
   */
  readonly messages: readonly (LlmMessage | LlmRequestMessage)[];
  readonly systemPrompt?: string;
  readonly tools?: readonly AnyToolDefinition[];
}
```

```ts
function estimateMessageTokens(
  message: LlmMessage | LlmRequestMessage,
): number {
  if (message.role === 'user') {
    return (
      estimateText(message.content) +
      message.attachments.reduce(
        (sum, attachment) => sum + estimateAttachmentTokens(attachment),
        0,
      )
    );
  }
  // ...assistant and tool branches unchanged
}

function estimateAttachmentTokens(attachment: LlmAttachment): number {
  return attachment.mediaType === 'application/pdf'
    ? DOCUMENT_TOKEN_ESTIMATE
    : IMAGE_TOKEN_ESTIMATE;
}
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-api/token-estimator.test.ts`
Expected: PASS, 3 new tests.

- [ ] **Step 5: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test`
Expected: green. If `claude/token-count.ts` or `openai-responses/token-count.ts` errors on passing `options.messages` into `estimatePromptTokens`, the union in Step 3 was not applied — re-check it.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/llm-api
git commit -m "feat(agent-core): count attachment tokens in prompt estimates"
```

---

## Task 6: Thread attachments through the agent and SSE

Carries descriptors from `enqueueUserTurn` down to the message, and echoes them to clients so a reconnecting frontend can rebuild history.

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `packages/sse-events/src/schema.test.ts` (create if absent)
- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`

**Interfaces:**

- Consumes: `llmAttachmentSchema` from `@omnicraft/tool-schemas` (Task 1); `LlmSession.sendUserMessage`'s fifth parameter (Task 4).
- Produces:

  ```ts
  // sseMessageStartEventSchema now yields:
  //   {type, role, messageId, createdAt, content, attachments: LlmAttachment[]}

  // agent.ts
  enqueueUserTurn(userMessage: string, attachments?: readonly LlmAttachment[]): void;
  tryStartUserTurn(userMessage: string, attachments?: readonly LlmAttachment[]): boolean;

  // agent-turn-runner.ts
  interface RunAgentTurnInput {
    readonly userMessage: string;
    readonly attachments: readonly LlmAttachment[];
    // ...existing fields unchanged
  }
  ```

- [ ] **Step 1: Write the failing SSE schema test**

Append to `packages/sse-events/src/schema.test.ts`:

```ts
describe('sseMessageStartEventSchema attachments', () => {
  it('defaults attachments for event-log lines written before the field existed', () => {
    const parsed = sseMessageStartEventSchema.parse({
      type: 'message-start',
      role: 'user',
      messageId: 'm1',
      createdAt: 1,
      content: 'hello',
    });
    expect(parsed.attachments).toEqual([]);
  });

  it('carries attachment descriptors and no bytes', () => {
    const parsed = sseMessageStartEventSchema.parse({
      type: 'message-start',
      role: 'user',
      messageId: 'm1',
      createdAt: 1,
      content: 'look',
      attachments: [
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: 812345},
      ],
    });
    expect(parsed.attachments[0]?.fileName).toBe('shot.png');
    expect(parsed.attachments[0]).not.toHaveProperty('data');
  });

  it('rejects an undeliverable media type', () => {
    expect(() =>
      sseMessageStartEventSchema.parse({
        type: 'message-start',
        role: 'user',
        messageId: 'm1',
        createdAt: 1,
        content: 'look',
        attachments: [
          {fileName: 'a.svg', mediaType: 'image/svg+xml', byteSize: 1},
        ],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/sse-events test`
Expected: FAIL — `parsed.attachments` is `undefined`.

- [ ] **Step 3: Add the field to the SSE schema**

In `packages/sse-events/src/schema.ts`, import `llmAttachmentSchema` from `@omnicraft/tool-schemas` (the package is already a dependency) and extend the event:

```ts
/** A new message is starting. Carries message identity and timestamp. */
export const sseMessageStartEventSchema = z.object({
  type: z.literal('message-start'),
  role: z.enum(['user', 'assistant']),
  messageId: z.string(),
  createdAt: z.number(),
  content: z.string(),
  // Descriptors only — no bytes and no absolute paths cross this boundary. The
  // client fetches the bytes from the session's attachment endpoint. Defaulted
  // so event-log lines written before this field keep parsing on replay.
  attachments: z.array(llmAttachmentSchema).default([]),
});
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/sse-events test`
Expected: PASS, 3 new tests.

- [ ] **Step 5: Write the failing agent test**

Append to `apps/backend/src/agent-core/agent/agent.test.ts`, following the file's existing pattern for building an agent and collecting its SSE events:

```ts
it('echoes attachment descriptors on the user message-start event', async () => {
  const agent = createTestAgent();
  const attachments = [
    {fileName: 'shot.png', mediaType: 'image/png' as const, byteSize: 3},
  ];

  agent.enqueueUserTurn('look', attachments);
  const events = await collectEvents(agent);

  const start = events.find(
    (event) => event.type === 'message-start' && event.role === 'user',
  );
  expect(start).toMatchObject({content: 'look', attachments});
});
```

Reuse whatever helpers the file already defines for constructing an agent and draining its event log; do not introduce a second harness.

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts`
Expected: FAIL — `enqueueUserTurn` takes one argument, and the event has no `attachments`.

- [ ] **Step 7: Thread attachments through the turn runner**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`, add to `RunAgentTurnInput`:

```ts
export interface RunAgentTurnInput {
  readonly userMessage: string;
  readonly attachments: readonly LlmAttachment[];
  // ...existing fields unchanged
```

Pass them into the session and echo them on the event:

```ts
    const {
      stream: userStream,
      messageId,
      createdAt,
    } = input.llmSession.sendUserMessage(
      input.userMessage,
      toolDefs,
      systemPrompt,
      input.signal,
      input.attachments,
    );

    yield {
      type: 'message-start',
      role: 'user',
      messageId,
      createdAt,
      content: input.userMessage,
      attachments: [...input.attachments],
    } satisfies SseMessageStartEvent;
```

Import `LlmAttachment` from `@omnicraft/tool-schemas`.

- [ ] **Step 8: Thread attachments through `Agent`**

In `apps/backend/src/agent-core/agent/agent.ts`, widen the four methods that carry `userMessage`:

```ts
  enqueueUserTurn(
    userMessage: string,
    attachments: readonly LlmAttachment[] = [],
  ): void {
    this.runTrackedTurn(userMessage, attachments);
  }

  tryStartUserTurn(
    userMessage: string,
    attachments: readonly LlmAttachment[] = [],
  ): boolean {
    if (this.isRunning) return false;
    this.runTrackedTurn(userMessage, attachments);
    return true;
  }

  private runTrackedTurn(
    userMessage: string,
    attachments: readonly LlmAttachment[],
  ): void {
    this.pendingTurnCount++;
    void this.runTurn(userMessage, attachments).finally(() => {
      this.pendingTurnCount--;
    });
  }

  private async runTurn(
    userMessage: string,
    attachments: readonly LlmAttachment[],
  ): Promise<void> {
    // ...unchanged except the runAgentLoop call:
      const stream = this.runAgentLoop(
        userMessage,
        attachments,
        this.abortController.signal,
      );
  }

  protected runAgentLoop(
    userMessage: string,
    attachments: readonly LlmAttachment[],
    signal: AbortSignal,
  ): AgentEventStream {
    return agentTurnRunner.run({
      userMessage,
      attachments,
      // ...existing fields unchanged
    });
  }
```

**Nothing overrides `runAgentLoop`.** It is `protected` solely so the `UsageTestAgent` subclass in `agent-core/agent/agent.test.ts:50-54` can call it. Adding `attachments` as the **middle**, required parameter therefore breaks exactly one other call site — that test's `this.runAgentLoop(userMessage, new AbortController().signal)` — as a loud type error, not a silent mismatch. Update it to pass `[]`.

Middle-and-required rather than trailing-with-a-default is deliberate: with only two call sites, a future caller silently sending no attachments costs more than editing one test line.

- [ ] **Step 9: Run the agent tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts`
Expected: PASS.

- [ ] **Step 10: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/sse-events test`
Expected: green.

- [ ] **Step 11: Commit**

```bash
git add packages/sse-events apps/backend/src/agent-core/agent
git commit -m "feat(agent-core): carry attachment descriptors through turns and SSE"
```

---

## Task 7: Survive compaction

Compaction replaces the whole history with one synthetic text message, which would drop every attachment from the model's view. Two changes: keep base64 out of the summarizer, and tell the model the files are still on disk.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.ts` + its test
- Modify: `apps/backend/src/agent-core/llm-session/compaction/compaction-prompt-builder.ts` + its test
- Modify: `apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor.ts` + its test
- Modify: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-types.ts` (carry the attachments directory)
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts` and `compaction/llm-session-compactor.ts` (pass it through)

**Interfaces:**

- Consumes: `LlmAttachment`; `agentAttachmentStore.directory` (Task 2); `AttachmentResolver` wiring (Task 4).
- Produces:

  ```ts
  // compaction-prompt-builder.ts
  interface BuildCompactedMessageContentOptions {
    readonly summary: string;
    readonly recentContext: string;
    readonly attachments: readonly LlmAttachment[];
    /** Absolute attachments directory, or null when the session has no store. */
    readonly attachmentsDirectory: string | null;
  }
  ```

  `LlmSession` gains an optional `attachmentsDirectory` constructor parameter alongside the resolver; `Agent` supplies `agentAttachmentStore.directory(this.scratchDirectory)`.

- [ ] **Step 1: Write the failing slimmer test**

Append to `apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.test.ts`:

```ts
it('projects user attachments to placeholders alongside the text', () => {
  const [line] = compactionMessageSlimmer.slimMessagesForSummary(
    [
      {
        id: 'u1',
        createdAt: 1,
        role: 'user',
        content: 'what is this',
        attachments: [
          {
            fileName: 'invoice.pdf',
            mediaType: 'application/pdf',
            byteSize: 240_640,
          },
        ],
      },
    ],
    [],
  );

  const parsed = JSON.parse(line ?? '') as {content: string};
  expect(parsed.content).toContain('what is this');
  expect(parsed.content).toContain(
    '[attachment: invoice.pdf (application/pdf, 235 KB)]',
  );
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/compaction/compaction-message-slimmer.test.ts`
Expected: FAIL — the projected content has no placeholder.

- [ ] **Step 3: Project attachments in the slimmer**

In `apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.ts`, add the helper and use it in the user branch:

```ts
/** Renders a size in the same units the model sees in the compaction file list. */
export function formatAttachmentSize(byteSize: number): string {
  if (byteSize < 1024) return `${byteSize.toString()} B`;
  if (byteSize < 1024 * 1024) {
    return `${Math.round(byteSize / 1024).toString()} KB`;
  }
  return `${(byteSize / 1024 / 1024).toFixed(1)} MB`;
}

function projectUserContent(message: LlmUserMessage): string {
  if (message.attachments.length === 0) return message.content;
  const placeholders = message.attachments.map(
    (attachment) =>
      `[attachment: ${attachment.fileName} (${attachment.mediaType}, ${formatAttachmentSize(attachment.byteSize)})]`,
  );
  return [message.content, ...placeholders].join('\n');
}
```

Replace the trailing user branch of `slimMessages`:

```ts
result.push(
  JSON.stringify({
    role: 'user',
    content: truncateForCompaction(projectUserContent(message), truncation),
  }),
);
```

Import `LlmUserMessage` from `../../llm-api/index.js`.

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/compaction/compaction-message-slimmer.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing prompt-builder test**

Append to `apps/backend/src/agent-core/llm-session/compaction/compaction-prompt-builder.test.ts` (create it if absent):

```ts
describe('buildCompactedMessageContent attachments', () => {
  it('omits the section when there are no attachments', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [],
      attachmentsDirectory: '/data/sessions/x/scratch/attachments',
    });
    expect(content).not.toContain('Attachments you saw earlier');
  });

  it('lists absolute paths with sizes and no tool name', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [
        {
          fileName: 'invoice.pdf',
          mediaType: 'application/pdf',
          byteSize: 240_640,
        },
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: 831_488},
      ],
      attachmentsDirectory: '/data/sessions/x/scratch/attachments',
    });

    expect(content).toContain(
      '## Attachments you saw earlier in this conversation',
    );
    expect(content).toContain(
      '- /data/sessions/x/scratch/attachments/invoice.pdf — application/pdf, 235 KB',
    );
    expect(content).toContain(
      '- /data/sessions/x/scratch/attachments/shot.png — image/png, 812 KB',
    );
    // Source-agnostic and tool-agnostic by design — see the spec.
    expect(content).not.toContain('read_file');
    expect(content).not.toContain('uploaded');
    expect(content).not.toContain('1 MB');
  });

  it('omits the section when the session has no attachments directory', () => {
    const content = compactionPromptBuilder.buildCompactedMessageContent({
      summary: 's',
      recentContext: 'r',
      attachments: [{fileName: 'a.png', mediaType: 'image/png', byteSize: 1}],
      attachmentsDirectory: null,
    });
    expect(content).not.toContain('Attachments you saw earlier');
  });
});
```

- [ ] **Step 6: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/compaction/compaction-prompt-builder.test.ts`
Expected: FAIL — the options type has no `attachments`.

- [ ] **Step 7: Build the file list**

In `apps/backend/src/agent-core/llm-session/compaction/compaction-prompt-builder.ts`:

```ts
import path from 'node:path';

import type {LlmAttachment} from '@omnicraft/tool-schemas';

import {formatAttachmentSize} from './compaction-message-slimmer.js';

export interface BuildCompactedMessageContentOptions {
  readonly summary: string;
  readonly recentContext: string;
  readonly attachments: readonly LlmAttachment[];
  /** Absolute attachments directory, or null when the session has no store. */
  readonly attachmentsDirectory: string | null;
}
```

```ts
  /**
   * Tells the model the files it already saw are still readable. Names neither
   * the source (a tool result lands in the same list once
   * https://github.com/Soulike/OmniCraft/issues/388 ships) nor a specific tool
   * (catalogs differ per agent, and restating the media size limit would
   * duplicate a number read_file already interpolates from its own constant).
   */
  private buildAttachmentSection(
    attachments: readonly LlmAttachment[],
    attachmentsDirectory: string | null,
  ): string[] {
    if (attachments.length === 0 || attachmentsDirectory === null) return [];

    return [
      '',
      '## Attachments you saw earlier in this conversation',
      '',
      'You have already seen these files. They were dropped from the context by',
      'compaction, but they are still on disk — read them again if you need them.',
      '',
      ...attachments.map(
        (attachment) =>
          `- ${path.join(attachmentsDirectory, attachment.fileName)} — ${attachment.mediaType}, ${formatAttachmentSize(attachment.byteSize)}`,
      ),
    ];
  }
```

And append it inside `buildCompactedMessageContent`:

```ts
  buildCompactedMessageContent(
    options: BuildCompactedMessageContentOptions,
  ): string {
    return [
      '<conversation_summary>',
      options.summary,
      '</conversation_summary>',
      '',
      '<recent_context>',
      options.recentContext,
      '</recent_context>',
      ...this.buildAttachmentSection(
        options.attachments,
        options.attachmentsDirectory,
      ),
      '',
      '<continuation_instructions>',
      CONTINUATION_INSTRUCTIONS,
      '</continuation_instructions>',
    ].join('\n');
  }
```

- [ ] **Step 8: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/compaction/compaction-prompt-builder.test.ts`
Expected: PASS, 3 tests.

- [ ] **Step 9: Write the failing compactor test**

Append to `apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor.test.ts`:

```ts
it('carries deduped attachments from the compacted history into the replacement', async () => {
  const compactor = new LlmHistoryCompactor({
    summaryGenerator: {generate: async () => 'summary'} as never,
  });

  const result = await compactor.compact({
    messages: [
      {
        id: 'u1',
        createdAt: 1,
        role: 'user',
        content: 'first',
        attachments: [
          {fileName: 'shot.png', mediaType: 'image/png', byteSize: 831_488},
        ],
      },
      {
        id: 'u2',
        createdAt: 2,
        role: 'user',
        content: 'again',
        attachments: [
          {fileName: 'shot.png', mediaType: 'image/png', byteSize: 831_488},
          {
            fileName: 'invoice.pdf',
            mediaType: 'application/pdf',
            byteSize: 240_640,
          },
        ],
      },
    ],
    tools: [],
    attachmentsDirectory: '/data/sessions/x/scratch/attachments',
  } as never);

  const content = result.replacementMessages[0]?.content ?? '';
  expect(content.match(/shot\.png/g)).toHaveLength(1);
  expect(content).toContain('invoice.pdf');
  // The replacement message itself carries no attachments — the model re-reads
  // from disk rather than having them re-attached.
  expect(result.replacementMessages[0]).toMatchObject({attachments: []});
});
```

Match the file's existing dependency-injection style for `summaryGenerator`; if it stubs differently, follow that.

- [ ] **Step 10: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/compaction/llm-history-compactor.test.ts`
Expected: FAIL — the replacement content has no file list.

- [ ] **Step 11: Collect and pass the attachments**

In `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-types.ts`, add to `LlmHistoryCompactionInput`:

```ts
  /** Absolute attachments directory, or null when the session has no store. */
  readonly attachmentsDirectory: string | null;
```

In `llm-history-compactor.ts`:

```ts
/** Every attachment referenced by the history being compacted, first occurrence
 *  wins, deduped by file name. */
function collectAttachments(messages: readonly LlmMessage[]): LlmAttachment[] {
  const byName = new Map<string, LlmAttachment>();
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const attachment of message.attachments) {
      if (byName.has(attachment.fileName)) continue;
      byName.set(attachment.fileName, attachment);
    }
  }
  return [...byName.values()];
}
```

```ts
const replacementMessages: LlmMessage[] = [
  {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    role: 'user',
    content: this.promptBuilder.buildCompactedMessageContent({
      summary,
      recentContext: recentContext.content,
      attachments: collectAttachments(input.messages),
      attachmentsDirectory: input.attachmentsDirectory,
    }),
    attachments: [],
  },
];
```

- [ ] **Step 12: Pass the directory down from the session**

`LlmSession` gains an optional fourth constructor parameter `attachmentsDirectory?: string`, stored as `string | null`, and includes it in the object it hands `llmSessionCompactor.compactIfNeeded(...)` so it reaches `LlmHistoryCompactionInput`. Follow the existing `messages` / `usage` fields through `llm-session-compactor.ts` and add `attachmentsDirectory` alongside them.

In `agent.ts`, supply it at both `LlmSession` construction sites:

```ts
this.llmSession = new LlmSession(
  getConfig,
  snapshot?.llmSession,
  (a) => this.resolveAttachmentData(a),
  agentAttachmentStore.directory(
    agentScratchDirectoryService.createScratchDirectory(
      options.sessionsDir ?? null,
      id,
    ),
  ),
);
```

**Ordering hazard:** `this.scratchDirectory` is assigned _after_ `LlmSession` is constructed, so it cannot be read here. Move the `agentScratchDirectoryService.createScratchDirectory(...)` call **above** the `if (snapshot)` block, assign it to a local `const scratchDirectory`, use that local in both `LlmSession` constructions, and assign `this.scratchDirectory = scratchDirectory` where the field is set today. The resolver closure is unaffected — it runs later.

- [ ] **Step 13: Run the compaction tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/llm-session/compaction`
Expected: PASS, including the three pre-existing compaction suites.

- [ ] **Step 14: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test`
Expected: green.

- [ ] **Step 15: Commit**

```bash
git add apps/backend/src/agent-core
git commit -m "feat(agent-core): keep attachments reachable across compaction"
```

---

## Task 8: HTTP schemas and the `Cache-Control` fix

Two independent pieces of groundwork the routes need. No behavior change yet.

**Files:**

- Modify: `packages/api-schema/package.json` (add the `@omnicraft/tool-schemas` dependency)
- Modify: `packages/api-schema/src/chat/schema.ts`
- Modify: `packages/api-schema/src/chat/schema.test.ts`
- Modify: `packages/api-schema/src/index.ts`
- Modify: `apps/backend/src/dispatcher/index.ts`

**Interfaces:**

- Consumes: `llmAttachmentSchema` from `@omnicraft/tool-schemas` (Task 1).
- Produces, exported from `@omnicraft/api-schema`:

  ```ts
  export const chatCompletionsRequestSchema: z.ZodObject<{
    message: z.ZodString; // still .min(1)
    attachmentFileNames: z.ZodDefault<z.ZodArray<z.ZodString>>;
  }>;
  export const uploadAttachmentQuerySchema: z.ZodObject<{name: z.ZodString}>;
  export const uploadAttachmentResponseSchema; // = llmAttachmentSchema
  export type UploadAttachmentResponse = LlmAttachment;
  ```

- [ ] **Step 1: Add the dependency**

Run: `pnpm --filter @omnicraft/api-schema add @omnicraft/tool-schemas@workspace:^`
Expected: `packages/api-schema/package.json` gains the dependency. Never hand-write the version.

`tool-schemas` depends only on `zod`, so this edge cannot create a cycle.

- [ ] **Step 2: Write the failing schema tests**

Append to `packages/api-schema/src/chat/schema.test.ts`:

```ts
describe('chatCompletionsRequestSchema attachments', () => {
  it('defaults attachmentFileNames to an empty list', () => {
    const parsed = chatCompletionsRequestSchema.parse({message: 'hello'});
    expect(parsed.attachmentFileNames).toEqual([]);
  });

  it('accepts a list of file names', () => {
    const parsed = chatCompletionsRequestSchema.parse({
      message: 'look',
      attachmentFileNames: ['shot.png', 'invoice.pdf'],
    });
    expect(parsed.attachmentFileNames).toEqual(['shot.png', 'invoice.pdf']);
  });

  it('still requires a non-empty message even with attachments', () => {
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: '',
        attachmentFileNames: ['shot.png'],
      }),
    ).toThrow();
  });

  it('rejects an empty file name', () => {
    expect(() =>
      chatCompletionsRequestSchema.parse({
        message: 'look',
        attachmentFileNames: [''],
      }),
    ).toThrow();
  });
});

describe('uploadAttachmentQuerySchema', () => {
  it('requires a non-empty name', () => {
    expect(uploadAttachmentQuerySchema.parse({name: 'a.png'}).name).toBe(
      'a.png',
    );
    expect(() => uploadAttachmentQuerySchema.parse({})).toThrow();
    expect(() => uploadAttachmentQuerySchema.parse({name: ''})).toThrow();
  });
});
```

- [ ] **Step 3: Run them to verify they fail**

Run: `pnpm --filter @omnicraft/api-schema test`
Expected: FAIL — `attachmentFileNames` is rejected by `z.strictObject`, and `uploadAttachmentQuerySchema` does not exist.

- [ ] **Step 4: Extend the HTTP schemas**

In `packages/api-schema/src/chat/schema.ts`:

```ts
import {llmAttachmentSchema} from '@omnicraft/tool-schemas';
```

```ts
/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsRequestSchema = z.strictObject({
  message: z.string().min(1),
  // Names only. The server re-stats and re-sniffs each file, so a client cannot
  // misreport a media type or size. Text is always required — an attachment
  // never substitutes for it.
  attachmentFileNames: z.array(z.string().min(1)).default([]),
});

/** Schema for the POST /chat|coding/session/:id/attachments query string. */
export const uploadAttachmentQuerySchema = z.object({
  name: z.string().min(1),
});

export type UploadAttachmentQuery = z.infer<typeof uploadAttachmentQuerySchema>;

/**
 * Schema for the POST /chat|coding/session/:id/attachments response body. The
 * stored name may differ from the requested one — it is sanitized, given the
 * extension of the sniffed media type, and uniquified against collisions.
 */
export const uploadAttachmentResponseSchema = llmAttachmentSchema;

export type UploadAttachmentResponse = z.infer<
  typeof uploadAttachmentResponseSchema
>;
```

Export all four new symbols from `packages/api-schema/src/index.ts`, keeping the file's alphabetical ordering.

- [ ] **Step 5: Run them to verify they pass**

Run: `pnpm --filter @omnicraft/api-schema test`
Expected: PASS, 5 new tests.

- [ ] **Step 6: Make `Cache-Control` conditional**

In `apps/backend/src/dispatcher/index.ts`:

```ts
apiRouter.use(async (ctx, next) => {
  await next();
  // Only the default. A handler that sets its own policy — e.g. the attachment
  // download endpoint, whose bytes are immutable for a given name — must not be
  // overwritten, and this middleware runs after the handler.
  if (ctx.response.get('Cache-Control') === '') {
    ctx.set('Cache-Control', 'no-store');
  }
});
```

- [ ] **Step 7: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/api-schema test && pnpm --filter @omnicraft/backend test`
Expected: green. The backend router still passes only `message` to `sendCompletion`; `attachmentFileNames` is parsed and ignored until Task 10.

- [ ] **Step 8: Commit**

```bash
git add packages/api-schema apps/backend/src/dispatcher pnpm-lock.yaml
git commit -m "feat(api-schema): add attachment upload and completion schemas"
```

---

## Task 9: Attachment operations on `Agent`, and the session bindings

The agent owns its scratch space, so it owns the operations on it. Task 4 already
put `resolveAttachmentData` on `Agent` for the LLM path; this task adds the
HTTP-facing counterparts next to it rather than reaching into the agent's
directory from outside.

`getScratchDirectory()` currently has **zero production callers** — only tests.
Do not make the service layer its first one.

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
- Create: `apps/backend/src/services/agent-attachments/agent-attachment-service.ts`
- Create: `apps/backend/src/services/agent-attachments/index.ts`
- Modify: `apps/backend/src/services/chat-agent-session/chat-agent-session-service.ts` and `index.ts`
- Modify: `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts` and `index.ts`

**Interfaces:**

- Consumes: `agentAttachmentStore` (Task 2); `AgentStore` base class (`models/agent-store/`).
- Produces:

  ```ts
  // On Agent — all four delegate to agentAttachmentStore with this.scratchDirectory
  async saveAttachment(desiredName: string, body: Readable): Promise<SaveAttachmentResult>;
  async describeAttachment(fileName: string): Promise<OpenedAttachment | null>;
  async removeAttachment(fileName: string): Promise<boolean>;
  async resolveAttachments(
    fileNames: readonly string[],
  ): Promise<ResolveAttachmentsResult>;

  // services/agent-attachments/
  export type ResolveAttachmentsResult =
    | {readonly ok: true; readonly attachments: LlmAttachment[]}
    | {readonly ok: false; readonly missing: string[]};

  export interface AgentAttachmentService {
    save(agentId: string, desiredName: string, body: Readable): Promise<SaveAttachmentResult | null>;
    describe(agentId: string, fileName: string): Promise<OpenedAttachment | null>;
    remove(agentId: string, fileName: string): Promise<boolean | null>;
    resolve(agentId: string, fileNames: readonly string[]): Promise<ResolveAttachmentsResult | null>;
  }

  export function createAgentAttachmentService(
    getStore: () => AgentStore,
  ): AgentAttachmentService;
  ```

  `ResolveAttachmentsResult` lives in **`agent-core/agent/attachments/`**, not in
  `services/`: it is the return type of an `Agent` method, and the repo's layering
  rule is Dispatcher → Service → Model/API, never reversed — `agent-core` importing
  from `services/` would invert it. The service re-exports nothing; it imports the
  type from `@/agent-core/agent/index.js` like any other consumer. Every service
  method returns `null` when the session does not exist, which the routers map to 404.

- [ ] **Step 1: Write the failing `Agent` tests**

Append to `apps/backend/src/agent-core/agent/agent.test.ts`, reusing the file's existing agent-construction helper:

```ts
describe('attachment operations', () => {
  it('stores an attachment in its own scratch space', async () => {
    const agent = createTestAgent();

    const saved = await agent.saveAttachment('shot.png', Readable.from([PNG]));
    expect(saved).toMatchObject({ok: true});

    const found = await agent.describeAttachment('shot.png');
    expect(found?.attachment).toEqual({
      fileName: 'shot.png',
      mediaType: 'image/png',
      byteSize: PNG.length,
    });
    expect(found?.absolutePath).toBe(
      path.join(agent.getScratchDirectory(), 'attachments', 'shot.png'),
    );
  });

  it('removes an attachment and reports whether it existed', async () => {
    const agent = createTestAgent();
    await agent.saveAttachment('shot.png', Readable.from([PNG]));

    expect(await agent.removeAttachment('shot.png')).toBe(true);
    expect(await agent.removeAttachment('shot.png')).toBe(false);
  });

  it('resolves names to descriptors read from disk, in the requested order', async () => {
    const agent = createTestAgent();
    await agent.saveAttachment('a.png', Readable.from([PNG]));
    await agent.saveAttachment('b.png', Readable.from([PNG]));

    const result = await agent.resolveAttachments(['b.png', 'a.png']);
    expect(result.ok && result.attachments.map((a) => a.fileName)).toEqual([
      'b.png',
      'a.png',
    ]);
  });

  it('reports every unknown name instead of failing on the first', async () => {
    const agent = createTestAgent();

    expect(
      await agent.resolveAttachments(['gone.png', '../escape.png']),
    ).toEqual({
      ok: false,
      missing: ['gone.png', '../escape.png'],
    });
  });
});
```

Define `PNG` in the test file as a real PNG header plus padding, matching the fixture style in `agent-attachment-store.test.ts`, and import `Readable` from `node:stream`.

- [ ] **Step 2: Run them to verify they fail**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts`
Expected: FAIL — `agent.saveAttachment is not a function`.

- [ ] **Step 3: Add the operations to `Agent`**

In `apps/backend/src/agent-core/agent/agent.ts`, next to the `resolveAttachmentData` added in Task 4:

```ts
  /**
   * Stores an attachment in this Agent's scratch space. The Agent owns the
   * directory, so it owns the operations on it — callers never need its path.
   */
  saveAttachment(
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult> {
    return agentAttachmentStore.save(
      this.scratchDirectory,
      desiredName,
      body,
    );
  }

  /** Describes a stored attachment, or `null` when it is not there. */
  describeAttachment(fileName: string): Promise<OpenedAttachment | null> {
    return agentAttachmentStore.describe(this.scratchDirectory, fileName);
  }

  /** Deletes a stored attachment. Returns whether it existed. */
  removeAttachment(fileName: string): Promise<boolean> {
    return agentAttachmentStore.remove(this.scratchDirectory, fileName);
  }

  /**
   * Turns caller-supplied file names into descriptors read from disk. The caller
   * never supplies `mediaType` or `byteSize`, so what lands in the snapshot
   * always matches the bytes. Reports every unknown name at once so a client can
   * show them all.
   */
  async resolveAttachments(
    fileNames: readonly string[],
  ): Promise<ResolveAttachmentsResult> {
    const found = await Promise.all(
      fileNames.map((fileName) => this.describeAttachment(fileName)),
    );

    const missing = fileNames.filter((_name, index) => found[index] === null);
    if (missing.length > 0) return {ok: false, missing};

    const attachments: LlmAttachment[] = [];
    for (const entry of found) {
      // Narrowed by the `missing` check above; every entry is present.
      if (entry === null) continue;
      attachments.push(entry.attachment);
    }
    return {ok: true, attachments};
  }
```

- [ ] **Step 4: Run them to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts`
Expected: PASS, 4 new tests.

- [ ] **Step 5: Add the shared service factory**

Create `apps/backend/src/services/agent-attachments/agent-attachment-service.ts`:

```ts
import type {Readable} from 'node:stream';

import type {
  OpenedAttachment,
  ResolveAttachmentsResult,
  SaveAttachmentResult,
} from '@/agent-core/agent/index.js';
import type {AgentStore} from '@/models/agent-store/index.js';

// ResolveAttachmentsResult comes from agent-core, not the other way round —
// agent-core must never import from services/.

export interface AgentAttachmentService {
  save(
    agentId: string,
    desiredName: string,
    body: Readable,
  ): Promise<SaveAttachmentResult | null>;
  describe(agentId: string, fileName: string): Promise<OpenedAttachment | null>;
  remove(agentId: string, fileName: string): Promise<boolean | null>;
  resolve(
    agentId: string,
    fileNames: readonly string[],
  ): Promise<ResolveAttachmentsResult | null>;
}

/**
 * Binds attachment operations to one session family. The operations themselves
 * live on `Agent`; the only thing that differs between chat and coding sessions
 * is which store resolves the id — and that lookup is the access boundary, so
 * the two bindings must stay separate. `getStore` is a thunk because
 * `getInstance()` asserts the singleton exists and must run per request, not at
 * module load.
 *
 * Every method returns `null` when the session does not exist, which the router
 * maps to 404.
 */
export function createAgentAttachmentService(
  getStore: () => AgentStore,
): AgentAttachmentService {
  return {
    async save(agentId, desiredName, body) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.saveAttachment(desiredName, body);
    },

    async describe(agentId, fileName) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.describeAttachment(fileName);
    },

    async remove(agentId, fileName) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.removeAttachment(fileName);
    },

    async resolve(agentId, fileNames) {
      const agent = await getStore().get(agentId);
      if (!agent) return null;
      return agent.resolveAttachments(fileNames);
    },
  };
}
```

Create `apps/backend/src/services/agent-attachments/index.ts` exporting the factory and the `AgentAttachmentService` type.

- [ ] **Step 6: Bind it for both session families**

In `apps/backend/src/services/chat-agent-session/index.ts`:

```ts
export const chatAgentAttachments = createAgentAttachmentService(() =>
  MainAgentStore.getInstance(),
);
```

In `apps/backend/src/services/coding-agent-session/index.ts`, the same against `CodingAgentStore.getInstance()`.

No test file for the factory: it is four two-line delegations over `Agent` methods that Step 1 already covers, and a test would only assert that a mock was called.

- [ ] **Step 7: Widen `sendCompletion` in both services**

`chat-agent-session-service.ts`:

```ts
  async sendCompletion(
    agentId: string,
    userMessage: string,
    attachments: readonly LlmAttachment[] = [],
  ): Promise<boolean> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return false;
    agent.enqueueUserTurn(userMessage, attachments);
    return true;
  },
```

`coding-agent-session-service.ts` — identical, against `CodingAgentStore`.

- [ ] **Step 8: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test`
Expected: green.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent-core apps/backend/src/services
git commit -m "feat(agent-core): give Agent attachment operations on its scratch space"
```

---

## Task 10: Attachment routes

Three HTTP endpoints, registered once and bound to both routers. The handlers are
identical for chat and coding — only the path prefix and the service binding
differ — so they are written once in `dispatcher/helpers/`, which
`dispatcher/CLAUDE.md` designates for "agent-agnostic transport helpers shared
across resource modules" (the same home as `session-id.ts` and `cursor.ts`).

**Files:**

- Create: `apps/backend/src/dispatcher/helpers/attachment-name.ts`
- Create: `apps/backend/src/dispatcher/helpers/attachment-name.test.ts`
- Create: `apps/backend/src/dispatcher/helpers/attachment-routes.ts`
- Modify: `apps/backend/src/dispatcher/chat-agent-session/path.ts` and `router.ts`
- Modify: `apps/backend/src/dispatcher/coding-agent-session/path.ts` and `router.ts`

**Interfaces:**

- Consumes: `chatAgentAttachments` / `codingAgentAttachments` and the
  `AgentAttachmentService` type (Task 9); `uploadAttachmentQuerySchema`,
  `chatCompletionsRequestSchema` (Task 8); `parseSessionId` (existing).
- Produces:

  ```ts
  // dispatcher/helpers/attachment-name.ts
  export function parseAttachmentFileName(
    raw: string | undefined,
  ): string | null;

  // dispatcher/helpers/attachment-routes.ts
  export interface AttachmentRoutePaths {
    readonly collection: string; // '/chat/session/:id/attachments'
    readonly byName: string; // '/chat/session/:id/attachments/:fileName'
  }
  export function registerAttachmentRoutes(
    router: Router,
    paths: AttachmentRoutePaths,
    service: AgentAttachmentService,
  ): void;

  // chat path.ts / coding path.ts
  export const SESSION_ATTACHMENTS: string;
  export const SESSION_ATTACHMENT_BY_NAME: string;
  ```

- [ ] **Step 1: Write the failing path-param test**

Create `apps/backend/src/dispatcher/helpers/attachment-name.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {parseAttachmentFileName} from './attachment-name.js';

const NUL = String.fromCharCode(0);
const DEL = String.fromCharCode(0x7f);

describe('parseAttachmentFileName', () => {
  it('accepts a bare file name, including spaces and non-ASCII', () => {
    expect(parseAttachmentFileName('shot.png')).toBe('shot.png');
    expect(parseAttachmentFileName('invoice (2).pdf')).toBe('invoice (2).pdf');
  });

  it.each([
    ['undefined', undefined],
    ['empty', ''],
    ['dot', '.'],
    ['dot-dot', '..'],
    ['a traversal segment', '../snapshot.json'],
    ['a nested path', 'sub/shot.png'],
    ['a backslash path', 'sub\\shot.png'],
    ['an absolute path', '/etc/passwd'],
    ['a NUL byte', `shot${NUL}.png`],
    ['a DEL byte', `shot${DEL}.png`],
    ['a newline', 'shot\n.png'],
  ])('rejects %s', (_label, raw) => {
    expect(parseAttachmentFileName(raw)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/dispatcher/helpers/attachment-name.test.ts`
Expected: FAIL — cannot resolve `./attachment-name.js`.

- [ ] **Step 3: Implement the parser**

Create `apps/backend/src/dispatcher/helpers/attachment-name.ts`:

```ts
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
```

- [ ] **Step 4: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/dispatcher/helpers/attachment-name.test.ts`
Expected: PASS, 12 cases.

- [ ] **Step 5: Add the route constants**

In `apps/backend/src/dispatcher/chat-agent-session/path.ts`:

```ts
export const SESSION_ATTACHMENTS = '/chat/session/:id/attachments';
export const SESSION_ATTACHMENT_BY_NAME =
  '/chat/session/:id/attachments/:fileName';
```

In `apps/backend/src/dispatcher/coding-agent-session/path.ts`, the same with the `/coding` prefix.

- [ ] **Step 6: Write the shared route registrar**

Create `apps/backend/src/dispatcher/helpers/attachment-routes.ts`:

```ts
import {createReadStream} from 'node:fs';

import type Router from '@koa/router';
import {uploadAttachmentQuerySchema} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import type {AgentAttachmentService} from '@/services/agent-attachments/index.js';

import {parseAttachmentFileName} from './attachment-name.js';
import {parseSessionId} from './session-id.js';

export interface AttachmentRoutePaths {
  readonly collection: string;
  readonly byName: string;
}

/**
 * Registers the upload / download / delete endpoints on a session router.
 *
 * The handlers are identical for every session family; only the path prefix and
 * the service binding differ. The binding is what keeps the families apart — a
 * coding session id must not reach a chat session's attachments — so it is a
 * parameter rather than something resolved inside.
 */
export function registerAttachmentRoutes(
  router: Router,
  paths: AttachmentRoutePaths,
  service: AgentAttachmentService,
): void {
  /** POST …/attachments — stores an uploaded image or PDF. */
  router.post(paths.collection, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    if (id === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: `Session not found: ${ctx.params.id}`};
      return;
    }

    let name: string;
    try {
      name = uploadAttachmentQuerySchema.parse(ctx.query).name;
    } catch (e) {
      if (e instanceof ZodError) {
        ctx.response.status = StatusCodes.BAD_REQUEST;
        ctx.response.body = {error: e.issues};
        return;
      }
      throw e;
    }

    // `@koa/bodyparser` only handles json/form, so for any other content type
    // the request stream is untouched and can be piped straight to disk.
    const result = await service.save(id, name, ctx.req);
    if (result === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: `Session not found: ${id}`};
      return;
    }

    if (!result.ok) {
      ctx.response.status =
        result.reason === 'too-large'
          ? StatusCodes.REQUEST_TOO_LONG
          : StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: result.reason};
      return;
    }

    ctx.response.status = StatusCodes.CREATED;
    ctx.response.body = result.attachment;
  });

  /** GET …/attachments/:fileName — streams the stored bytes. */
  router.get(paths.byName, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    const fileName = parseAttachmentFileName(ctx.params.fileName);
    if (id === null || fileName === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    const found = await service.describe(id, fileName);
    if (found === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    ctx.response.status = StatusCodes.OK;
    ctx.response.type = found.attachment.mediaType;
    ctx.response.length = found.attachment.byteSize;
    // Bytes are immutable for a given name — the store uniquifies rather than
    // overwriting. Set explicitly so the /api default of `no-store` does not
    // apply (see the conditional middleware in dispatcher/index.ts).
    ctx.response.set('Cache-Control', 'private, max-age=31536000, immutable');
    ctx.body = createReadStream(found.absolutePath);
  });

  /** DELETE …/attachments/:fileName — removes a stored file. */
  router.delete(paths.byName, async (ctx) => {
    const id = parseSessionId(ctx.params.id);
    const fileName = parseAttachmentFileName(ctx.params.fileName);
    if (id === null || fileName === null) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    const removed = await service.remove(id, fileName);
    if (removed !== true) {
      ctx.response.status = StatusCodes.NOT_FOUND;
      ctx.response.body = {error: 'Attachment not found'};
      return;
    }

    ctx.response.status = StatusCodes.NO_CONTENT;
  });
}
```

`paths.collection` is registered before `paths.byName` so the collection POST is
not shadowed — the same concern documented for `mcpSettingsRouter` in
`dispatcher/index.ts`.

- [ ] **Step 7: Call the registrar from both routers**

In `apps/backend/src/dispatcher/chat-agent-session/router.ts`, after the existing
route registrations:

```ts
registerAttachmentRoutes(
  router,
  {collection: SESSION_ATTACHMENTS, byName: SESSION_ATTACHMENT_BY_NAME},
  chatAgentAttachments,
);
```

In `apps/backend/src/dispatcher/coding-agent-session/router.ts`, the same with
that module's path constants and `codingAgentAttachments`.

- [ ] **Step 8: Wire attachments into both completions handlers**

This part stays per-router — it edits an existing handler rather than adding one.
In the `SESSION_COMPLETIONS` handler, replace the body-parsing block and the
service call:

```ts
let message: string;
let attachmentFileNames: string[];
try {
  const body = chatCompletionsRequestSchema.parse(ctx.request.body);
  message = body.message;
  attachmentFileNames = body.attachmentFileNames;
} catch (e) {
  if (e instanceof ZodError) {
    ctx.response.status = StatusCodes.BAD_REQUEST;
    ctx.response.body = {error: e.issues};
    return;
  }
  throw e;
}

const resolved = await chatAgentAttachments.resolve(id, attachmentFileNames);
if (resolved === null) {
  ctx.response.status = StatusCodes.NOT_FOUND;
  ctx.response.body = {error: `Session not found: ${id}`};
  return;
}
if (!resolved.ok) {
  ctx.response.status = StatusCodes.BAD_REQUEST;
  ctx.response.body = {
    error: 'UNKNOWN_ATTACHMENTS',
    missing: resolved.missing,
  };
  return;
}

const found = await chatAgentSessionService.sendCompletion(
  id,
  message,
  resolved.attachments,
);
```

The turn does not start when a name is unknown — the model must never see a
message promising a file it will not get.

Apply the same change to the coding router, against `codingAgentAttachments` and
`codingAgentSessionService`.

- [ ] **Step 9: Verify the build and full suite**

Run: `pnpm typecheck:all && pnpm --filter @omnicraft/backend test`
Expected: green.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/dispatcher
git commit -m "feat(dispatcher): add session attachment endpoints"
```

---

## Task 11: End-to-end verification

Proves the whole path: bytes land where the layout promises, the snapshot stays free of base64, and the model actually sees the image.

**Files:**

- Create: `apps/backend/src/agent-core/agent/attachments/attachment-round-trip.test.ts`

**Interfaces:**

- Consumes: everything from Tasks 1–10. Produces no new types.

- [ ] **Step 1: Write the round-trip test**

Create `apps/backend/src/agent-core/agent/attachments/attachment-round-trip.test.ts`:

```ts
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {agentPersistence} from '../persistence/agent-persistence.js';
import {agentAttachmentStore} from './agent-attachment-store.js';

const PNG = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(512),
]);

const AGENT_ID = '11111111-1111-4111-8111-111111111111';

let sessionsDir: string;

beforeEach(async () => {
  sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'attach-e2e-'));
});

afterEach(async () => {
  await rm(sessionsDir, {recursive: true, force: true});
});

describe('attachment round trip', () => {
  it('stores bytes at the documented path and keeps base64 out of the snapshot', async () => {
    const scratchDirectory = agentPersistence.scratchPath(
      sessionsDir,
      AGENT_ID,
    );
    const saved = await agentAttachmentStore.save(
      scratchDirectory,
      'shot.png',
      Readable.from([PNG]),
    );
    expect(saved.ok).toBe(true);
    if (!saved.ok) return;

    // The bytes land exactly where attachmentsPath advertises.
    const expectedPath = path.join(
      agentPersistence.attachmentsPath(sessionsDir, AGENT_ID),
      'shot.png',
    );
    expect((await readFile(expectedPath)).equals(PNG)).toBe(true);

    const snapshot = {
      id: AGENT_ID,
      title: 'T',
      sseEventCount: 0,
      todos: [],
      options: {},
      llmSession: {
        id: 'sess',
        messages: [
          {
            id: 'u1',
            createdAt: 1,
            role: 'user',
            content: 'look',
            attachments: [saved.attachment],
          },
        ],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: {inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0},
      },
    };

    await agentPersistence.persistSnapshot(
      sessionsDir,
      AGENT_ID,
      snapshot as never,
    );
    const written = await readFile(
      agentPersistence.snapshotPath(sessionsDir, AGENT_ID),
      'utf-8',
    );

    expect(written).toContain('"fileName": "shot.png"');
    expect(written).not.toContain(PNG.toString('base64').slice(0, 32));

    const loaded = await agentPersistence.loadSnapshot(sessionsDir, AGENT_ID);
    expect(loaded.llmSession.messages[0]).toMatchObject({
      attachments: [
        {fileName: 'shot.png', mediaType: 'image/png', byteSize: PNG.length},
      ],
    });
  });
});
```

If `agentSnapshotSchema` rejects the literal, extend the literal to satisfy it rather than loosening the cast — the point of this test is that a _real_ snapshot round-trips.

- [ ] **Step 2: Run it to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/attachments/attachment-round-trip.test.ts`
Expected: PASS.

- [ ] **Step 3: Verify the whole repo**

Run: `pnpm typecheck:all`
Expected: no errors.

Run: `pnpm lint:all`
Expected: no errors.

Run: `pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/api-schema test && pnpm --filter @omnicraft/sse-events test && pnpm --filter @omnicraft/tool-schemas test`
Expected: all green.

- [ ] **Step 4: Verify against a running server**

Unit tests cannot prove the bytes reached the provider. Start the dev server from the repo root (it allocates free ports):

```bash
pnpm dev
```

Then, substituting the printed backend port:

```bash
PORT=<printed backend port>

SID=$(curl -s -X POST "localhost:$PORT/api/chat/session" \
  -H 'Content-Type: application/json' -d '{}' \
  | python3 -c 'import json,sys; print(json.load(sys.stdin)["sessionId"])')

curl -s -X POST "localhost:$PORT/api/chat/session/$SID/attachments?name=shot.png" \
  -H 'Content-Type: application/octet-stream' \
  --data-binary @/path/to/a/real.png
# Expect: {"fileName":"shot.png","mediaType":"image/png","byteSize":...}

curl -s -D - -o /dev/null "localhost:$PORT/api/chat/session/$SID/attachments/shot.png"
# Expect: 200, Content-Type: image/png,
#         Cache-Control: private, max-age=31536000, immutable
#         NOT `no-store` — that would mean the Task 8 middleware fix did not take.

curl -s -X POST "localhost:$PORT/api/chat/session/$SID/completions" \
  -H 'Content-Type: application/json' \
  -d '{"message":"what is in this image?","attachmentFileNames":["shot.png"]}'
# Expect: 202. Then open the session in the UI and read the reply.

ls "$HOME/.omni-craft/sessions/$SID/scratch/attachments/"
# Expect: shot.png

python3 -c "print('base64 in snapshot:', 'iVBOR' in open('$HOME/.omni-craft/sessions/$SID/snapshot.json').read())"
# Expect: False
```

Also check the negative paths:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  "localhost:$PORT/api/chat/session/$SID/attachments?name=notes.txt" \
  --data-binary 'plain text, no magic bytes'
# Expect: 400

curl -s -o /dev/null -w '%{http_code}\n' \
  "localhost:$PORT/api/chat/session/$SID/attachments/..%2Fsnapshot.json"
# Expect: 404 — never 200, and never the snapshot's contents.
```

The model's reply describing the image is the only proof the bytes reached the provider. Quote it in the PR description.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/attachments
git commit -m "test(agent-core): cover the attachment round trip end to end"
```

---

## Self-review notes

Checked against the spec after writing:

- **Spec coverage.** Every spec section maps to a task — storage layout → 2; types → 1, 3; resolution seam → 4; provider adapters → 3; HTTP API → 8, 10; upload pipeline → 2; path safety → 2, 10; agent plumbing → 6; compaction → 7; token estimation → 5; the two-caps section → 2 (constants) and 7 (sizes in the model-facing list); testing strategy → every task plus 11.
- **One spec correction was made while planning.** The spec put `llmAttachmentSchema` in `agent-core/llm-api/types.ts`, but `packages/sse-events` cannot import from `apps/backend`. It moved to `@omnicraft/tool-schemas` — which `sse-events` already depends on, and where #372 put the media-type enums for exactly this reason — and `packages/api-schema` gains that dependency. The spec has been updated to match.
- **Type consistency.** `LlmAttachment` (`{fileName, mediaType, byteSize}`) is used unchanged from Task 1 through Task 11. `ResolvedLlmAttachment` adds only `data: string | null`. `SaveAttachmentResult` / `OpenedAttachment` keep the shapes declared in Task 2 through the service and router layers. Every `agentAttachmentStore` method takes `scratchDirectory` first.
- **Duplication removed after a design challenge.** The plan originally mandated copying the attachment service and the three route handlers into the coding module, justified by the existing `*-agent-session-service.ts` pair. That analogy was wrong: those two differ in real logic (coding validates a workspace), whereas the attachment paths differ only in which store resolves the id. The operations now live on `Agent` — which already owns the scratch directory and, per Task 4, already reads attachments for the LLM — with one shared service factory and one shared route registrar. The two thin bindings stay separate on purpose: they are the access boundary that stops a coding session id from reaching a chat session's attachments.
- **No silent caps.** The 5 MB / 10 MB limits surface to the client as `413` with a reason, and to the model as a size in the compaction file list.
