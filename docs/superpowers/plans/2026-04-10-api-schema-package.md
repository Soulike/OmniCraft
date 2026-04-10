# `@omnicraft/api-schema` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract all HTTP API Zod schemas into a shared `@omnicraft/api-schema` package so frontend and backend share a single source of truth for API types.

**Architecture:** Create a new package under `packages/api-schema/` organized by resource (chat, settings, file-access). Each resource module exports request/response Zod schemas and inferred TypeScript types. Both apps replace local schema definitions with imports from this package.

**Tech Stack:** Zod, TypeScript, Bun workspaces

---

### Task 1: Create `@omnicraft/api-schema` package scaffolding

**Files:**

- Create: `packages/api-schema/package.json`
- Create: `packages/api-schema/tsconfig.json`
- Create: `packages/api-schema/src/index.ts` (empty placeholder)

- [ ] **Step 1: Create `package.json`**

Create `packages/api-schema/package.json`:

```json
{
  "name": "@omnicraft/api-schema",
  "description": "Shared Zod schemas for OmniCraft HTTP API request and response types",
  "private": true,
  "type": "module",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@omnicraft/settings-schema": "workspace:^",
    "zod": "catalog:"
  },
  "devDependencies": {
    "@config/eslint": "workspace:^",
    "@config/typescript": "workspace:^",
    "typescript": "catalog:"
  }
}
```

- [ ] **Step 2: Create `tsconfig.json`**

Create `packages/api-schema/tsconfig.json`:

```json
{
  "extends": "@config/typescript/package",
  "compilerOptions": {
    "rootDir": "./src",
    "outDir": "./dist"
  }
}
```

- [ ] **Step 3: Create empty `src/index.ts`**

Create `packages/api-schema/src/index.ts`:

```typescript
// Schemas will be added in subsequent tasks.
```

- [ ] **Step 4: Install dependencies**

Run: `bun install`
Expected: lockfile updated, no errors

- [ ] **Step 5: Verify typecheck**

Run: `cd packages/api-schema && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 6: Commit**

```bash
git add packages/api-schema/
git commit -m "chore: scaffold @omnicraft/api-schema package"
```

---

### Task 2: Create chat schemas

**Files:**

- Create: `packages/api-schema/src/chat/schema.ts`
- Modify: `packages/api-schema/src/index.ts`

- [ ] **Step 1: Create `chat/schema.ts`**

Create `packages/api-schema/src/chat/schema.ts`:

```typescript
import {z} from 'zod';

/** Thinking/reasoning level for models that support extended thinking. */
export const thinkingLevelSchema = z.enum(['none', 'low', 'medium', 'high']);

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;

/** Schema for the POST /chat/session request body. */
export const createSessionRequestSchema = z
  .object({
    workspace: z.string().optional(),
    extraAllowedPaths: z.array(z.string()).optional(),
  })
  .optional();

export type CreateSessionRequest = z.infer<typeof createSessionRequestSchema>;

/** Schema for the POST /chat/session response body. */
export const createSessionResponseSchema = z.object({
  sessionId: z.string(),
});

export type CreateSessionResponse = z.infer<typeof createSessionResponseSchema>;

/** Schema for the POST /chat/session/:id/completions request body. */
export const chatCompletionsRequestSchema = z.object({
  message: z.string().min(1),
  thinkingLevel: thinkingLevelSchema,
});

export type ChatCompletionsRequest = z.infer<
  typeof chatCompletionsRequestSchema
>;

/** Schema for the POST /chat/session/:id/generate-title request body. */
export const generateTitleRequestSchema = z.object({
  userMessage: z.string().min(1),
  assistantMessage: z.string().min(1),
});

export type GenerateTitleRequest = z.infer<typeof generateTitleRequestSchema>;

/** Schema for the POST /chat/session/:id/generate-title response body. */
export const generateTitleResponseSchema = z.object({
  title: z.string(),
});

export type GenerateTitleResponse = z.infer<typeof generateTitleResponseSchema>;
```

- [ ] **Step 2: Add chat exports to `index.ts`**

Replace `packages/api-schema/src/index.ts` with:

```typescript
export {
  type ChatCompletionsRequest,
  chatCompletionsRequestSchema,
  type CreateSessionRequest,
  createSessionRequestSchema,
  type CreateSessionResponse,
  createSessionResponseSchema,
  type GenerateTitleRequest,
  generateTitleRequestSchema,
  type GenerateTitleResponse,
  generateTitleResponseSchema,
  type ThinkingLevel,
  thinkingLevelSchema,
} from './chat/schema.js';
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/api-schema && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/api-schema/src/
git commit -m "feat(api-schema): add chat endpoint schemas"
```

---

### Task 3: Create settings schemas

**Files:**

- Create: `packages/api-schema/src/settings/schema.ts`
- Modify: `packages/api-schema/src/index.ts`

- [ ] **Step 1: Create `settings/schema.ts`**

Create `packages/api-schema/src/settings/schema.ts`:

```typescript
import {z} from 'zod';

/** A scalar setting value for the generic settings API. Non-scalar leaves (e.g. arrays) use dedicated endpoints. */
export const settingValueSchema = z
  .unknown()
  .refine((v) => typeof v !== 'object' || v === null, {
    message: 'Value must be a scalar, not an object',
  });

export type SettingValue = z.infer<typeof settingValueSchema>;

/** Schema for the GET /settings/* response body. */
export const getSettingValueResponseSchema = z.object({
  value: z.unknown(),
});

export type GetSettingValueResponse = z.infer<
  typeof getSettingValueResponseSchema
>;

/** Schema for the PUT /settings/* request body. */
export const putSettingValueRequestSchema = z.object({
  value: settingValueSchema,
});

export type PutSettingValueRequest = z.infer<
  typeof putSettingValueRequestSchema
>;

/** Schema for the PUT /settings/* response body. */
export const putSettingValueResponseSchema = z.object({
  success: z.boolean(),
});

export type PutSettingValueResponse = z.infer<
  typeof putSettingValueResponseSchema
>;

/** Schema for the PUT /settings/batch request body. */
export const putSettingsBatchRequestSchema = z.object({
  entries: z
    .array(
      z.object({
        path: z.string().min(1),
        value: settingValueSchema,
      }),
    )
    .nonempty(),
});

export type PutSettingsBatchRequest = z.infer<
  typeof putSettingsBatchRequestSchema
>;

/** Schema for the PUT /settings/batch response body. */
export const putSettingsBatchResponseSchema = z.object({
  success: z.boolean(),
});

export type PutSettingsBatchResponse = z.infer<
  typeof putSettingsBatchResponseSchema
>;
```

- [ ] **Step 2: Add settings exports to `index.ts`**

Append to `packages/api-schema/src/index.ts` after the chat exports:

```typescript
export {
  type GetSettingValueResponse,
  getSettingValueResponseSchema,
  type PutSettingsBatchRequest,
  putSettingsBatchRequestSchema,
  type PutSettingsBatchResponse,
  putSettingsBatchResponseSchema,
  type PutSettingValueRequest,
  putSettingValueRequestSchema,
  type PutSettingValueResponse,
  putSettingValueResponseSchema,
  type SettingValue,
  settingValueSchema,
} from './settings/schema.js';
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/api-schema && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/api-schema/src/
git commit -m "feat(api-schema): add settings endpoint schemas"
```

---

### Task 4: Create file-access schemas

**Files:**

- Create: `packages/api-schema/src/file-access/schema.ts`
- Modify: `packages/api-schema/src/index.ts`

- [ ] **Step 1: Create `file-access/schema.ts`**

Create `packages/api-schema/src/file-access/schema.ts`:

```typescript
import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

/** Schema for the GET /settings/file-access/allowed-paths response body. */
export const getAllowedPathsResponseSchema = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

export type GetAllowedPathsResponse = z.infer<
  typeof getAllowedPathsResponseSchema
>;

/** Schema for the PUT /settings/file-access/allowed-paths request body. */
export const putAllowedPathsRequestSchema = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

export type PutAllowedPathsRequest = z.infer<
  typeof putAllowedPathsRequestSchema
>;

/** Schema for the PUT /settings/file-access/allowed-paths success response body. */
export const putAllowedPathsSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export type PutAllowedPathsSuccessResponse = z.infer<
  typeof putAllowedPathsSuccessResponseSchema
>;

/** Schema for a single invalid path entry in error responses. */
export const invalidPathEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export type InvalidPathEntry = z.infer<typeof invalidPathEntrySchema>;

/** Schema for the PUT /settings/file-access/allowed-paths error response body (422). */
export const invalidPathsResponseSchema = z.object({
  error: z.literal('INVALID_PATHS'),
  invalidPaths: z.array(invalidPathEntrySchema),
});

export type InvalidPathsResponse = z.infer<typeof invalidPathsResponseSchema>;
```

- [ ] **Step 2: Add file-access exports to `index.ts`**

Append to `packages/api-schema/src/index.ts` after the settings exports:

```typescript
export {
  type GetAllowedPathsResponse,
  getAllowedPathsResponseSchema,
  type InvalidPathEntry,
  invalidPathEntrySchema,
  type InvalidPathsResponse,
  invalidPathsResponseSchema,
  type PutAllowedPathsRequest,
  putAllowedPathsRequestSchema,
  type PutAllowedPathsSuccessResponse,
  putAllowedPathsSuccessResponseSchema,
} from './file-access/schema.js';
```

- [ ] **Step 3: Verify typecheck**

Run: `cd packages/api-schema && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 4: Commit**

```bash
git add packages/api-schema/src/
git commit -m "feat(api-schema): add file-access endpoint schemas"
```

---

### Task 5: Update backend — add dependency and update chat dispatcher

**Files:**

- Modify: `apps/backend/package.json` (add `@omnicraft/api-schema` dependency)
- Modify: `apps/backend/src/dispatcher/chat/validator.ts`
- Modify: `apps/backend/src/dispatcher/chat/router.ts`

- [ ] **Step 1: Add dependency**

Run: `cd apps/backend && bun add @omnicraft/api-schema@workspace:^`

- [ ] **Step 2: Replace `chat/validator.ts`**

Replace `apps/backend/src/dispatcher/chat/validator.ts` entirely with:

```typescript
export {
  chatCompletionsRequestSchema,
  createSessionRequestSchema,
  generateTitleRequestSchema,
  thinkingLevelSchema,
} from '@omnicraft/api-schema';
```

- [ ] **Step 3: Update `chat/router.ts` imports**

In `apps/backend/src/dispatcher/chat/router.ts`, replace:

```typescript
import type {ThinkingLevel} from '@/agent-core/llm-api/index.js';
```

with:

```typescript
import type {ThinkingLevel} from '@omnicraft/api-schema';
```

Also replace:

```typescript
import {
  chatCompletionsBody,
  createSessionBody,
  generateTitleBody,
} from './validator.js';
```

with:

```typescript
import {
  chatCompletionsRequestSchema,
  createSessionRequestSchema,
  generateTitleRequestSchema,
} from './validator.js';
```

Then update the three usages in the same file:

- `createSessionBody.parse(` → `createSessionRequestSchema.parse(`
- `chatCompletionsBody.parse(` → `chatCompletionsRequestSchema.parse(`
- `generateTitleBody.parse(` → `generateTitleRequestSchema.parse(`

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 5: Commit**

```bash
git add apps/backend/package.json apps/backend/src/dispatcher/chat/
git commit -m "refactor(backend): use @omnicraft/api-schema in chat dispatcher"
```

---

### Task 6: Update backend — settings dispatcher

**Files:**

- Modify: `apps/backend/src/dispatcher/settings/validator.ts`
- Modify: `apps/backend/src/dispatcher/settings/router.ts`

- [ ] **Step 1: Replace `settings/validator.ts`**

Replace `apps/backend/src/dispatcher/settings/validator.ts` entirely with:

```typescript
import {z} from 'zod';

import {SettingsManager} from '@/models/settings-manager/index.js';

export {
  putSettingsBatchRequestSchema,
  putSettingValueRequestSchema,
} from '@omnicraft/api-schema';

/** Parses a raw path string into a validated leaf key path. */
export function parseLeafKeyPath(rawPath: string): string[] {
  const keyPath = rawPath.split('/');
  if (!SettingsManager.isValidLeafPath(keyPath)) {
    throw new z.ZodError([
      {
        code: 'custom',
        path: keyPath,
        message: `Invalid leaf path: /${rawPath}`,
      },
    ]);
  }
  return keyPath;
}
```

- [ ] **Step 2: Update `settings/router.ts` imports and usages**

In `apps/backend/src/dispatcher/settings/router.ts`, replace:

```typescript
import {
  parseLeafKeyPath,
  putSettingsBatchBody,
  putSettingsBody,
} from './validator.js';
```

with:

```typescript
import {
  parseLeafKeyPath,
  putSettingsBatchRequestSchema,
  putSettingValueRequestSchema,
} from './validator.js';
```

Then update usages:

- `putSettingsBatchBody.parse(` → `putSettingsBatchRequestSchema.parse(`
- `putSettingsBody.parse(` → `putSettingValueRequestSchema.parse(`

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/dispatcher/settings/
git commit -m "refactor(backend): use @omnicraft/api-schema in settings dispatcher"
```

---

### Task 7: Update backend — file-access-settings dispatcher

**Files:**

- Modify: `apps/backend/src/dispatcher/file-access-settings/validator.ts`
- Modify: `apps/backend/src/dispatcher/file-access-settings/router.ts`

- [ ] **Step 1: Replace `file-access-settings/validator.ts`**

Replace `apps/backend/src/dispatcher/file-access-settings/validator.ts` entirely with:

```typescript
export {putAllowedPathsRequestSchema} from '@omnicraft/api-schema';
```

- [ ] **Step 2: Update `file-access-settings/router.ts` imports and usages**

In `apps/backend/src/dispatcher/file-access-settings/router.ts`, replace:

```typescript
import {putAllowedPathsBody} from './validator.js';
```

with:

```typescript
import {putAllowedPathsRequestSchema} from './validator.js';
```

Then update usage:

- `putAllowedPathsBody.parse(` → `putAllowedPathsRequestSchema.parse(`

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/dispatcher/file-access-settings/
git commit -m "refactor(backend): use @omnicraft/api-schema in file-access dispatcher"
```

---

### Task 8: Update backend — settings-manager types and ThinkingLevel

**Files:**

- Modify: `apps/backend/src/models/settings-manager/types.ts`
- Modify: `apps/backend/src/models/settings-manager/index.ts`
- Modify: `apps/backend/src/agent-core/llm-api/types.ts`

- [ ] **Step 1: Update `settings-manager/types.ts`**

In `apps/backend/src/models/settings-manager/types.ts`:

Replace the import and local schema definitions:

```typescript
import {z} from 'zod';

import type {SettingsManager} from './settings-manager.js';

/** A scalar setting value for the generic settings API. Non-scalar leaves (e.g. arrays) use dedicated endpoints. */
export const settingValueSchema = z
  .unknown()
  .refine((v) => typeof v !== 'object' || v === null, {
    message: 'Value must be a scalar, not an object',
  });

export type SettingValue = z.infer<typeof settingValueSchema>;

/** A single setting entry: a leaf key path and a value. */
export const settingEntrySchema = z.object({
  keyPath: z.array(z.string()).nonempty(),
  value: settingValueSchema,
});
```

with:

```typescript
import {settingValueSchema} from '@omnicraft/api-schema';
import {z} from 'zod';

import type {SettingsManager} from './settings-manager.js';

export type {SettingValue} from '@omnicraft/api-schema';
export {settingValueSchema} from '@omnicraft/api-schema';

/** A single setting entry: a leaf key path and a value. */
export const settingEntrySchema = z.object({
  keyPath: z.array(z.string()).nonempty(),
  value: settingValueSchema,
});
```

- [ ] **Step 2: Update `agent-core/llm-api/types.ts`**

In `apps/backend/src/agent-core/llm-api/types.ts`, replace line 43:

```typescript
export type ThinkingLevel = 'none' | 'low' | 'medium' | 'high';
```

with:

```typescript
export type {ThinkingLevel} from '@omnicraft/api-schema';
```

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/backend && bun run typecheck`
Expected: passes with no errors

- [ ] **Step 4: Run tests**

Run: `cd apps/backend && bun run test`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/models/settings-manager/ apps/backend/src/agent-core/llm-api/types.ts
git commit -m "refactor(backend): import settingValueSchema and ThinkingLevel from @omnicraft/api-schema"
```

---

### Task 9: Update frontend — add dependency and update chat API

**Files:**

- Modify: `apps/frontend/package.json` (add `@omnicraft/api-schema` dependency)
- Delete: `apps/frontend/src/api/chat/validator.ts`
- Modify: `apps/frontend/src/api/chat/chat.ts`

- [ ] **Step 1: Add dependency**

Run: `cd apps/frontend && bun add @omnicraft/api-schema@workspace:^`

- [ ] **Step 2: Delete `chat/validator.ts`**

Delete `apps/frontend/src/api/chat/validator.ts`.

- [ ] **Step 3: Update `chat/chat.ts`**

In `apps/frontend/src/api/chat/chat.ts`, replace the imports:

```typescript
import type {SseEvent} from '@omnicraft/sse-events';

import {parseSseStream} from '../helpers/sse.js';
import {
  createSessionResponse,
  generateTitleResponse,
  sseEventSchema,
} from './validator.js';
```

with:

```typescript
import {
  type ThinkingLevel,
  createSessionResponseSchema,
  generateTitleResponseSchema,
} from '@omnicraft/api-schema';
import type {SseEvent} from '@omnicraft/sse-events';
import {sseEventSchema} from '@omnicraft/sse-events';

import {parseSseStream} from '../helpers/sse.js';
```

Then update the `thinkingLevel` parameter type in `streamChatCompletion`:

```typescript
  thinkingLevel: 'none' | 'low' | 'medium' | 'high',
```

to:

```typescript
  thinkingLevel: ThinkingLevel,
```

Then update usages:

- `createSessionResponse.parse(` → `createSessionResponseSchema.parse(`
- `generateTitleResponse.parse(` → `generateTitleResponseSchema.parse(`

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/frontend && npx tsc -b`
Expected: passes with no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/package.json apps/frontend/src/api/chat/
git commit -m "refactor(frontend): use @omnicraft/api-schema in chat API"
```

---

### Task 10: Update frontend — settings API

**Files:**

- Delete: `apps/frontend/src/api/settings/validator.ts`
- Modify: `apps/frontend/src/api/settings/settings.ts`

- [ ] **Step 1: Delete `settings/validator.ts`**

Delete `apps/frontend/src/api/settings/validator.ts`.

- [ ] **Step 2: Update `settings/settings.ts`**

In `apps/frontend/src/api/settings/settings.ts`, replace the imports:

```typescript
import {
  getValueResponse,
  putBatchResponse,
  putValueResponse,
} from './validator.js';
```

with:

```typescript
import {
  getSettingValueResponseSchema,
  putSettingValueResponseSchema,
  putSettingsBatchResponseSchema,
} from '@omnicraft/api-schema';
```

Then update usages:

- `getValueResponse.parse(` → `getSettingValueResponseSchema.parse(`
- `putValueResponse.parse(` → `putSettingValueResponseSchema.parse(`
- `putBatchResponse.parse(` → `putSettingsBatchResponseSchema.parse(`

- [ ] **Step 3: Verify typecheck**

Run: `cd apps/frontend && npx tsc -b`
Expected: passes with no errors

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/settings/validator.ts apps/frontend/src/api/settings/settings.ts
git commit -m "refactor(frontend): use @omnicraft/api-schema in settings API"
```

---

### Task 11: Update frontend — file-access API

**Files:**

- Delete: `apps/frontend/src/api/settings/file-access/validator.ts`
- Modify: `apps/frontend/src/api/settings/file-access/file-access.ts`
- Modify: `apps/frontend/src/api/settings/file-access/index.ts`

- [ ] **Step 1: Delete `file-access/validator.ts`**

Delete `apps/frontend/src/api/settings/file-access/validator.ts`.

- [ ] **Step 2: Update `file-access/file-access.ts`**

In `apps/frontend/src/api/settings/file-access/file-access.ts`, replace the imports:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {StatusCodes} from 'http-status-codes';

import {
  getAllowedPathsResponse,
  type InvalidPathEntry,
  invalidPathsResponse,
  putAllowedPathsSuccessResponse,
} from './validator.js';
```

with:

```typescript
import {
  type InvalidPathEntry,
  getAllowedPathsResponseSchema,
  invalidPathsResponseSchema,
  putAllowedPathsSuccessResponseSchema,
} from '@omnicraft/api-schema';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {StatusCodes} from 'http-status-codes';
```

Then update usages:

- `getAllowedPathsResponse.parse(` → `getAllowedPathsResponseSchema.parse(`
- `invalidPathsResponse.parse(` → `invalidPathsResponseSchema.parse(`
- `putAllowedPathsSuccessResponse.parse(` → `putAllowedPathsSuccessResponseSchema.parse(`

- [ ] **Step 3: Update `file-access/index.ts`**

In `apps/frontend/src/api/settings/file-access/index.ts`, the `InvalidPathEntry` type is currently re-exported from `file-access.ts`. After step 2, `file-access.ts` imports `InvalidPathEntry` from `@omnicraft/api-schema` and the `index.ts` re-exports it via `file-access.ts`. No change needed to `index.ts` — it already re-exports `type InvalidPathEntry` from `./file-access.js`.

Verify the file still reads:

```typescript
export {
  getAllowedPaths,
  type InvalidPathEntry,
  InvalidPathsError,
  putAllowedPaths,
} from './file-access.js';
```

- [ ] **Step 4: Verify typecheck**

Run: `cd apps/frontend && npx tsc -b`
Expected: passes with no errors

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/api/settings/file-access/
git commit -m "refactor(frontend): use @omnicraft/api-schema in file-access API"
```

---

### Task 12: Final verification

**Files:** None (verification only)

- [ ] **Step 1: Install all dependencies**

Run: `bun install`
Expected: clean install, no warnings about missing packages

- [ ] **Step 2: Typecheck all packages**

Run: `bun run --filter '@omnicraft/api-schema' typecheck && cd apps/backend && bun run typecheck && cd ../../apps/frontend && npx tsc -b`
Expected: all pass with no errors

- [ ] **Step 3: Run backend tests**

Run: `cd apps/backend && bun run test`
Expected: all tests pass

- [ ] **Step 4: Run frontend tests**

Run: `cd apps/frontend && bun run test`
Expected: all tests pass

- [ ] **Step 5: Run lint**

Run: `cd apps/backend && bun run lint && cd ../../apps/frontend && bun run lint`
Expected: no lint errors

- [ ] **Step 6: Verify no remaining local schema definitions**

Run: `grep -r "thinkingLevelSchema" apps/ --include="*.ts" -l` — should only show files importing from `@omnicraft/api-schema` or `./validator.js` (which re-exports from the package).

Run: `grep -rn "settingValueSchema" apps/backend/src/models/settings-manager/types.ts` — should show re-export, not a local `z.unknown().refine(...)` definition.

Run: `grep -rn "z.object" apps/frontend/src/api/*/validator.ts apps/frontend/src/api/settings/file-access/validator.ts 2>/dev/null` — should return nothing (files deleted).
