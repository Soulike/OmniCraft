# Tool-Result Media Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let tools (MCP and built-in) return image/PDF content that is delivered to the LLM, via a neutral `ToolResultBlock[]` representation, with `read_file` able to load local images/PDFs.

**Architecture:** Replace the `string` tool-result content with an ordered `ToolResultBlock[]` (`text | image | document`) threaded bottom-up through adapters → LLM session → executor → tool contract → MCP bridge → `read_file`. Media is inline base64, guarded at 1 MB. Text-only consumers use a `toolResultBlocksToText()` projection. The SSE event stays text-only (media rendering is deferred to #371).

**Tech Stack:** TypeScript (Node.js, ESM/nodenext), Zod, Vitest, `@anthropic-ai/sdk`, `openai`, `file-type`, PNPM monorepo.

**Spec:** `docs/superpowers/specs/2026-07-23-tool-result-media-design.md`

## Global Constraints

Every task implicitly includes these (copied from the spec + `CLAUDE.md` files):

- Package manager is **PNPM**. Install deps with `pnpm add <pkg>` — never hand-write a version in `package.json`.
- **No `any`** — use `unknown` + Zod/type-guard narrowing. **No non-null assertions (`!`)** — narrow with `assert`/branches.
- **Early-return** style for `if`.
- Backend: relative imports use `.js` extension; cross-module imports use the `@/*` alias; **no default exports**; **no `console`** (use `logger` from `@/logger.js`, or `ctx.log` in requests).
- Frontend: named exports only; CSS Modules (no Tailwind in our components); HeroUI tokens only.
- Node.js runtime APIs only (`node:fs/promises`, `node:path`, …).
- `MAX_INLINE_MEDIA_BYTES = 1 * 1024 * 1024` (decoded bytes) — defined once, referenced everywhere (including tool descriptions via interpolation).
- Media types: image ∈ `{image/png, image/jpeg, image/gif, image/webp}`; document = `application/pdf` only.
- **Base64 lives only in `content` (→ LLM), never in `data` (→ frontend).**
- Audio is never a media block — always a placeholder text block. Only MCP tools can emit audio.
- Commit messages follow Conventional Commits.

Test/typecheck commands:

- tool-schemas: `pnpm --filter @omnicraft/tool-schemas test` / `... typecheck`
- backend: `pnpm --filter @omnicraft/backend test` / `... typecheck`
- frontend: `pnpm --filter @omnicraft/frontend test` / `... typecheck`
- single file: `pnpm --filter @omnicraft/backend exec vitest run <path>`

---

### Task 1: Neutral media-type enums, `ToolResultBlock`, and text projection

**Files:**

- Create: `packages/tool-schemas/src/media-type-schemas.ts`
- Modify: `packages/tool-schemas/src/index.ts` (export the new schemas/types)
- Create: `apps/backend/src/agent-core/llm-api/tool-result-block.ts`
- Test: `packages/tool-schemas/src/media-type-schemas.test.ts`
- Test: `apps/backend/src/agent-core/llm-api/tool-result-block.test.ts`

**Interfaces:**

- Produces (`@omnicraft/tool-schemas`): `imageMediaTypeSchema` (`z.ZodEnum`), `documentMediaTypeSchema` (`z.ZodLiteral<'application/pdf'>`), types `ImageMediaType`, `DocumentMediaType`.
- Produces (`agent-core/llm-api/tool-result-block.ts`): `toolResultBlockSchema` (`z.ZodDiscriminatedUnion`), `type ToolResultBlock`, `toolResultBlocksToText(blocks: readonly ToolResultBlock[]): string`.

- [ ] **Step 1: Write the failing test for the media-type enums**

Create `packages/tool-schemas/src/media-type-schemas.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from './media-type-schemas.js';

describe('media-type-schemas', () => {
  it('accepts the four supported image types', () => {
    for (const t of ['image/png', 'image/jpeg', 'image/gif', 'image/webp']) {
      expect(imageMediaTypeSchema.safeParse(t).success).toBe(true);
    }
  });

  it('rejects unsupported image types', () => {
    expect(imageMediaTypeSchema.safeParse('image/svg+xml').success).toBe(false);
    expect(imageMediaTypeSchema.safeParse('image/tiff').success).toBe(false);
  });

  it('accepts only application/pdf as a document', () => {
    expect(documentMediaTypeSchema.safeParse('application/pdf').success).toBe(
      true,
    );
    expect(documentMediaTypeSchema.safeParse('text/plain').success).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/tool-schemas exec vitest run src/media-type-schemas.test.ts`
Expected: FAIL — cannot resolve `./media-type-schemas.js`.

- [ ] **Step 3: Create the enums**

Create `packages/tool-schemas/src/media-type-schemas.ts`:

```ts
import {z} from 'zod';

/**
 * Image MIME types deliverable to both providers. This is the binding-constraint
 * set (Anthropic's Base64ImageSource union); OpenAI takes a data URL so it does not
 * constrain further. Deliberately NOT a bare string and NOT a general MIME package.
 */
export const imageMediaTypeSchema = z.enum([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
]);
export type ImageMediaType = z.infer<typeof imageMediaTypeSchema>;

/** The only document type deliverable to both providers. */
export const documentMediaTypeSchema = z.literal('application/pdf');
export type DocumentMediaType = z.infer<typeof documentMediaTypeSchema>;
```

- [ ] **Step 4: Export from the package index**

In `packages/tool-schemas/src/index.ts`, add:

```ts
export {
  documentMediaTypeSchema,
  type DocumentMediaType,
  imageMediaTypeSchema,
  type ImageMediaType,
} from './media-type-schemas.js';
```

- [ ] **Step 5: Run the enum test to verify it passes**

Run: `pnpm --filter @omnicraft/tool-schemas exec vitest run src/media-type-schemas.test.ts`
Expected: PASS.

- [ ] **Step 6: Write the failing test for the block schema + projection**

Create `apps/backend/src/agent-core/llm-api/tool-result-block.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {
  toolResultBlockSchema,
  toolResultBlocksToText,
} from './tool-result-block.js';

describe('toolResultBlockSchema', () => {
  it('accepts a text block', () => {
    expect(
      toolResultBlockSchema.safeParse({type: 'text', text: 'hi'}).success,
    ).toBe(true);
  });

  it('accepts an image block with a supported type', () => {
    const r = toolResultBlockSchema.safeParse({
      type: 'image',
      mediaType: 'image/png',
      data: 'AAAA',
    });
    expect(r.success).toBe(true);
  });

  it('rejects an image block with an unsupported type', () => {
    const r = toolResultBlockSchema.safeParse({
      type: 'image',
      mediaType: 'image/svg+xml',
      data: 'AAAA',
    });
    expect(r.success).toBe(false);
  });

  it('accepts a document block (pdf only, optional name)', () => {
    expect(
      toolResultBlockSchema.safeParse({
        type: 'document',
        mediaType: 'application/pdf',
        data: 'AAAA',
        name: 'a.pdf',
      }).success,
    ).toBe(true);
    expect(
      toolResultBlockSchema.safeParse({
        type: 'document',
        mediaType: 'text/plain',
        data: 'AAAA',
      }).success,
    ).toBe(false);
  });
});

describe('toolResultBlocksToText', () => {
  it('passes text through and renders media as placeholders', () => {
    const text = toolResultBlocksToText([
      {type: 'text', text: 'before'},
      {type: 'image', mediaType: 'image/png', data: 'AAAA'},
      {
        type: 'document',
        mediaType: 'application/pdf',
        data: 'AAAA',
        name: 'report.pdf',
      },
    ]);
    expect(text).toBe(
      'before\n[image: image/png]\n[document: report.pdf (application/pdf)]',
    );
  });
});
```

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/llm-api/tool-result-block.test.ts`
Expected: FAIL — cannot resolve `./tool-result-block.js`.

- [ ] **Step 8: Create the block schema + projection**

Create `apps/backend/src/agent-core/llm-api/tool-result-block.ts`:

```ts
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';
import {z} from 'zod';

/**
 * A single block of tool-result content. `data` is base64. The neutral shape both
 * provider adapters map onto their native tool-result content arrays.
 */
export const toolResultBlockSchema = z.discriminatedUnion('type', [
  z.object({type: z.literal('text'), text: z.string()}),
  z.object({
    type: z.literal('image'),
    mediaType: imageMediaTypeSchema,
    data: z.string(),
  }),
  z.object({
    type: z.literal('document'),
    mediaType: documentMediaTypeSchema,
    data: z.string(),
    name: z.string().optional(),
  }),
]);

export type ToolResultBlock = z.infer<typeof toolResultBlockSchema>;

/**
 * Projects blocks to a plain-text representation for text-only consumers
 * (compaction, the SSE `result` string, `compactResult` hooks). Media blocks
 * render as placeholders, matching the pre-media `renderContentText` output.
 */
export function toolResultBlocksToText(
  blocks: readonly ToolResultBlock[],
): string {
  return blocks
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.text;
        case 'image':
          return `[image: ${block.mediaType}]`;
        case 'document':
          return `[document: ${block.name ?? 'file'} (${block.mediaType})]`;
      }
    })
    .join('\n');
}
```

- [ ] **Step 9: Run both test files to verify they pass**

Run: `pnpm --filter @omnicraft/tool-schemas exec vitest run src/media-type-schemas.test.ts && pnpm --filter @omnicraft/backend exec vitest run src/agent-core/llm-api/tool-result-block.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add packages/tool-schemas/src/media-type-schemas.ts packages/tool-schemas/src/media-type-schemas.test.ts packages/tool-schemas/src/index.ts apps/backend/src/agent-core/llm-api/tool-result-block.ts apps/backend/src/agent-core/llm-api/tool-result-block.test.ts
git commit -m "feat(agent-core): add neutral tool-result media block type and media-type enums"
```

---

### Task 2: Size guard (`guardMedia`) + buffer temp-file helper

**Files:**

- Modify: `apps/backend/src/helpers/fs.ts` (add `writeBufferToTempFile`)
- Create: `apps/backend/src/agent-core/tool/media-guard.ts`
- Test: `apps/backend/src/agent-core/tool/media-guard.test.ts`

**Interfaces:**

- Produces (`helpers/fs.ts`): `writeBufferToTempFile(content: Buffer, extension: string, dir?: string): Promise<string>`.
- Produces (`media-guard.ts`): `MAX_INLINE_MEDIA_BYTES: number`; `guardMedia(input: {data: string; mediaType: ImageMediaType | DocumentMediaType; name?: string; scratchDirectory: string}): Promise<ToolResultBlock>`.
- Consumes: `ToolResultBlock` (Task 1); `ImageMediaType`/`DocumentMediaType` (Task 1).

- [ ] **Step 1: Add the buffer temp-file helper (no separate test — exercised via `guardMedia`)**

In `apps/backend/src/helpers/fs.ts`, add below `writeToTempFile`:

```ts
/** Writes binary content to a temporary file and returns the absolute path. */
export async function writeBufferToTempFile(
  content: Buffer,
  extension: string,
  dir: string = os.tmpdir(),
): Promise<string> {
  const filePath = path.join(dir, `${crypto.randomUUID()}${extension}`);
  await fs.writeFile(filePath, content);
  return filePath;
}
```

- [ ] **Step 2: Write the failing test for `guardMedia`**

Create `apps/backend/src/agent-core/tool/media-guard.test.ts`:

```ts
import {readFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {mkdtempSync} from 'node:fs';
import {afterAll, describe, expect, it} from 'vitest';

import {guardMedia, MAX_INLINE_MEDIA_BYTES} from './media-guard.js';

const scratch = mkdtempSync(path.join(os.tmpdir(), 'media-guard-'));

describe('guardMedia', () => {
  it('inlines media under the cap as a media block', async () => {
    const data = Buffer.from('small png bytes').toString('base64');
    const block = await guardMedia({
      data,
      mediaType: 'image/png',
      scratchDirectory: scratch,
    });
    expect(block).toEqual({type: 'image', mediaType: 'image/png', data});
  });

  it('spills oversize media to a scratch file and returns a text block with the path', async () => {
    const big = Buffer.alloc(MAX_INLINE_MEDIA_BYTES + 1, 1);
    const data = big.toString('base64');
    const block = await guardMedia({
      data,
      mediaType: 'image/png',
      name: 'huge.png',
      scratchDirectory: scratch,
    });
    expect(block.type).toBe('text');
    if (block.type !== 'text') throw new Error('expected text block');
    expect(block.text).toContain('too large');
    const match = /saved to (.+)]/.exec(block.text);
    expect(match).not.toBeNull();
    if (match) {
      const spilled = await readFile(match[1]);
      expect(spilled.equals(big)).toBe(true);
    }
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/tool/media-guard.test.ts`
Expected: FAIL — cannot resolve `./media-guard.js`.

- [ ] **Step 4: Implement `guardMedia`**

Create `apps/backend/src/agent-core/tool/media-guard.ts`:

```ts
import type {DocumentMediaType, ImageMediaType} from '@omnicraft/tool-schemas';

import {writeBufferToTempFile} from '@/helpers/fs.js';

import type {ToolResultBlock} from '../llm-api/tool-result-block.js';

/** Max decoded media bytes inlined into a tool result (persisted + re-sent each turn). */
export const MAX_INLINE_MEDIA_BYTES = 1 * 1024 * 1024;

const MEDIA_TYPE_EXTENSION: Record<ImageMediaType | DocumentMediaType, string> =
  {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'application/pdf': '.pdf',
  };

interface GuardMediaInput {
  /** Base64-encoded media bytes. */
  readonly data: string;
  readonly mediaType: ImageMediaType | DocumentMediaType;
  readonly name?: string;
  /** Directory oversize media spills to. */
  readonly scratchDirectory: string;
}

/**
 * Returns an inline media block when the decoded bytes are within the cap, or spills
 * to a scratch file and returns a text block with the path when oversize.
 */
export async function guardMedia(
  input: GuardMediaInput,
): Promise<ToolResultBlock> {
  const buffer = Buffer.from(input.data, 'base64');
  const isImage = input.mediaType.startsWith('image/');

  if (buffer.length <= MAX_INLINE_MEDIA_BYTES) {
    if (isImage) {
      return {
        type: 'image',
        mediaType: input.mediaType as ImageMediaType,
        data: input.data,
      };
    }
    return {
      type: 'document',
      mediaType: input.mediaType as DocumentMediaType,
      data: input.data,
      ...(input.name === undefined ? {} : {name: input.name}),
    };
  }

  const spilledPath = await writeBufferToTempFile(
    buffer,
    MEDIA_TYPE_EXTENSION[input.mediaType],
    input.scratchDirectory,
  );
  const label = isImage ? 'image' : 'document';
  const sizeMb = (buffer.length / 1024 / 1024).toFixed(1);
  return {
    type: 'text',
    text: `[${label} too large (${sizeMb} MB), saved to ${spilledPath}]`,
  };
}
```

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/tool/media-guard.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/helpers/fs.ts apps/backend/src/agent-core/tool/media-guard.ts apps/backend/src/agent-core/tool/media-guard.test.ts
git commit -m "feat(agent-core): add media size guard with scratch-file spill"
```

---

### Task 3: Provider block-mapping functions (pure, not yet wired)

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/claude/helpers.ts` (add `toClaudeToolResultContent` + image media-type assertion)
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts` (add `toOpenAIToolResultOutput`)
- Test: `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts` (exists — add cases)
- Test: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts`

**Interfaces:**

- Produces: `toClaudeToolResultContent(blocks: readonly ToolResultBlock[]): Anthropic.ToolResultBlockParam['content']`
- Produces: `toOpenAIToolResultOutput(blocks: readonly ToolResultBlock[]): string | OpenAI.Responses.ResponseFunctionCallOutputItemList`
- Consumes: `ToolResultBlock`, `toolResultBlocksToText` (Task 1).

- [ ] **Step 1: Write the failing Claude mapping test**

Add to `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts`:

```ts
import {toClaudeToolResultContent} from './helpers.js';

describe('toClaudeToolResultContent', () => {
  it('maps text/image/document blocks to Anthropic content', () => {
    const content = toClaudeToolResultContent([
      {type: 'text', text: 'hello'},
      {type: 'image', mediaType: 'image/png', data: 'AAAA'},
      {
        type: 'document',
        mediaType: 'application/pdf',
        data: 'BBBB',
        name: 'r.pdf',
      },
    ]);
    expect(content).toEqual([
      {type: 'text', text: 'hello'},
      {
        type: 'image',
        source: {type: 'base64', media_type: 'image/png', data: 'AAAA'},
      },
      {
        type: 'document',
        source: {type: 'base64', media_type: 'application/pdf', data: 'BBBB'},
        title: 'r.pdf',
      },
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/llm-api/claude/helpers.test.ts`
Expected: FAIL — `toClaudeToolResultContent` is not exported.

- [ ] **Step 3: Implement `toClaudeToolResultContent` + the assertion**

In `apps/backend/src/agent-core/llm-api/claude/helpers.ts`:

Add to the imports:

```ts
import type {ImageMediaType} from '@omnicraft/tool-schemas';

import type {ToolResultBlock} from '../tool-result-block.js';
```

Add after the existing `_Check*` assertions (line ~18):

```ts
// Compile-time check: our image media types stay a subset of what the SDK accepts.
// If the SDK narrows the set, this alias fails to compile.
type AssertAssignable<T extends U, U> = T;
type _CheckImageMediaType = AssertAssignable<
  ImageMediaType,
  Anthropic.Base64ImageSource['media_type']
>;
```

Add the mapping function (near `toSdkMessage`):

```ts
/** Maps neutral tool-result blocks to Anthropic tool_result content. */
export function toClaudeToolResultContent(
  blocks: readonly ToolResultBlock[],
): Anthropic.ToolResultBlockParam['content'] {
  return blocks.map((block) => {
    switch (block.type) {
      case 'text':
        return {type: 'text', text: block.text};
      case 'image':
        return {
          type: 'image',
          source: {
            type: 'base64',
            media_type: block.mediaType,
            data: block.data,
          },
        };
      case 'document':
        return {
          type: 'document',
          source: {
            type: 'base64',
            media_type: block.mediaType,
            data: block.data,
          },
          ...(block.name === undefined ? {} : {title: block.name}),
        };
    }
  });
}
```

- [ ] **Step 4: Run to verify the Claude test passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/llm-api/claude/helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Write the failing OpenAI mapping test**

Create/extend `apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {toOpenAIToolResultOutput} from './helpers.js';

describe('toOpenAIToolResultOutput', () => {
  it('returns a plain string when all blocks are text', () => {
    expect(
      toOpenAIToolResultOutput([
        {type: 'text', text: 'a'},
        {type: 'text', text: 'b'},
      ]),
    ).toBe('a\nb');
  });

  it('returns a content-item array when media is present', () => {
    expect(
      toOpenAIToolResultOutput([
        {type: 'text', text: 'see:'},
        {type: 'image', mediaType: 'image/png', data: 'AAAA'},
        {
          type: 'document',
          mediaType: 'application/pdf',
          data: 'BBBB',
          name: 'r.pdf',
        },
      ]),
    ).toEqual([
      {type: 'input_text', text: 'see:'},
      {
        type: 'input_image',
        detail: 'auto',
        image_url: 'data:image/png;base64,AAAA',
      },
      {
        type: 'input_file',
        file_data: 'data:application/pdf;base64,BBBB',
        filename: 'r.pdf',
      },
    ]);
  });
});
```

- [ ] **Step 6: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/llm-api/openai-responses/helpers.test.ts`
Expected: FAIL — `toOpenAIToolResultOutput` is not exported.

- [ ] **Step 7: Implement `toOpenAIToolResultOutput`**

In `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts`:

Add imports:

```ts
import type {ToolResultBlock} from '../tool-result-block.js';
import {toolResultBlocksToText} from '../tool-result-block.js';
```

Add the function:

```ts
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
        return {
          type: 'input_file',
          file_data: `data:${block.mediaType};base64,${block.data}`,
          ...(block.name === undefined ? {} : {filename: block.name}),
        };
    }
  });
}
```

> **Runtime note:** `image_url` as a data URL is confirmed correct. `file_data`'s exact
> format (data URL vs raw base64) is not certain from the SDK types — if OpenAI PDF
> delivery fails at runtime (Task 6 / final verification), switch `file_data` to raw
> `block.data`. Images are unaffected.

- [ ] **Step 8: Run to verify the OpenAI test passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/llm-api/openai-responses/helpers.test.ts`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/claude/helpers.ts apps/backend/src/agent-core/llm-api/claude/helpers.test.ts apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts
git commit -m "feat(agent-core): add provider block-mapping functions for tool-result media"
```

---

### Task 4: Switch tool-result content to `ToolResultBlock[]` (atomic, text-only behavior preserved)

This is one atomic type change: it breaks every built-in tool and every consumer at once, then fixes them. The TypeScript compiler is the checklist — after the type change, `typecheck` lists every site to convert. Behavior stays text-only (no new media yet); all existing tests must pass with mechanical updates.

**Files (modify):**

- `apps/backend/src/agent-core/tool/types.ts` — `ToolExecuteSuccessResult.content`, `ToolExecuteFailureResult.content` → `ToolResultBlock[]`
- `apps/backend/src/agent-core/llm-api/types.ts` — `llmToolResultMessageSchema.content` → `z.array(toolResultBlockSchema)`
- `apps/backend/src/agent-core/llm-session/types.ts` — `ToolResult.content` → `ToolResultBlock[]`
- `apps/backend/src/agent-core/llm-session/llm-session.ts` — `submitToolResults`
- `apps/backend/src/agent-core/agent/agent-tool-executor.ts` — `ExecuteAgentToolResult.content`, `catch` block
- `apps/backend/src/agent-core/agent/agent-turn-runner.ts` — unknown-tool result, SSE `result` projection, `toolResults` map
- `apps/backend/src/agent-core/llm-api/claude/helpers.ts` — wire `toClaudeToolResultContent` into `toSdkMessage`
- `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts` — wire `toOpenAIToolResultOutput` into `toInputItems`
- `apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.ts` — project blocks to text (media→placeholder)
- Every built-in tool under `apps/backend/src/agent/tools/**` that returns `ToolExecuteResult` (file/, web/, core/, sub-agent/, todo/, client/, load-skill) — wrap string content in a text block
- All affected `*.test.ts` for the above

**Interfaces:**

- Consumes: `ToolResultBlock`, `toolResultBlocksToText` (Task 1); `toClaudeToolResultContent` (Task 3); `toOpenAIToolResultOutput` (Task 3).
- Produces: `ToolResult.content: ToolResultBlock[]`, `ExecuteAgentToolResult.content: ToolResultBlock[]`, `ToolExecute{Success,Failure}Result.content: ToolResultBlock[]`, persisted `LlmToolResultMessage.content: ToolResultBlock[]`.

**The mechanical rule for tool returns:** every `ToolExecuteResult` return of the form `content: <stringExpr>` becomes `content: [{type: 'text', text: <stringExpr>}]`. `data` and `status` are unchanged. Tests asserting `result.content === '<s>'` become `result.content` deep-equal `[{type: 'text', text: '<s>'}]` (or assert `result.content[0]` is `{type:'text', text: '<s>'}`).

- [ ] **Step 1: Change the tool-result contract types**

In `apps/backend/src/agent-core/tool/types.ts`:

Add import:

```ts
import type {ToolResultBlock} from '../llm-api/tool-result-block.js';
```

Change the two result interfaces (`content` only):

```ts
export interface ToolExecuteSuccessResult<T> {
  readonly data: T;
  readonly content: ToolResultBlock[];
  readonly status: 'success';
}

export interface ToolExecuteFailureResult {
  readonly data: ToolFailureData;
  readonly content: ToolResultBlock[];
  readonly status: 'failure';
}
```

Leave `ToolCompactResultInput.content` as `string` (it receives the text projection).

- [ ] **Step 2: Change the persisted message + session types**

In `apps/backend/src/agent-core/llm-api/types.ts`:

Add import and override `content` on the tool-result schema:

```ts
import {toolResultBlockSchema} from './tool-result-block.js';
```

```ts
export const llmToolResultMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('tool'),
  callId: z.string(),
  status: z.enum(['success', 'failure']),
  content: z.array(toolResultBlockSchema),
});
```

In `apps/backend/src/agent-core/llm-session/types.ts`, change `ToolResult`:

```ts
import type {ToolResultBlock} from '../llm-api/tool-result-block.js';

export interface ToolResult {
  callId: string;
  content: ToolResultBlock[];
  status: 'success' | 'failure';
}
```

- [ ] **Step 3: Wire the adapters (tool case)**

In `claude/helpers.ts` `toSdkMessage`, tool case:

```ts
case 'tool':
  return {
    role: 'user',
    content: [
      {
        type: 'tool_result',
        tool_use_id: message.callId,
        content: toClaudeToolResultContent(message.content),
      },
    ],
  };
```

In `openai-responses/helpers.ts` `toInputItems`, tool case:

```ts
case 'tool':
  items.push({
    type: 'function_call_output',
    call_id: message.callId,
    output: toOpenAIToolResultOutput(message.content),
  });
  break;
```

- [ ] **Step 4: Update the executor**

In `apps/backend/src/agent-core/agent/agent-tool-executor.ts`:

- Add `import type {ToolResultBlock} from '../llm-api/tool-result-block.js';`
- Change `ExecuteAgentToolResult.content` to `ToolResultBlock[]`.
- Change the `catch` return:

```ts
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{type: 'text', text: `Error: ${message}`}],
    status: 'error',
    data: {message},
  };
}
```

- [ ] **Step 5: Update the turn runner**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`:

- Add `import {toolResultBlocksToText} from '../llm-api/tool-result-block.js';`
- Unknown-tool result (~line 222):

```ts
toolResults.set(toolCall.callId, {
  callId: toolCall.callId,
  content: [{type: 'text', text: `Error: Unknown tool: ${toolCall.toolName}`}],
  status: 'failure',
});
```

- The `tool-execute-end` SSE event (~line 253) projects to text for the FE:

```ts
toolSseEventChannel.push({
  type: 'tool-execute-end',
  callId: toolCall.callId,
  result: toolResultBlocksToText(result.content),
  status: result.status,
  data: result.data,
} satisfies SseToolExecuteEndEvent);
```

- The `toolResults.set` after execution (~line 268) stores `content: result.content` (already blocks — no change beyond the type flowing through).

- [ ] **Step 6: Update the compaction slimmer**

In `apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.ts`:

- Add `import {toolResultBlocksToText} from '../../llm-api/tool-result-block.js';`
- Replace the `message.role === 'tool'` branch body:

```ts
if (message.role === 'tool') {
  const toolCall = toolCallsById.get(message.callId);
  const tool = toolCall ? toolsByName.get(toolCall.toolName) : undefined;
  // Project blocks to text (media → placeholder) before any compaction work.
  const projected = toolResultBlocksToText(message.content);
  const content = toolCall
    ? tool?.compactResult?.({
        content: projected,
        status: message.status,
        toolCall,
        message,
      })
    : undefined;

  if (content === null) continue;

  result.push(
    JSON.stringify({
      role: 'tool',
      callId: message.callId,
      status: message.status,
      content:
        content === undefined
          ? truncateForCompaction(projected, truncation)
          : truncateForCompaction(content, truncation),
    }),
  );
  continue;
}
```

- [ ] **Step 7: Run typecheck to enumerate every remaining site**

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: FAIL, with errors on every built-in tool return and test that still uses `content: <string>` / asserts a string. This list is your checklist.

- [ ] **Step 8: Apply the mechanical rule to every built-in tool**

For each error site in a tool's `execute` (files under `apps/backend/src/agent/tools/**`), wrap the string in a text block. Examples covering each shape:

Error return (e.g. `read-file.ts:74-78`):

```ts
return {
  data: {message: `File not found: ${args.filePath}`},
  content: [{type: 'text', text: `Error: File not found: ${args.filePath}`}],
  status: 'failure',
};
```

Success-with-data return (e.g. `read-file.ts:191`):

```ts
return {
  data,
  content: [{type: 'text', text: `${header}\n${formatted}`}],
  status: 'success',
};
```

Simple success (e.g. `core/get-current-time.ts:29`):

```ts
return {data: {iso}, content: [{type: 'text', text: iso}], status: 'success'};
```

Apply the same wrap to every site reported by `typecheck`, including `sub-agent/*`, `web/*`, `file/*`, `todo/*`, `load-skill`, and any client tool.

- [ ] **Step 9: Update affected tests**

For each failing test, change assertions on `result.content` from string equality to block equality. Example:

```ts
// before: expect(result.content).toBe('Error: File not found: missing.txt');
expect(result.content).toEqual([
  {type: 'text', text: 'Error: File not found: missing.txt'},
]);
```

Where a test builds an `LlmToolResultMessage` / `ToolResult` fixture with `content: '<s>'`, change to `content: [{type: 'text', text: '<s>'}]`.

- [ ] **Step 10: Typecheck until clean**

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: PASS (0 errors). Repeat Steps 8–9 for any remaining site.

- [ ] **Step 11: Run the full backend test suite**

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS. Fix any test whose fixture/assertion still assumes string content.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src
git commit -m "refactor(agent-core)!: represent tool-result content as ToolResultBlock[]"
```

---

### Task 5: MCP bridge emits media blocks

**Files:**

- Modify: `apps/backend/src/agent/tools/mcp/mcp-tool-registry.ts`
- Test: `apps/backend/src/agent/tools/mcp/mcp-tool-registry.test.ts` (add media cases; create if absent)

**Interfaces:**

- Consumes: `guardMedia`, `MAX_INLINE_MEDIA_BYTES` (Task 2); `ToolResultBlock`, `toolResultBlocksToText` (Task 1); `imageMediaTypeSchema`, `documentMediaTypeSchema` (Task 1).
- Produces: MCP tool `execute` returns `content: ToolResultBlock[]`, `data: {server, toolName, text}`.

- [ ] **Step 1: Write the failing test**

In `apps/backend/src/agent/tools/mcp/mcp-tool-registry.test.ts`, add a helper that invokes `buildMcpToolResultBlocks` (exported for testing) and assert:

```ts
import {buildMcpToolResultBlocks} from './mcp-tool-registry.js';

describe('buildMcpToolResultBlocks', () => {
  const scratch = '/tmp'; // small media stays inline; no spill exercised here

  it('passes text and a supported image through as blocks', async () => {
    const blocks = await buildMcpToolResultBlocks(
      [
        {type: 'text', text: 'result'},
        {type: 'image', data: 'AAAA', mimeType: 'image/png'},
      ],
      scratch,
    );
    expect(blocks).toEqual([
      {type: 'text', text: 'result'},
      {type: 'image', mediaType: 'image/png', data: 'AAAA'},
    ]);
  });

  it('renders audio as an unsupported placeholder', async () => {
    const blocks = await buildMcpToolResultBlocks(
      [{type: 'audio', data: 'AAAA', mimeType: 'audio/wav'}],
      scratch,
    );
    expect(blocks).toEqual([
      {
        type: 'text',
        text: '[unsupported audio content (audio/wav): not delivered to the model]',
      },
    ]);
  });

  it('renders an unsupported image type as a placeholder', async () => {
    const blocks = await buildMcpToolResultBlocks(
      [{type: 'image', data: 'AAAA', mimeType: 'image/tiff'}],
      scratch,
    );
    expect(blocks).toEqual([
      {type: 'text', text: '[unsupported image type: image/tiff]'},
    ]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/tools/mcp/mcp-tool-registry.test.ts`
Expected: FAIL — `buildMcpToolResultBlocks` is not exported.

- [ ] **Step 3: Replace `renderContentText` with the block builder**

In `apps/backend/src/agent/tools/mcp/mcp-tool-registry.ts`:

Add imports:

```ts
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';

import {guardMedia} from '@/agent-core/tool/media-guard.js';
import type {ToolResultBlock} from '@/agent-core/llm-api/tool-result-block.js';
import {toolResultBlocksToText} from '@/agent-core/llm-api/tool-result-block.js';
```

Replace `renderContentText` (lines 29–48) with:

```ts
/**
 * Builds neutral tool-result blocks from MCP content. Text and embedded-resource
 * text pass through; supported image/PDF media become media blocks (size-guarded);
 * audio and unsupported types become placeholder text blocks. Delivering audio is
 * intentionally unsupported (see https://github.com/Soulike/OmniCraft/issues/368).
 */
export async function buildMcpToolResultBlocks(
  content: CallToolResult['content'],
  scratchDirectory: string,
): Promise<ToolResultBlock[]> {
  const blocks: ToolResultBlock[] = [];
  for (const block of content) {
    switch (block.type) {
      case 'text':
        blocks.push({type: 'text', text: block.text});
        break;
      case 'image': {
        const parsed = imageMediaTypeSchema.safeParse(block.mimeType);
        if (parsed.success) {
          blocks.push(
            await guardMedia({
              data: block.data,
              mediaType: parsed.data,
              scratchDirectory,
            }),
          );
        } else {
          blocks.push({
            type: 'text',
            text: `[unsupported image type: ${block.mimeType}]`,
          });
        }
        break;
      }
      case 'audio':
        blocks.push({
          type: 'text',
          text: `[unsupported audio content (${block.mimeType}): not delivered to the model]`,
        });
        break;
      case 'resource':
        if (
          'text' in block.resource &&
          typeof block.resource.text === 'string'
        ) {
          blocks.push({type: 'text', text: block.resource.text});
        } else {
          blocks.push(
            await blobResourceBlock(block.resource, scratchDirectory),
          );
        }
        break;
      case 'resource_link':
        blocks.push({type: 'text', text: `[resource: ${block.uri}]`});
        break;
    }
  }
  return blocks;
}

async function blobResourceBlock(
  resource: {uri: string; mimeType?: string; blob?: string},
  scratchDirectory: string,
): Promise<ToolResultBlock> {
  const image = imageMediaTypeSchema.safeParse(resource.mimeType);
  const doc = documentMediaTypeSchema.safeParse(resource.mimeType);
  if (typeof resource.blob === 'string' && image.success) {
    return guardMedia({
      data: resource.blob,
      mediaType: image.data,
      scratchDirectory,
    });
  }
  if (typeof resource.blob === 'string' && doc.success) {
    return guardMedia({
      data: resource.blob,
      mediaType: doc.data,
      name: resource.uri,
      scratchDirectory,
    });
  }
  return {type: 'text', text: `[resource: ${resource.uri}]`};
}
```

- [ ] **Step 4: Update the `execute` closure to build blocks**

Replace the body from `let text = renderContentText(...)` through the returns (lines ~102–113) with:

```ts
const blocks = await buildMcpToolResultBlocks(
  result.content,
  context.scratchDirectory,
);
let text = toolResultBlocksToText(blocks);
// Output-schema tools can return structured-only results (empty content plus
// structuredContent); fall back to the serialized structured payload.
if (!text && result.structuredContent !== undefined) {
  text = JSON.stringify(result.structuredContent);
  blocks.push({type: 'text', text});
}
if (result.isError) {
  return {content: blocks, status: 'failure', data: {message: text}};
}
return {
  content: blocks,
  status: 'success',
  data: {server: serverName, toolName: tool.name, text},
};
```

- [ ] **Step 5: Run the MCP test to verify it passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/tools/mcp/mcp-tool-registry.test.ts`
Expected: PASS.

- [ ] **Step 6: Typecheck + full test**

Run: `pnpm --filter @omnicraft/backend typecheck && pnpm --filter @omnicraft/backend test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent/tools/mcp
git commit -m "feat(agent): deliver MCP image/document content to the LLM as media blocks"
```

---

### Task 6: `read_file` media loading (+ result schema + descriptions + FE chip)

**Files:**

- Add dep: `file-type` to `apps/backend` (`pnpm add file-type`)
- Modify: `packages/tool-schemas/src/result-schemas.ts` (`readFileResultSchema` → discriminated union)
- Modify: `packages/tool-schemas/src/parameter-schemas.ts` (`startLine`/`lineCount` descriptions)
- Modify: `apps/backend/src/agent/tools/file/read-file.ts` (media branch + description)
- Modify: `apps/frontend/src/modules/tool-ui/components/ResultSection/helpers/renderToolResult.tsx` (branch on `kind`)
- Create: `apps/frontend/src/modules/tool-ui/components/ReadFileMediaResult/{index.ts,ReadFileMediaResultView.tsx,styles.module.css}`
- Test: `apps/backend/src/agent/tools/file/read-file.test.ts`
- Test: `apps/frontend/src/modules/tool-ui/components/ReadFileMediaResult/ReadFileMediaResultView.test.tsx`

**Interfaces:**

- Consumes: `imageMediaTypeSchema`, `documentMediaTypeSchema` (Task 1); `MAX_INLINE_MEDIA_BYTES` (Task 2); `ToolResultBlock` (Task 1).
- Produces: `readFileResultSchema` discriminated union with a `text` variant (existing fields + `kind: 'text'`) and a media variant `{kind: 'image'|'document', filePath, mediaType, byteSize}`.

- [ ] **Step 1: Install `file-type`**

Run: `pnpm --filter @omnicraft/backend add file-type`
Expected: `file-type` added to `apps/backend/package.json` dependencies.

- [ ] **Step 2: Make `readFileResultSchema` a discriminated union**

In `packages/tool-schemas/src/result-schemas.ts`, add the import and replace `readFileResultSchema`:

```ts
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from './media-type-schemas.js';

export const readFileTextResultSchema = z.object({
  kind: z.literal('text'),
  filePath: z.string(),
  totalLines: z.number(),
  startLine: z.number(),
  endLine: z.number(),
  content: z.string(),
});

export const readFileMediaResultSchema = z.object({
  kind: z.enum(['image', 'document']),
  filePath: z.string(),
  mediaType: z.union([imageMediaTypeSchema, documentMediaTypeSchema]),
  byteSize: z.number(),
});

export const readFileResultSchema = z.discriminatedUnion('kind', [
  readFileTextResultSchema,
  readFileMediaResultSchema,
]);
```

(`registry.ts` references `readFileResultSchema` by value — no change needed there; it remains a valid Zod schema.)

- [ ] **Step 3: Update the line-range parameter descriptions**

In `packages/tool-schemas/src/parameter-schemas.ts`, append to both `startLine` and `lineCount` `.describe(...)` strings:

```
' Applies to text reads only; ignored when the file is an image or PDF.'
```

- [ ] **Step 4: Write the failing `read_file` media test**

In `apps/backend/src/agent/tools/file/read-file.test.ts`, add (write a tiny real PNG to a temp working dir):

```ts
it('returns an image file as an image block with a media result', async () => {
  // 1x1 transparent PNG
  const pngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  const png = Buffer.from(pngBase64, 'base64');
  // ... write `png` to `${workingDirectory}/pixel.png`, build context, then:
  const result = await readFileTool.execute({filePath: 'pixel.png'}, context);
  expect(result.status).toBe('success');
  expect(result.content).toEqual([
    {type: 'image', mediaType: 'image/png', data: pngBase64},
  ]);
  expect(result.data).toEqual({
    kind: 'image',
    filePath: 'pixel.png',
    mediaType: 'image/png',
    byteSize: png.length,
  });
});
```

(Follow the existing test file's helpers for building `workingDirectory` and `context`.)

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/tools/file/read-file.test.ts`
Expected: FAIL — binary file currently rejected; no media branch.

- [ ] **Step 6: Implement the media branch in `read-file.ts`**

Add imports:

```ts
import {fileTypeFromFile} from 'file-type';
import {
  documentMediaTypeSchema,
  imageMediaTypeSchema,
} from '@omnicraft/tool-schemas';

import {MAX_INLINE_MEDIA_BYTES} from '@/agent-core/tool/media-guard.js';
```

Replace the binary check (step 3, lines ~89–108) with type detection first, then the existing binary rejection for non-media binaries:

```ts
// 3. Detect media (image/PDF) via content sniffing; otherwise fall through.
let detected: {ext: string; mime: string} | undefined;
try {
  detected = await fileTypeFromFile(absolutePath);
} catch {
  detected = undefined;
}

const imageType = detected
  ? imageMediaTypeSchema.safeParse(detected.mime)
  : undefined;
const docType = detected
  ? documentMediaTypeSchema.safeParse(detected.mime)
  : undefined;

if (imageType?.success || docType?.success) {
  if (stat.size > MAX_INLINE_MEDIA_BYTES) {
    const limitMb = MAX_INLINE_MEDIA_BYTES / 1024 / 1024;
    const sizeMb = (stat.size / 1024 / 1024).toFixed(1);
    const message =
      `${args.filePath} is ${sizeMb} MB, over the ${limitMb} MB inline limit for media. ` +
      'Reduce it first with a shell command (for example, downsample/resize an image, ' +
      'or extract specific pages or text from a PDF) and read the smaller file.';
    return {
      data: {message},
      content: [{type: 'text', text: `Error: ${message}`}],
      status: 'failure',
    };
  }

  const base64 = (await fs.readFile(absolutePath)).toString('base64');
  context.fileStatTracker.set(absolutePath, stat.size, stat.mtimeMs);

  // Two narrowed branches so `mediaType` carries the exact literal type each block
  // requires (no re-parse, no non-null assertion).
  if (imageType?.success) {
    const mediaType = imageType.data;
    const data: ReadFileResult = {
      kind: 'image',
      filePath: args.filePath,
      mediaType,
      byteSize: stat.size,
    };
    return {
      data,
      content: [{type: 'image', mediaType, data: base64}],
      status: 'success',
    };
  }
  if (docType?.success) {
    const mediaType = docType.data;
    const data: ReadFileResult = {
      kind: 'document',
      filePath: args.filePath,
      mediaType,
      byteSize: stat.size,
    };
    return {
      data,
      content: [
        {
          type: 'document',
          mediaType,
          data: base64,
          name: path.basename(absolutePath),
        },
      ],
      status: 'success',
    };
  }
}

// Not media — reject other binaries (unchanged behavior).
try {
  if (await isBinaryFile(absolutePath)) {
    return {
      data: {
        message: `Binary file detected: ${args.filePath}. Only text files are supported.`,
      },
      content: [
        {
          type: 'text',
          text: `Error: Binary file detected: ${args.filePath}. Only text files are supported.`,
        },
      ],
      status: 'failure',
    };
  }
} catch {
  return {
    data: {message: `Unable to check if file is binary: ${args.filePath}`},
    content: [
      {
        type: 'text',
        text: `Error: Unable to check if file is binary: ${args.filePath}`,
      },
    ],
    status: 'failure',
  };
}
```

In the text success return (~line 183), add `kind: 'text'` to `data`:

```ts
const data: ReadFileResult = {
  kind: 'text',
  filePath: args.filePath,
  totalLines,
  startLine,
  endLine,
  content: selectedLines.join('\n'),
};
```

Update the tool `description` to interpolate the constants:

```ts
description:
  'Reads a file and returns its contents. ' +
  'Text files are returned with line numbers in chunks up to ' +
  `${MAX_RETURN_SIZE / 1024} KB per read (use startLine and lineCount to page through larger files). ` +
  'Images (PNG, JPEG, GIF, WEBP) and PDFs are returned to the model as media when under ' +
  `${MAX_INLINE_MEDIA_BYTES / 1024 / 1024} MB; larger media cannot be returned and must be reduced first ` +
  '(for example, downsample an image or extract pages or text from a PDF). ' +
  'Use this whenever you need to see the current content of a file or review a specific section of it.',
```

- [ ] **Step 7: Run the `read_file` test to verify it passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/tools/file/read-file.test.ts`
Expected: PASS. (Also update the existing binary-rejection test if it used a fixture that `file-type` now recognizes as media.)

- [ ] **Step 8: Add the frontend media chip component**

Create `apps/frontend/src/modules/tool-ui/components/ReadFileMediaResult/ReadFileMediaResultView.tsx`:

```tsx
import styles from './styles.module.css';

interface ReadFileMediaResultViewProps {
  filePath: string;
  mediaType: string;
  byteSize: number;
  kind: 'image' | 'document';
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function ReadFileMediaResultView({
  filePath,
  mediaType,
  byteSize,
  kind,
}: ReadFileMediaResultViewProps) {
  return (
    <div className={styles.chip}>
      <span aria-hidden='true'>{kind === 'image' ? '🖼' : '📄'}</span>
      <code className={styles.filePath}>{filePath}</code>
      <span className={styles.meta}>
        {mediaType} · {formatBytes(byteSize)}
      </span>
    </div>
  );
}
```

Create `apps/frontend/src/modules/tool-ui/components/ReadFileMediaResult/styles.module.css`:

```css
.chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-md);
  background: var(--surface);
}

.filePath {
  font-family: var(--font-mono, monospace);
}

.meta {
  color: var(--foreground-secondary, var(--foreground));
  opacity: 0.7;
}
```

Create `apps/frontend/src/modules/tool-ui/components/ReadFileMediaResult/index.ts`:

```ts
export {ReadFileMediaResultView} from './ReadFileMediaResultView.js';
```

- [ ] **Step 9: Branch `renderToolResult` on `kind` for `read_file`**

In `apps/frontend/src/modules/tool-ui/components/ResultSection/helpers/renderToolResult.tsx`:

- Add import: `import {ReadFileMediaResultView} from '../../ReadFileMediaResult/index.js';`
- Replace the `read_file` case:

```ts
case 'read_file': {
  const d = readFileResultSchema.parse(data);
  if (d.kind === 'text') {
    return (
      <ReadFileResult
        content={d.content}
        endLine={d.endLine}
        filePath={d.filePath}
        startLine={d.startLine}
        totalLines={d.totalLines}
      />
    );
  }
  return (
    <ReadFileMediaResultView
      byteSize={d.byteSize}
      filePath={d.filePath}
      kind={d.kind}
      mediaType={d.mediaType}
    />
  );
}
```

- [ ] **Step 10: Write + run the frontend chip test**

Create `apps/frontend/src/modules/tool-ui/components/ReadFileMediaResult/ReadFileMediaResultView.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {ReadFileMediaResultView} from './ReadFileMediaResultView.js';

describe('ReadFileMediaResultView', () => {
  it('renders the file path, media type, and size', () => {
    render(
      <ReadFileMediaResultView
        byteSize={245760}
        filePath='pixel.png'
        kind='image'
        mediaType='image/png'
      />,
    );
    expect(screen.getByText('pixel.png')).toBeInTheDocument();
    expect(screen.getByText(/image\/png/)).toBeInTheDocument();
    expect(screen.getByText(/240 KB/)).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/modules/tool-ui/components/ReadFileMediaResult/ReadFileMediaResultView.test.tsx`
Expected: PASS.

- [ ] **Step 11: Typecheck backend, tool-schemas, and frontend**

Run: `pnpm --filter @omnicraft/tool-schemas typecheck && pnpm --filter @omnicraft/backend typecheck && pnpm --filter @omnicraft/frontend typecheck`
Expected: PASS. (The frontend read_file text path still compiles because the `text` variant retains the original fields.)

- [ ] **Step 12: Full test suites**

Run: `pnpm --filter @omnicraft/tool-schemas test && pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/frontend test`
Expected: PASS.

- [ ] **Step 13: Commit**

```bash
git add apps/backend packages/tool-schemas apps/frontend
git commit -m "feat(agent): let read_file load images and PDFs as media"
```

---

### Task 7: One-time snapshot conversion script

Converts existing persisted sessions (tool-message `content: string`) to the new block shape so `agentSnapshotSchema.parse` accepts them.

**Files:**

- Create: `apps/backend/scripts/convert-tool-result-content.ts`
- Test: `apps/backend/scripts/convert-tool-result-content.test.ts`

**Interfaces:**

- Produces: `convertSnapshotJson(json: unknown): {changed: boolean; value: unknown}` (pure, tested) and a `main()` that walks the session roots.
- Consumes: `getDataDir` from `@/helpers/env.js`.

- [ ] **Step 1: Write the failing test for the pure transform**

Create `apps/backend/scripts/convert-tool-result-content.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {convertSnapshotJson} from './convert-tool-result-content.js';

describe('convertSnapshotJson', () => {
  it('wraps string tool-message content in a text block', () => {
    const {changed, value} = convertSnapshotJson({
      messages: [
        {role: 'user', content: 'hi'},
        {role: 'tool', callId: 'c1', status: 'success', content: 'done'},
      ],
    });
    expect(changed).toBe(true);
    expect((value as {messages: unknown[]}).messages[1]).toMatchObject({
      role: 'tool',
      content: [{type: 'text', text: 'done'}],
    });
  });

  it('is idempotent when content is already an array', () => {
    const input = {
      messages: [
        {
          role: 'tool',
          callId: 'c1',
          status: 'success',
          content: [{type: 'text', text: 'done'}],
        },
      ],
    };
    const {changed} = convertSnapshotJson(input);
    expect(changed).toBe(false);
  });

  it('leaves user/assistant messages untouched', () => {
    const {value} = convertSnapshotJson({
      messages: [
        {role: 'assistant', content: 'text', toolCalls: [], thinking: []},
      ],
    });
    expect((value as {messages: unknown[]}).messages[0]).toMatchObject({
      role: 'assistant',
      content: 'text',
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run scripts/convert-tool-result-content.test.ts`
Expected: FAIL — cannot resolve `./convert-tool-result-content.js`.

- [ ] **Step 3: Implement the script**

Create `apps/backend/scripts/convert-tool-result-content.ts`:

```ts
import {readdir, readFile, rename, writeFile} from 'node:fs/promises';
import crypto from 'node:crypto';
import path from 'node:path';

import {getDataDir} from '@/helpers/env.js';
import {logger} from '@/logger.js';

interface ConversionResult {
  changed: boolean;
  value: unknown;
}

/** Rewrites string tool-message content to a single text block. Pure + idempotent. */
export function convertSnapshotJson(json: unknown): ConversionResult {
  if (typeof json !== 'object' || json === null || !('messages' in json)) {
    return {changed: false, value: json};
  }
  const snapshot = json as {messages: unknown[]};
  if (!Array.isArray(snapshot.messages)) return {changed: false, value: json};

  let changed = false;
  const messages = snapshot.messages.map((message) => {
    if (
      typeof message === 'object' &&
      message !== null &&
      (message as {role?: unknown}).role === 'tool' &&
      typeof (message as {content?: unknown}).content === 'string'
    ) {
      changed = true;
      const m = message as {content: string};
      return {...message, content: [{type: 'text', text: m.content}]};
    }
    return message;
  });

  return changed
    ? {changed, value: {...snapshot, messages}}
    : {changed: false, value: json};
}

async function convertFile(filePath: string): Promise<boolean> {
  const raw = await readFile(filePath, 'utf-8');
  const {changed, value} = convertSnapshotJson(JSON.parse(raw));
  if (!changed) return false;
  const tmp = `${filePath}.${crypto.randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(value, null, 2) + '\n');
  await rename(tmp, filePath);
  return true;
}

async function convertRoot(root: string): Promise<number> {
  let count = 0;
  let entries;
  try {
    entries = await readdir(root, {withFileTypes: true});
  } catch {
    return 0;
  }
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const snapshot = path.join(root, entry.name, 'snapshot.json');
    try {
      if (await convertFile(snapshot)) count++;
    } catch (error: unknown) {
      logger.warn(
        {err: error, snapshot},
        'Skipping snapshot that could not be converted',
      );
    }
  }
  return count;
}

async function main(): Promise<void> {
  const dataDir = getDataDir();
  const roots = [
    path.join(dataDir, 'sessions'),
    path.join(dataDir, 'coding-sessions'),
  ];
  let total = 0;
  for (const root of roots) {
    total += await convertRoot(root);
  }
  logger.info({total}, 'Converted tool-result content in snapshots');
}

// Run when executed directly (tsx scripts/convert-tool-result-content.ts).
if (import.meta.url === `file://${process.argv[1]}`) {
  void main();
}
```

- [ ] **Step 4: Run to verify the test passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run scripts/convert-tool-result-content.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/scripts/convert-tool-result-content.ts apps/backend/scripts/convert-tool-result-content.test.ts
git commit -m "chore(backend): add one-time snapshot media-block conversion script"
```

- [ ] **Step 7: Run the migration against local data (manual, one-time)**

Run: `pnpm --filter @omnicraft/backend exec tsx scripts/convert-tool-result-content.ts`
Expected: log line `Converted tool-result content in snapshots`. Existing sessions now load under the new schema.

---

## Final verification

- [ ] Run: `pnpm typecheck:all` — Expected: PASS across all packages.
- [ ] Run: `pnpm lint:all` — Expected: PASS.
- [ ] Run: `pnpm --filter @omnicraft/tool-schemas test && pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/frontend test` — Expected: PASS.
- [ ] Drive an MCP tool that returns an image and confirm (via the verify skill / real app) the model receives it; confirm `read_file` on a local PNG returns an image block and the FE shows the chip.

## Notes for the implementer

- **Task ordering:** 1 → 2, 3 (both need 1) → 4 (needs 1, 2, 3) → 5 and 6 (both need 4; independent of each other) → 7.
- **Task 4 is the pivot:** the type change breaks the build on purpose. Trust `typecheck` as the exhaustive list of tool-return and test sites; the transform is uniform (`content: <s>` → `content: [{type: 'text', text: <s>}]`).
- **Do not** put base64 into any `data` field or SSE event — media bytes belong only in `content` blocks. Frontend media rendering + media-over-SSE are out of scope (issue #371).
- If a pre-commit hook reformats files, that does not require re-running typecheck/tests (formatting/lint don't affect them).
