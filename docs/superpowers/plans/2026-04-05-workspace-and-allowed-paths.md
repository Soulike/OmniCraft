# Workspace & Allowed Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to configure accessible file paths in settings and select workspace/extra paths per chat session, replacing the hardcoded `os.tmpdir()` workspace and empty extra paths.

**Architecture:** New `fileAccess` settings schema section shared across frontend/backend via `@omnicraft/settings-schema`. Dedicated backend API for path validation (filesystem checks). Chat session creation accepts optional workspace/extra paths. Frontend gets a config bar on the chat page and a new settings tab.

**Tech Stack:** Zod (schema), Koa (backend API), React 19 + HeroUI v3 (frontend), CSS Modules (styling), Vitest (tests)

---

## File Structure

### New files

| File                                                                                                      | Responsibility                                                |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/settings-schema/src/file-access/schema.ts`                                                      | Zod schema for `fileAccess` section + `AllowedPathEntry` type |
| `apps/backend/src/dispatcher/file-access-settings/index.ts`                                               | Router export                                                 |
| `apps/backend/src/dispatcher/file-access-settings/path.ts`                                                | Route path constants                                          |
| `apps/backend/src/dispatcher/file-access-settings/router.ts`                                              | GET/PUT handlers for allowed paths                            |
| `apps/backend/src/dispatcher/file-access-settings/validator.ts`                                           | Request body Zod schemas                                      |
| `apps/backend/src/services/file-access-settings/index.ts`                                                 | Service export                                                |
| `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`                          | Read/write/validate allowed paths                             |
| `apps/backend/src/services/file-access-settings/helpers.ts`                                               | Filesystem validation (exists, isDir, permissions)            |
| `apps/backend/src/services/file-access-settings/helpers.test.ts`                                          | Tests for filesystem validation                               |
| `apps/backend/src/services/file-access-settings/types.ts`                                                 | Error types for validation results                            |
| `apps/backend/src/services/chat/validation.ts`                                                            | Session creation path validation                              |
| `apps/backend/src/services/chat/validation.test.ts`                                                       | Tests for session creation validation                         |
| `apps/frontend/src/api/settings/file-access/file-access.ts`                                               | Frontend API client for allowed paths                         |
| `apps/frontend/src/api/settings/file-access/validator.ts`                                                 | Zod schemas for API response validation                       |
| `apps/frontend/src/api/settings/file-access/index.ts`                                                     | API export                                                    |
| `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`                             | Settings tab container                                        |
| `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx`                         | Settings tab view (path list, add row, save)                  |
| `apps/frontend/src/pages/settings/sections/file-access/index.ts`                                          | Section export                                                |
| `apps/frontend/src/pages/settings/sections/file-access/styles.module.css`                                 | Section styles                                                |
| `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts`                          | Hook for loading/saving allowed paths                         |
| `apps/frontend/src/pages/chat/components/SessionConfigBar/SessionConfigBar.tsx`                           | Pre-session config bar (workspace + extra paths dropdowns)    |
| `apps/frontend/src/pages/chat/components/SessionConfigBar/index.ts`                                       | Component export                                              |
| `apps/frontend/src/pages/chat/components/SessionConfigBar/styles.module.css`                              | Config bar styles                                             |
| `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx`                                             | Post-session info bar container                               |
| `apps/frontend/src/pages/chat/components/InfoBar/index.ts`                                                | Component export                                              |
| `apps/frontend/src/pages/chat/components/InfoBar/styles.module.css`                                       | InfoBar container styles                                      |
| `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/AccessInfo.tsx`                    | Workspace + extra paths display with tooltip                  |
| `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/index.ts`                          | AccessInfo export                                             |
| `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/styles.module.css`                 | AccessInfo styles                                             |
| `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/UsageInfo.tsx`                      | Token usage display (extracted from UsageBar)                 |
| `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/index.ts`                           | UsageInfo export                                              |
| `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/styles.module.css`                  | UsageInfo styles                                              |
| `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.ts`      | Token count formatter                                         |
| `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.test.ts` | Token count formatter tests                                   |
| `apps/frontend/src/pages/chat/hooks/useAllowedPaths.ts`                                                   | Hook to fetch allowed paths for chat page config              |
| `apps/frontend/src/pages/chat/hooks/useSessionConfig.ts`                                                  | Hook managing workspace/extra paths selection state           |

### Modified files

| File                                                     | Change                                                                         |
| -------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `packages/settings-schema/src/schema.ts`                 | Add `fileAccess` section                                                       |
| `packages/settings-schema/src/index.ts`                  | Export `AllowedPathEntry` type and `fileAccessSettingsSchema`                  |
| `apps/backend/src/agent-core/tool/types.ts`              | Remove `AllowedPath` interface, import `AllowedPathEntry` from settings-schema |
| `apps/backend/src/agent-core/tool/index.ts`              | Re-export `AllowedPathEntry` instead of `AllowedPath`                          |
| `apps/backend/src/agent-core/agent/types.ts`             | Update `AgentOptions` to use `AllowedPathEntry`                                |
| `apps/backend/src/agent-core/agent/agent.ts`             | Update imports to use `AllowedPathEntry`                                       |
| `apps/backend/src/agent/tools/file/helpers.ts`           | Update `checkAccess` to use `AllowedPathEntry`                                 |
| `apps/backend/src/agent/agents/core-agent/core-agent.ts` | Accept `extraAllowedPaths` parameter                                           |
| `apps/backend/src/services/chat/chat-service.ts`         | Accept workspace/extraAllowedPaths, validate, pass to CoreAgent                |
| `apps/backend/src/services/chat/types.ts`                | Add new `CreateSessionError` variants                                          |
| `apps/backend/src/dispatcher/chat/router.ts`             | Parse optional request body for session creation                               |
| `apps/backend/src/dispatcher/chat/validator.ts`          | Add `createSessionBody` schema                                                 |
| `apps/backend/src/dispatcher/index.ts`                   | Mount file-access-settings router                                              |
| `apps/backend/src/agent-core/tool/testing.ts`            | Update mock context to use `AllowedPathEntry`                                  |
| `apps/frontend/src/api/chat/chat.ts`                     | Pass workspace/extraAllowedPaths to session creation                           |
| `apps/frontend/src/pages/chat/ChatPage.tsx`              | Add session config and allowed paths hooks                                     |
| `apps/frontend/src/pages/chat/ChatPageView.tsx`          | Replace UsageBar with InfoBar, add SessionConfigBar                            |
| `apps/frontend/src/pages/chat/hooks/useSession.ts`       | Accept workspace/extraAllowedPaths params                                      |
| `apps/frontend/src/pages/settings/SettingsPage.tsx`      | Add File Access tab                                                            |
| `apps/frontend/src/routes.ts`                            | Add `fileAccess` route                                                         |
| `apps/frontend/src/router/router.tsx`                    | Add FileAccessSection route                                                    |
| `apps/frontend/src/router/lazy-pages.tsx`                | Add lazy FileAccessSection                                                     |

### Deleted files

| File                                                                                  | Reason                        |
| ------------------------------------------------------------------------------------- | ----------------------------- |
| `apps/frontend/src/pages/chat/components/UsageBar/UsageBar.tsx`                       | Replaced by InfoBar/UsageInfo |
| `apps/frontend/src/pages/chat/components/UsageBar/styles.module.css`                  | Replaced by InfoBar styles    |
| `apps/frontend/src/pages/chat/components/UsageBar/index.ts`                           | Replaced by InfoBar export    |
| `apps/frontend/src/pages/chat/components/UsageBar/helpers/format-token-count.ts`      | Moved to UsageInfo helpers    |
| `apps/frontend/src/pages/chat/components/UsageBar/helpers/format-token-count.test.ts` | Moved to UsageInfo helpers    |

---

## Task 1: Settings Schema — `fileAccess` section and type unification

**Files:**

- Create: `packages/settings-schema/src/file-access/schema.ts`
- Modify: `packages/settings-schema/src/schema.ts`
- Modify: `packages/settings-schema/src/index.ts`
- Test: `packages/settings-schema/src/schema.test.ts`

- [ ] **Step 1: Write the `fileAccess` schema**

Create `packages/settings-schema/src/file-access/schema.ts`:

```typescript
import {z} from 'zod';

export const accessModeSchema = z
  .enum(['read', 'read-write'])
  .describe('Access mode for the path');

export const allowedPathEntrySchema = z.object({
  path: z.string().describe('Absolute directory path'),
  mode: accessModeSchema,
});

export type AllowedPathEntry = z.infer<typeof allowedPathEntrySchema>;

export const fileAccessSettingsSchema = z.object({
  allowedPaths: z
    .array(allowedPathEntrySchema)
    .describe('User-configured accessible paths')
    .default([]),
});
```

- [ ] **Step 2: Compose into root schema**

Modify `packages/settings-schema/src/schema.ts`:

```typescript
import {z} from 'zod';

import {agentSettingsSchema} from './agent/schema.js';
import {fileAccessSettingsSchema} from './file-access/schema.js';
import {llmSettingsSchema} from './llm/schema.js';
import {searchSettingsSchema} from './search/schema.js';

export const settingsSchema = z.object({
  llm: llmSettingsSchema.prefault({}),
  agent: agentSettingsSchema.prefault({}),
  search: searchSettingsSchema.prefault({}),
  fileAccess: fileAccessSettingsSchema.prefault({}),
});

export type Settings = z.infer<typeof settingsSchema>;
```

- [ ] **Step 3: Export the new types from index**

Modify `packages/settings-schema/src/index.ts`:

```typescript
export {type Settings, settingsSchema} from './schema.js';
export {
  type AllowedPathEntry,
  allowedPathEntrySchema,
  fileAccessSettingsSchema,
} from './file-access/schema.js';
```

- [ ] **Step 4: Run existing tests to verify nothing breaks**

Run: `cd packages/settings-schema && bun test`

Expected: All tests pass, including the JSON Schema conversion test (Zod arrays with objects are JSON Schema compatible).

- [ ] **Step 5: Commit**

```bash
git add packages/settings-schema/src/file-access/schema.ts packages/settings-schema/src/schema.ts packages/settings-schema/src/index.ts
git commit -m "feat(settings-schema): add fileAccess section with AllowedPathEntry type"
```

---

## Task 2: Type unification — replace `AllowedPath` with `AllowedPathEntry`

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/tool/index.ts`
- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/tool/testing.ts`
- Modify: `apps/backend/src/agent/tools/file/helpers.ts`
- Modify: All file tool files that import `AllowedPath`

- [ ] **Step 1: Remove `AllowedPath` from `tool/types.ts` and import `AllowedPathEntry`**

In `apps/backend/src/agent-core/tool/types.ts`, remove the `AllowedPath` interface (lines 8-13) and add an import:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
```

Replace all usages of `AllowedPath` with `AllowedPathEntry` in the same file. In `ToolExecutionContext`:

```typescript
readonly extraAllowedPaths: readonly AllowedPathEntry[];
```

- [ ] **Step 2: Update `tool/index.ts` re-export**

In `apps/backend/src/agent-core/tool/index.ts`, change:

```typescript
export type {
  AllowedPath,
  // ...
```

to:

```typescript
export type {AllowedPathEntry} from '@omnicraft/settings-schema';
export type {
  ShellState,
  ToolDefinition,
  ToolExecutionContext,
} from './types.js';
```

- [ ] **Step 3: Update `agent/types.ts`**

In `apps/backend/src/agent-core/agent/types.ts`, change the import from:

```typescript
import type {AllowedPath} from '../tool/index.js';
```

to:

```typescript
import type {AllowedPathEntry} from '../tool/index.js';
```

And update `AgentOptions`:

```typescript
readonly extraAllowedPaths: readonly AllowedPathEntry[];
```

- [ ] **Step 4: Update `agent/agent.ts`**

In `apps/backend/src/agent-core/agent/agent.ts`, change the import:

```typescript
import type {
  AllowedPath,
  // ...
```

to:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {
  ShellState,
  ToolDefinition,
  ToolExecutionContext,
} from '../tool/index.js';
```

And update the field:

```typescript
private readonly extraAllowedPaths: readonly AllowedPathEntry[];
```

- [ ] **Step 5: Update `tool/testing.ts`**

In `apps/backend/src/agent-core/tool/testing.ts`, update the import and any type annotations to use `AllowedPathEntry`.

- [ ] **Step 6: Update `file/helpers.ts`**

In `apps/backend/src/agent/tools/file/helpers.ts`, change:

```typescript
import type {AllowedPath} from '@/agent-core/tool/index.js';
```

to:

```typescript
import type {AllowedPathEntry} from '@/agent-core/tool/index.js';
```

Update the `checkAccess` function signature to use `AllowedPathEntry` in all overloads:

```typescript
export function checkAccess(
  targetPath: string,
  requiredMode: 'read',
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
): AccessCheckResult.OK | AccessCheckResult.ERROR_OUTSIDE_ALLOWED_DIRECTORIES;
export function checkAccess(
  targetPath: string,
  requiredMode: 'read-write',
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
): AccessCheckResult;
export function checkAccess(
  targetPath: string,
  requiredMode: 'read' | 'read-write',
  workingDirectory: string,
  extraAllowedPaths: readonly AllowedPathEntry[],
): AccessCheckResult {
  // ... body unchanged
}
```

- [ ] **Step 7: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun test`

Expected: No type errors, all tests pass.

- [ ] **Step 8: Commit**

```bash
git add apps/backend/src/agent-core/ apps/backend/src/agent/tools/file/helpers.ts
git commit -m "refactor(backend): replace AllowedPath with AllowedPathEntry from settings-schema"
```

---

## Task 3: Backend — filesystem validation helpers

**Files:**

- Create: `apps/backend/src/services/file-access-settings/helpers.ts`
- Create: `apps/backend/src/services/file-access-settings/helpers.test.ts`
- Create: `apps/backend/src/services/file-access-settings/types.ts`

- [ ] **Step 1: Write the types**

Create `apps/backend/src/services/file-access-settings/types.ts`:

```typescript
export enum PathValidationError {
  NOT_ABSOLUTE = 'NOT_ABSOLUTE',
  DUPLICATE = 'DUPLICATE',
  NOT_FOUND = 'NOT_FOUND',
  NOT_DIRECTORY = 'NOT_DIRECTORY',
  NOT_READABLE = 'NOT_READABLE',
  NOT_READABLE_AND_WRITABLE = 'NOT_READABLE_AND_WRITABLE',
}

export interface InvalidPathEntry {
  path: string;
  reason: PathValidationError;
}
```

- [ ] **Step 2: Write failing tests for `normalizeAndValidatePaths`**

Create `apps/backend/src/services/file-access-settings/helpers.test.ts`:

```typescript
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {normalizeAndValidatePaths} from './helpers.js';
import {PathValidationError} from './types.js';

describe('normalizeAndValidatePaths', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-paths-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true});
  });

  it('returns empty errors for valid read-write directory', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([]);
  });

  it('returns empty errors for valid read directory', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
    ]);
    expect(errors).toEqual([]);
  });

  it('returns error for duplicate paths', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
      {path: tempDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: tempDir, reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('normalizes paths before dedup check', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
      {path: tempDir + '/', mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: tempDir + '/', reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('returns normalized paths', async () => {
    const {normalized} = await normalizeAndValidatePaths([
      {path: tempDir + '/', mode: 'read'},
    ]);
    expect(normalized[0].path).toBe(tempDir);
  });

  it('returns normalized paths only for valid entries', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {normalized, errors} = await normalizeAndValidatePaths([
      {path: tempDir + '/', mode: 'read'},
      {path: '/nonexistent', mode: 'read'},
      {path: subDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
    expect(normalized).toEqual([
      {path: tempDir, mode: 'read'},
      {path: subDir, mode: 'read-write'},
    ]);
  });

  it('rejects relative path before normalization', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: 'relative/path', mode: 'read'},
    ]);
    expect(errors).toEqual([
      {path: 'relative/path', reason: PathValidationError.NOT_ABSOLUTE},
    ]);
  });

  it('returns error for non-existent path', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: '/nonexistent/path/xyz', mode: 'read'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent/path/xyz', reason: PathValidationError.NOT_FOUND},
    ]);
  });

  it('returns error for file path (not directory)', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    await fs.writeFile(filePath, 'content');
    const {errors} = await normalizeAndValidatePaths([
      {path: filePath, mode: 'read'},
    ]);
    expect(errors).toEqual([
      {path: filePath, reason: PathValidationError.NOT_DIRECTORY},
    ]);
  });

  it('validates multiple paths and returns errors for invalid ones', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir, mode: 'read'},
      {path: '/nonexistent', mode: 'read-write'},
      {path: subDir, mode: 'read-write'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/backend && bun test src/services/file-access-settings/helpers.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `normalizeAndValidatePaths`**

Create `apps/backend/src/services/file-access-settings/helpers.ts`:

```typescript
import {constants} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {PathValidationError, type InvalidPathEntry} from './types.js';

/**
 * Validates path entries for duplicates and filesystem access.
 * Normalizes absolute paths before dedup and storage.
 * Returns the normalized entries and an array of errors (empty if all valid).
 */
export async function normalizeAndValidatePaths(
  entries: readonly AllowedPathEntry[],
): Promise<{normalized: AllowedPathEntry[]; errors: InvalidPathEntry[]}> {
  const errors: InvalidPathEntry[] = [];
  const seen = new Set<string>();
  const normalized: AllowedPathEntry[] = [];

  for (const entry of entries) {
    if (!path.isAbsolute(entry.path)) {
      errors.push({path: entry.path, reason: PathValidationError.NOT_ABSOLUTE});
      continue;
    }

    const resolvedPath = path.resolve(entry.path);
    if (seen.has(resolvedPath)) {
      errors.push({path: entry.path, reason: PathValidationError.DUPLICATE});
      continue;
    }
    seen.add(resolvedPath);

    const reason = await validateSinglePath(resolvedPath, entry.mode);
    if (reason) {
      errors.push({path: entry.path, reason});
      continue;
    }

    normalized.push({...entry, path: resolvedPath});
  }

  return {normalized, errors};
}

async function validateSinglePath(
  resolvedPath: string,
  mode: AllowedPathEntry['mode'],
): Promise<PathValidationError | null> {
  let stat;
  try {
    stat = await fs.stat(resolvedPath);
  } catch {
    return PathValidationError.NOT_FOUND;
  }

  if (!stat.isDirectory()) {
    return PathValidationError.NOT_DIRECTORY;
  }

  const requiredFlags =
    mode === 'read-write' ? constants.R_OK | constants.W_OK : constants.R_OK;

  try {
    await fs.access(resolvedPath, requiredFlags);
  } catch {
    return mode === 'read-write'
      ? PathValidationError.NOT_READABLE_AND_WRITABLE
      : PathValidationError.NOT_READABLE;
  }

  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun test src/services/file-access-settings/helpers.test.ts`

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/file-access-settings/
git commit -m "feat(backend): add filesystem validation helpers for allowed paths"
```

---

## Task 4: Backend — file access settings service and API

**Files:**

- Create: `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`
- Create: `apps/backend/src/services/file-access-settings/index.ts`
- Create: `apps/backend/src/dispatcher/file-access-settings/path.ts`
- Create: `apps/backend/src/dispatcher/file-access-settings/validator.ts`
- Create: `apps/backend/src/dispatcher/file-access-settings/router.ts`
- Create: `apps/backend/src/dispatcher/file-access-settings/index.ts`
- Modify: `apps/backend/src/dispatcher/index.ts`

- [ ] **Step 1: Create the service**

Create `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {SettingsManager} from '@/models/settings-manager/index.js';

import {normalizeAndValidatePaths} from './helpers.js';
import type {InvalidPathEntry} from './types.js';

export type SaveAllowedPathsResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]};

export const fileAccessSettingsService = {
  async getAllowedPaths(): Promise<readonly AllowedPathEntry[]> {
    const settings = await SettingsManager.getInstance().getAll();
    return settings.fileAccess.allowedPaths;
  },

  async setAllowedPaths(
    entries: AllowedPathEntry[],
  ): Promise<SaveAllowedPathsResult> {
    const {normalized, errors} = await normalizeAndValidatePaths(entries);
    if (errors.length > 0) {
      return {success: false, invalidPaths: errors};
    }

    await SettingsManager.getInstance().set(
      ['fileAccess', 'allowedPaths'],
      normalized,
    );
    return {success: true};
  },
};
```

- [ ] **Step 2: Create the service index**

Create `apps/backend/src/services/file-access-settings/index.ts`:

```typescript
export {fileAccessSettingsService} from './file-access-settings-service.js';
```

- [ ] **Step 3: Create dispatcher path and validator**

Create `apps/backend/src/dispatcher/file-access-settings/path.ts`:

```typescript
export const FILE_ACCESS_ALLOWED_PATHS = '/settings/file-access/allowed-paths';
```

Create `apps/backend/src/dispatcher/file-access-settings/validator.ts`:

```typescript
import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

export const putAllowedPathsBody = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});
```

- [ ] **Step 4: Create the router**

Create `apps/backend/src/dispatcher/file-access-settings/router.ts`:

```typescript
import Router from '@koa/router';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {fileAccessSettingsService} from '@/services/file-access-settings/index.js';

import {FILE_ACCESS_ALLOWED_PATHS} from './path.js';
import {putAllowedPathsBody} from './validator.js';

const router = new Router();

/** GET /settings/file-access/allowed-paths — returns the current allowed paths. */
router.get(FILE_ACCESS_ALLOWED_PATHS, async (ctx) => {
  const allowedPaths = await fileAccessSettingsService.getAllowedPaths();
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {allowedPaths};
});

/** PUT /settings/file-access/allowed-paths — validates and saves allowed paths. */
router.put(FILE_ACCESS_ALLOWED_PATHS, async (ctx) => {
  let allowedPaths;
  try {
    const body = putAllowedPathsBody.parse(ctx.request.body);
    allowedPaths = body.allowedPaths;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await fileAccessSettingsService.setAllowedPaths(allowedPaths);

  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {
      error: 'INVALID_PATHS',
      invalidPaths: result.invalidPaths,
    };
    return;
  }

  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {success: true};
});

export {router};
```

- [ ] **Step 5: Create dispatcher index**

Create `apps/backend/src/dispatcher/file-access-settings/index.ts`:

```typescript
export {router} from './router.js';
```

- [ ] **Step 6: Mount the router**

Modify `apps/backend/src/dispatcher/index.ts` to add:

```typescript
import {router as fileAccessSettingsRouter} from './file-access-settings/index.js';
```

And add to `apiRouter`:

```typescript
apiRouter.use(
  fileAccessSettingsRouter.routes(),
  fileAccessSettingsRouter.allowedMethods(),
);
```

- [ ] **Step 7: Update SettingsManager to allow non-scalar leaf values**

The current `SettingsManager.setBatch()` asserts `typeof value !== 'object' || value === null` — this rejects arrays. Since `isLeafSchemaPath` already treats arrays as leaves (they have no `.shape`), we just need to remove the scalar assertion from `setBatch()` in `apps/backend/src/models/settings-manager/settings-manager.ts`.

Remove this assertion from `setBatch()`:

```typescript
assert(
  typeof value !== 'object' || value === null,
  'Value must be a scalar, not an object',
);
```

The Zod schema validation (`settingsSchema.parse(settings)`) already ensures the value is valid — no additional assertion needed.

The service then calls `SettingsManager.getInstance().setBatch([{keyPath: ['fileAccess', 'allowedPaths'], value: normalized}])` to persist.

- [ ] **Step 8: Run typecheck**

Run: `cd apps/backend && bun run typecheck`

Expected: No errors.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/services/file-access-settings/ apps/backend/src/dispatcher/file-access-settings/ apps/backend/src/dispatcher/index.ts apps/backend/src/models/settings-manager/settings-manager.ts
git commit -m "feat(backend): add file access settings API with filesystem validation"
```

---

## Task 5: Backend — session creation with workspace and extra paths

**Files:**

- Create: `apps/backend/src/services/chat/validation.ts`
- Create: `apps/backend/src/services/chat/validation.test.ts`
- Modify: `apps/backend/src/services/chat/types.ts`
- Modify: `apps/backend/src/services/chat/chat-service.ts`
- Modify: `apps/backend/src/dispatcher/chat/validator.ts`
- Modify: `apps/backend/src/dispatcher/chat/router.ts`
- Modify: `apps/backend/src/agent/agents/core-agent/core-agent.ts`

- [ ] **Step 1: Add new error types**

Modify `apps/backend/src/services/chat/types.ts` to add:

```typescript
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
  WORKSPACE_PATH_NOT_FOUND = 'WORKSPACE_PATH_NOT_FOUND',
  WORKSPACE_PATH_NOT_DIRECTORY = 'WORKSPACE_PATH_NOT_DIRECTORY',
  WORKSPACE_PATH_NOT_ACCESSIBLE = 'WORKSPACE_PATH_NOT_ACCESSIBLE',
  WORKSPACE_NOT_IN_ALLOWED_PATHS = 'WORKSPACE_NOT_IN_ALLOWED_PATHS',
  WORKSPACE_NOT_READ_WRITE = 'WORKSPACE_NOT_READ_WRITE',
  EXTRA_PATH_NOT_FOUND = 'EXTRA_PATH_NOT_FOUND',
  EXTRA_PATH_NOT_DIRECTORY = 'EXTRA_PATH_NOT_DIRECTORY',
  EXTRA_PATH_NOT_ACCESSIBLE = 'EXTRA_PATH_NOT_ACCESSIBLE',
  EXTRA_PATH_NOT_IN_ALLOWED_PATHS = 'EXTRA_PATH_NOT_IN_ALLOWED_PATHS',
}
```

- [ ] **Step 2: Write failing tests for session creation validation**

Create `apps/backend/src/services/chat/validation.test.ts`:

```typescript
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {validateSessionPaths} from './validation.js';
import {CreateSessionError} from './types.js';

describe('validateSessionPaths', () => {
  let tempDir: string;
  let subDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-validation-'));
    subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true});
  });

  const makeAllowed = (...entries: AllowedPathEntry[]) => entries;

  it('returns null for valid workspace with no extra paths', async () => {
    const allowed = makeAllowed({path: tempDir, mode: 'read-write'});
    const result = await validateSessionPaths(tempDir, [], allowed);
    expect(result).toBeNull();
  });

  it('returns WORKSPACE_PATH_NOT_FOUND for non-existent workspace', async () => {
    const allowed = makeAllowed({path: '/nonexistent', mode: 'read-write'});
    const result = await validateSessionPaths('/nonexistent', [], allowed);
    expect(result).toBe(CreateSessionError.WORKSPACE_PATH_NOT_FOUND);
  });

  it('returns WORKSPACE_NOT_IN_ALLOWED_PATHS for workspace not in list', async () => {
    const allowed = makeAllowed({path: subDir, mode: 'read-write'});
    const result = await validateSessionPaths(tempDir, [], allowed);
    expect(result).toBe(CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS);
  });

  it('returns WORKSPACE_NOT_READ_WRITE for read-only workspace', async () => {
    const allowed = makeAllowed({path: tempDir, mode: 'read'});
    const result = await validateSessionPaths(tempDir, [], allowed);
    expect(result).toBe(CreateSessionError.WORKSPACE_NOT_READ_WRITE);
  });

  it('returns EXTRA_PATH_NOT_FOUND for non-existent extra path', async () => {
    const allowed = makeAllowed(
      {path: tempDir, mode: 'read-write'},
      {path: '/gone', mode: 'read'},
    );
    const result = await validateSessionPaths(tempDir, ['/gone'], allowed);
    expect(result).toBe(CreateSessionError.EXTRA_PATH_NOT_FOUND);
  });

  it('returns EXTRA_PATH_NOT_IN_ALLOWED_PATHS for unlisted extra path', async () => {
    const allowed = makeAllowed({path: tempDir, mode: 'read-write'});
    const result = await validateSessionPaths(tempDir, [subDir], allowed);
    expect(result).toBe(CreateSessionError.EXTRA_PATH_NOT_IN_ALLOWED_PATHS);
  });

  it('returns null for valid workspace with valid extra paths', async () => {
    const allowed = makeAllowed(
      {path: tempDir, mode: 'read-write'},
      {path: subDir, mode: 'read'},
    );
    const result = await validateSessionPaths(tempDir, [subDir], allowed);
    expect(result).toBeNull();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/backend && bun test src/services/chat/validation.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `validateSessionPaths`**

Create `apps/backend/src/services/chat/validation.ts`:

```typescript
import {constants} from 'node:fs';
import fs from 'node:fs/promises';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {CreateSessionError} from './types.js';

/**
 * Validates workspace and extra paths against settings and filesystem.
 * Returns null if valid, or the first error found.
 */
export async function validateSessionPaths(
  workspace: string,
  extraPaths: readonly string[],
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  const workspaceError = await validateWorkspace(workspace, allowedPaths);
  if (workspaceError) return workspaceError;

  const extraError = await validateExtraPaths(extraPaths, allowedPaths);
  if (extraError) return extraError;

  return null;
}

async function validateWorkspace(
  workspace: string,
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  const entry = allowedPaths.find((e) => e.path === workspace);
  if (!entry) return CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS;
  if (entry.mode !== 'read-write')
    return CreateSessionError.WORKSPACE_NOT_READ_WRITE;

  const fsError = await checkDirectoryAccess(
    workspace,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found')
    return CreateSessionError.WORKSPACE_PATH_NOT_FOUND;
  if (fsError === 'not_directory')
    return CreateSessionError.WORKSPACE_PATH_NOT_DIRECTORY;
  if (fsError === 'not_accessible')
    return CreateSessionError.WORKSPACE_PATH_NOT_ACCESSIBLE;

  return null;
}

async function validateExtraPaths(
  extraPaths: readonly string[],
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  for (const extraPath of extraPaths) {
    const entry = allowedPaths.find((e) => e.path === extraPath);
    if (!entry) return CreateSessionError.EXTRA_PATH_NOT_IN_ALLOWED_PATHS;

    const requiredFlags =
      entry.mode === 'read-write'
        ? constants.R_OK | constants.W_OK
        : constants.R_OK;

    const fsError = await checkDirectoryAccess(extraPath, requiredFlags);
    if (fsError === 'not_found') return CreateSessionError.EXTRA_PATH_NOT_FOUND;
    if (fsError === 'not_directory')
      return CreateSessionError.EXTRA_PATH_NOT_DIRECTORY;
    if (fsError === 'not_accessible')
      return CreateSessionError.EXTRA_PATH_NOT_ACCESSIBLE;
  }

  return null;
}

type FilesystemError = 'not_found' | 'not_directory' | 'not_accessible';

async function checkDirectoryAccess(
  dirPath: string,
  flags: number,
): Promise<FilesystemError | null> {
  let stat;
  try {
    stat = await fs.stat(dirPath);
  } catch {
    return 'not_found';
  }
  if (!stat.isDirectory()) return 'not_directory';
  try {
    await fs.access(dirPath, flags);
  } catch {
    return 'not_accessible';
  }
  return null;
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd apps/backend && bun test src/services/chat/validation.test.ts`

Expected: All tests pass.

- [ ] **Step 6: Update `CoreAgent` constructor**

Modify `apps/backend/src/agent/agents/core-agent/core-agent.ts`:

```typescript
import {CoreSkillRegistry} from '@/agent/skills/index.js';
import {
  BashToolRegistry,
  CoreToolRegistry,
  FileToolRegistry,
  WebToolRegistry,
} from '@/agent/tools/index.js';
import {Agent} from '@/agent-core/agent/index.js';
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {settingsService} from '@/services/settings/index.js';

export class CoreAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
  ) {
    super(getConfig, {
      toolRegistries: [
        CoreToolRegistry.getInstance(),
        FileToolRegistry.getInstance(),
        WebToolRegistry.getInstance(),
        BashToolRegistry.getInstance(),
      ],
      skillRegistries: [CoreSkillRegistry.getInstance()],
      baseSystemPrompt: 'You are a helpful assistant.',
      getMaxToolRounds: async () => {
        const settings = await settingsService.getAll();
        return settings.agent.maxToolRounds;
      },
      workingDirectory,
      extraAllowedPaths,
    });
  }
}
```

- [ ] **Step 7: Update `chatService.createSession()`**

Modify `apps/backend/src/services/chat/chat-service.ts`:

```typescript
import os from 'node:os';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {CoreAgent} from '@/agent/agents/index.js';
import {logger} from '@/logger.js';
import {AgentStore} from '@/models/agent-store/index.js';
import {SettingsManager} from '@/models/settings-manager/index.js';

import {
  generateTitleFromLlm,
  getLlmConfig,
  truncateToTitle,
} from './helpers.js';
import type {CreateSessionResult, StreamCompletionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: string[];
}

export const chatService = {
  async createSession(
    options: CreateSessionOptions = {},
  ): Promise<CreateSessionResult> {
    const config = await getLlmConfig();

    if (!config.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!config.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

    let workingDirectory = os.tmpdir();
    let resolvedExtraPaths: readonly AllowedPathEntry[] = [];

    if (options.workspace) {
      const settings = await SettingsManager.getInstance().getAll();
      const allowedPaths = settings.fileAccess.allowedPaths;

      const validationError = await validateSessionPaths(
        options.workspace,
        options.extraAllowedPaths ?? [],
        allowedPaths,
      );

      if (validationError) {
        return {success: false, error: validationError};
      }

      workingDirectory = options.workspace;
      resolvedExtraPaths = (options.extraAllowedPaths ?? []).map((p) => {
        const entry = allowedPaths.find((e) => e.path === p);
        assert(entry, `Extra path not found in allowed paths: ${p}`);
        return entry;
      });
    }

    const agent = new CoreAgent(
      getLlmConfig,
      workingDirectory,
      resolvedExtraPaths,
    );
    return {success: true, sessionId: agent.id};
  },

  // ... rest of the service unchanged
```

- [ ] **Step 8: Update dispatcher validator and router**

Modify `apps/backend/src/dispatcher/chat/validator.ts` to add:

```typescript
export const createSessionBody = z
  .object({
    workspace: z.string().optional(),
    extraAllowedPaths: z.array(z.string()).optional(),
  })
  .optional();
```

Modify the `POST /chat/session` handler in `apps/backend/src/dispatcher/chat/router.ts`:

```typescript
import {
  chatCompletionsBody,
  createSessionBody,
  generateTitleBody,
} from './validator.js';

/** POST /chat/session — creates a new chat session. */
router.post(CHAT_SESSION, async (ctx) => {
  let options = {};
  try {
    const body = createSessionBody.parse(ctx.request.body);
    if (body) {
      options = {
        workspace: body.workspace,
        extraAllowedPaths: body.extraAllowedPaths,
      };
    }
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await chatService.createSession(options);

  if (!result.success) {
    ctx.response.status = StatusCodes.UNPROCESSABLE_ENTITY;
    ctx.response.body = {error: result.error};
    return;
  }

  ctx.response.status = StatusCodes.CREATED;
  ctx.response.body = {sessionId: result.sessionId};
});
```

- [ ] **Step 9: Run typecheck and tests**

Run: `cd apps/backend && bun run typecheck && bun test`

Expected: All pass.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/services/chat/ apps/backend/src/dispatcher/chat/ apps/backend/src/agent/agents/core-agent/
git commit -m "feat(backend): session creation with optional workspace and extra allowed paths"
```

---

## Task 6: Frontend — file access settings API client and settings tab

**Files:**

- Create: `apps/frontend/src/api/settings/file-access/file-access.ts`
- Create: `apps/frontend/src/api/settings/file-access/validator.ts`
- Create: `apps/frontend/src/api/settings/file-access/index.ts`
- Create: `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts`
- Create: `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx`
- Create: `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`
- Create: `apps/frontend/src/pages/settings/sections/file-access/styles.module.css`
- Create: `apps/frontend/src/pages/settings/sections/file-access/index.ts`
- Modify: `apps/frontend/src/pages/settings/SettingsPage.tsx`
- Modify: `apps/frontend/src/routes.ts`
- Modify: `apps/frontend/src/router/router.tsx`
- Modify: `apps/frontend/src/router/lazy-pages.tsx`

- [ ] **Step 1: Create the API client**

Create `apps/frontend/src/api/settings/file-access/validator.ts`:

```typescript
import {allowedPathEntrySchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

export const getAllowedPathsResponse = z.object({
  allowedPaths: z.array(allowedPathEntrySchema),
});

const invalidPathEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export type InvalidPathEntry = z.infer<typeof invalidPathEntrySchema>;

export const putAllowedPathsSuccessResponse = z.object({
  success: z.literal(true),
});
```

Create `apps/frontend/src/api/settings/file-access/file-access.ts`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {
  getAllowedPathsResponse,
  type InvalidPathEntry,
  putAllowedPathsSuccessResponse,
} from './validator.js';

const BASE = '/api/settings/file-access';

export type {InvalidPathEntry};

export async function getAllowedPaths(): Promise<AllowedPathEntry[]> {
  const res = await fetch(`${BASE}/allowed-paths`);
  if (!res.ok) {
    throw new Error(`Failed to fetch allowed paths: ${res.status.toString()}`);
  }
  const json: unknown = await res.json();
  const {allowedPaths} = getAllowedPathsResponse.parse(json);
  return allowedPaths;
}

export async function putAllowedPaths(
  allowedPaths: AllowedPathEntry[],
): Promise<void> {
  const res = await fetch(`${BASE}/allowed-paths`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({allowedPaths}),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to save allowed paths (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  putAllowedPathsSuccessResponse.parse(json);
}
```

Create `apps/frontend/src/api/settings/file-access/index.ts`:

```typescript
export {
  getAllowedPaths,
  type InvalidPathEntry,
  putAllowedPaths,
} from './file-access.js';
```

- [ ] **Step 2: Create the `useAllowedPaths` hook for settings**

Create `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getAllowedPaths,
  putAllowedPaths,
} from '@/api/settings/file-access/index.js';

export function useAllowedPaths() {
  const [paths, setPaths] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getAllowedPaths();
      setPaths(data);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const save = useCallback(
    async (entries: AllowedPathEntry[]) => {
      setIsSaving(true);
      setSaveError(null);
      try {
        await putAllowedPaths(entries);
        return true;
      } catch (e) {
        setSaveError(e instanceof Error ? e.message : 'Failed to save');
        return false;
      } finally {
        setIsSaving(false);
        await load();
      }
    },
    [load],
  );

  const addPath = useCallback((entry: AllowedPathEntry) => {
    setPaths((prev) => [...prev, entry]);
  }, []);

  const removePath = useCallback((index: number) => {
    setPaths((prev) => prev.filter((_, i) => i !== index));
  }, []);

  return {
    paths,
    setPaths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    save,
    addPath,
    removePath,
    reload: load,
  };
}
```

- [ ] **Step 3: Create the view component**

Create `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx` — a list of path entries with add/remove and save. Uses HeroUI components: `Button`, `TextField`, `Select`. Shows invalid path errors per-entry. Includes the info note about the system temp directory.

Create `apps/frontend/src/pages/settings/sections/file-access/styles.module.css` for layout styles.

This is a standard settings section view. Follow the same patterns as `AgentSectionFields` / `LlmSectionFields` but with array-of-objects management instead of scalar fields.

- [ ] **Step 4: Create the container component**

Create `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`:

```typescript
import {toast} from '@heroui/react';
import {useCallback} from 'react';

import {useAllowedPaths} from './hooks/useAllowedPaths.js';
import {FileAccessSectionView} from './FileAccessSectionView.js';

export function FileAccessSection() {
  const {
    paths,
    isLoading,
    loadError,
    isSaving,
    saveError,
    save,
    addPath,
    removePath,
    reload,
  } = useAllowedPaths();

  const handleSave = useCallback(async () => {
    const success = await save(paths);
    if (success) {
      toast.success('Allowed paths saved');
    } else {
      toast.danger('Failed to save allowed paths');
    }
  }, [save, paths]);

  return (
    <FileAccessSectionView
      paths={paths}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      saveError={saveError}
      onAdd={addPath}
      onRemove={removePath}
      onSave={() => {
        void handleSave();
      }}
      onRetry={() => {
        void reload();
      }}
    />
  );
}
```

Create `apps/frontend/src/pages/settings/sections/file-access/index.ts`:

```typescript
export {FileAccessSection} from './FileAccessSection.js';
```

- [ ] **Step 5: Add route and tab**

Modify `apps/frontend/src/routes.ts`:

```typescript
export const ROUTES = defineRoutes({
  dashboard: {},
  chat: {},
  tasks: {},
  settings: {llm: {}, agent: {}, search: {}, fileAccess: {}},
});
```

Modify `apps/frontend/src/pages/settings/SettingsPage.tsx` to add the tab:

```typescript
const TABS: SettingsTab[] = [
  {id: 'llm', label: 'LLM'},
  {id: 'agent', label: 'Agent'},
  {id: 'search', label: 'Search'},
  {id: 'fileAccess', label: 'File Access'},
];
```

And add to `TAB_TO_PATH`:

```typescript
fileAccess: ROUTES.settings.fileAccess(),
```

Modify `apps/frontend/src/router/lazy-pages.tsx` to add:

```typescript
export const FileAccessSection = lazy(async () => {
  const {FileAccessSection} =
    await import('@/pages/settings/sections/file-access/index.js');
  return {default: FileAccessSection};
});
```

Modify `apps/frontend/src/router/router.tsx` to add the route under settings children:

```typescript
{
  path: ROUTES.settings.fileAccess(),
  element: <FileAccessSection />,
},
```

Import `FileAccessSection` from `./lazy-pages.js`.

- [ ] **Step 6: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`

Expected: No errors.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/api/settings/file-access/ apps/frontend/src/pages/settings/sections/file-access/ apps/frontend/src/pages/settings/SettingsPage.tsx apps/frontend/src/routes.ts apps/frontend/src/router/
git commit -m "feat(frontend): add File Access settings tab with path management UI"
```

---

## Task 7: Frontend — update session creation API to accept workspace/extra paths

**Files:**

- Modify: `apps/frontend/src/api/chat/chat.ts`
- Modify: `apps/frontend/src/pages/chat/hooks/useSession.ts`

- [ ] **Step 1: Update `createSession` API function**

Modify `apps/frontend/src/api/chat/chat.ts`:

```typescript
interface CreateSessionOptions {
  workspace?: string;
  extraAllowedPaths?: string[];
}

export async function createSession(
  options: CreateSessionOptions = {},
): Promise<string> {
  const res = await fetch(`${BASE}/session`, {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(options),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to create session (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  const {sessionId} = createSessionResponse.parse(json);
  return sessionId;
}
```

- [ ] **Step 2: Update `useSession` hook**

Modify `apps/frontend/src/pages/chat/hooks/useSession.ts`:

```typescript
import {useCallback, useState} from 'react';

import {createSession} from '@/api/chat/index.js';

interface SessionConfig {
  workspace?: string;
  extraAllowedPaths?: string[];
}

export function useSession() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const resetSession = useCallback(async (config: SessionConfig = {}) => {
    setError(null);
    try {
      const id = await createSession(config);
      setSessionId(id);
      return id;
    } catch (e) {
      console.error('Failed to create session', e);
      const message =
        e instanceof Error ? e.message : 'Failed to create session';
      setError(message);
      return null;
    }
  }, []);

  const clearSessionError = useCallback(() => {
    setError(null);
  }, []);

  return {sessionId, sessionError: error, resetSession, clearSessionError};
}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`

Expected: Type errors in ChatPage.tsx because `resetSession` signature changed. We'll fix in the next task.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/api/chat/chat.ts apps/frontend/src/pages/chat/hooks/useSession.ts
git commit -m "feat(frontend): pass workspace and extra paths to session creation API"
```

---

## Task 8: Frontend — InfoBar component (replaces UsageBar)

**Files:**

- Create: `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/index.ts`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/AccessInfo.tsx`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/index.ts`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/UsageInfo.tsx`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/index.ts`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/styles.module.css`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.ts`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.test.ts`
- Delete: `apps/frontend/src/pages/chat/components/UsageBar/` (entire directory)

- [ ] **Step 1: Move `formatTokenCount` helper**

Create `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.ts` with the same content as the current file.

Create `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.test.ts` with the same test content.

- [ ] **Step 2: Create `UsageInfo` sub-component**

Create `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/UsageInfo.tsx`:

```typescript
import type {SseUsage} from '@omnicraft/sse-events';

import {formatTokenCount} from './helpers/format-token-count.js';
import styles from './styles.module.css';

interface UsageInfoProps {
  usage: SseUsage;
}

export function UsageInfo({usage}: UsageInfoProps) {
  const cacheRate =
    usage.inputTokens > 0
      ? Math.round((usage.cacheReadInputTokens / usage.inputTokens) * 100)
      : 0;

  return (
    <div className={styles.container}>
      <span className={styles.item}>
        Input: {formatTokenCount(usage.inputTokens)}
      </span>
      <span className={styles.item}>
        Output: {formatTokenCount(usage.outputTokens)}
      </span>
      <span className={styles.item}>
        Cached: {formatTokenCount(usage.cacheReadInputTokens)}
        <span className={styles.rate}> ({cacheRate}%)</span>
      </span>
    </div>
  );
}
```

- [ ] **Step 3: Create `AccessInfo` sub-component**

Create `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/AccessInfo.tsx`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {Chip, Separator, Tooltip} from '@heroui/react';

import styles from './styles.module.css';

interface AccessInfoProps {
  workspace: string;
  extraPaths: readonly AllowedPathEntry[];
}

export function AccessInfo({workspace, extraPaths}: AccessInfoProps) {
  return (
    <div className={styles.container}>
      <span className={styles.item}>Workspace: {workspace}</span>
      {extraPaths.length > 0 && (
        <>
          <Separator orientation='vertical' />
          <Tooltip delay={0}>
            <span className={styles.extraPaths}>
              {extraPaths.length} extra{' '}
              {extraPaths.length === 1 ? 'path' : 'paths'}
            </span>
            <Tooltip.Content>
              <div className={styles.tooltipContent}>
                {extraPaths.map((p) => (
                  <div key={p.path} className={styles.tooltipEntry}>
                    <span className={styles.tooltipPath}>{p.path}</span>
                    <Chip
                      size='sm'
                      color={p.mode === 'read-write' ? 'success' : 'default'}
                    >
                      {p.mode}
                    </Chip>
                  </div>
                ))}
              </div>
            </Tooltip.Content>
          </Tooltip>
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Create `InfoBar` container**

Create `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import type {SseUsage} from '@omnicraft/sse-events';

import {AccessInfo} from './components/AccessInfo/index.js';
import styles from './styles.module.css';
import {UsageInfo} from './components/UsageInfo/index.js';

interface InfoBarProps {
  workspace?: string;
  extraPaths?: readonly AllowedPathEntry[];
  usage: SseUsage | null;
}

export function InfoBar({workspace, extraPaths, usage}: InfoBarProps) {
  return (
    <div className={styles.container}>
      {workspace && (
        <AccessInfo workspace={workspace} extraPaths={extraPaths ?? []} />
      )}
      {usage && <UsageInfo usage={usage} />}
    </div>
  );
}
```

Create `apps/frontend/src/pages/chat/components/InfoBar/index.ts`:

```typescript
export {InfoBar} from './InfoBar.js';
```

- [ ] **Step 5: Create styles**

Create `apps/frontend/src/pages/chat/components/InfoBar/styles.module.css` (container only):

```css
.container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  padding: 4px 16px;
  font-size: 0.75em;
  color: var(--muted);
}
```

Create `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/styles.module.css`:

```css
.container {
  display: flex;
  gap: 12px;
}

.item {
  white-space: nowrap;
}

.rate {
  opacity: 0.7;
}
```

Create `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/styles.module.css`:

```css
.container {
  display: flex;
  align-items: center;
  gap: 8px;
}

.item {
  white-space: nowrap;
}

.extraPaths {
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.tooltipContent {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.tooltipEntry {
  display: flex;
  gap: 6px;
}

.tooltipPath {
  font-family: monospace;
}
```

Create `apps/frontend/src/pages/chat/components/InfoBar/components/AccessInfo/index.ts`:

```typescript
export {AccessInfo} from './AccessInfo.js';
```

Create `apps/frontend/src/pages/chat/components/InfoBar/components/UsageInfo/index.ts`:

```typescript
export {UsageInfo} from './UsageInfo.js';
```

- [ ] **Step 6: Delete UsageBar directory**

Delete the entire `apps/frontend/src/pages/chat/components/UsageBar/` directory.

- [ ] **Step 7: Run `formatTokenCount` tests**

Run: `cd apps/frontend && bun test src/pages/chat/components/InfoBar/components/UsageInfo/helpers/format-token-count.test.ts`

Expected: All pass.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/chat/components/InfoBar/
git rm -r apps/frontend/src/pages/chat/components/UsageBar/
git commit -m "feat(frontend): replace UsageBar with InfoBar (AccessInfo + UsageInfo)"
```

---

## Task 9: Frontend — SessionConfigBar and chat page integration

**Files:**

- Create: `apps/frontend/src/pages/chat/components/SessionConfigBar/SessionConfigBar.tsx`
- Create: `apps/frontend/src/pages/chat/components/SessionConfigBar/index.ts`
- Create: `apps/frontend/src/pages/chat/components/SessionConfigBar/styles.module.css`
- Create: `apps/frontend/src/pages/chat/hooks/useAllowedPaths.ts`
- Create: `apps/frontend/src/pages/chat/hooks/useSessionConfig.ts`
- Modify: `apps/frontend/src/pages/chat/ChatPage.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx`

- [ ] **Step 1: Create `useAllowedPaths` hook for chat page**

Create `apps/frontend/src/pages/chat/hooks/useAllowedPaths.ts`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {getAllowedPaths} from '@/api/settings/file-access/index.js';

export function useAllowedPaths() {
  const [paths, setPaths] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      setPaths(await getAllowedPaths());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load allowed paths');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return {paths, isLoading, error};
}
```

- [ ] **Step 2: Create `useSessionConfig` hook**

Create `apps/frontend/src/pages/chat/hooks/useSessionConfig.ts`:

```typescript
import {useCallback, useState} from 'react';

export function useSessionConfig() {
  const [workspace, setWorkspace] = useState<string | undefined>(undefined);
  const [extraAllowedPaths, setExtraAllowedPaths] = useState<string[]>([]);

  return {
    workspace,
    setWorkspace,
    extraAllowedPaths,
    setExtraAllowedPaths,
  };
}
```

- [ ] **Step 3: Create `SessionConfigBar`**

Create `apps/frontend/src/pages/chat/components/SessionConfigBar/SessionConfigBar.tsx` — contains:

- Workspace dropdown (HeroUI `Select` + `ListBox`, single select, filtered to `read-write` paths only — same pattern as `LlmSectionFields`)
- Extra Allowed Paths dropdown (HeroUI `Select` + `ListBox` with `selectionMode="multiple"`, all paths)
- Disclaimer text
- Warning/error messages based on state (loading, fetch error, no paths configured, no workspace selected)
- Link to Settings → File Access when no paths configured (use HeroUI `Link` or React Router `Link`)

Create `apps/frontend/src/pages/chat/components/SessionConfigBar/styles.module.css` for layout.

Create `apps/frontend/src/pages/chat/components/SessionConfigBar/index.ts`:

```typescript
export {SessionConfigBar} from './SessionConfigBar.js';
```

- [ ] **Step 4: Integrate into ChatPage and ChatPageView**

Modify `apps/frontend/src/pages/chat/ChatPage.tsx` to add the new hooks and pass config down:

```typescript
import {useAllowedPaths} from './hooks/useAllowedPaths.js';
import {useSessionConfig} from './hooks/useSessionConfig.js';

// Inside ChatPageContent:
const {
  paths: allowedPaths,
  isLoading: pathsLoading,
  error: pathsError,
} = useAllowedPaths();
const {workspace, setWorkspace, extraAllowedPaths, setExtraAllowedPaths} =
  useSessionConfig();
```

Pass `workspace` and `extraAllowedPaths` to `resetSession`:

```typescript
const {
  isStreaming,
  streamError,
  maxRoundsReached,
  sendMessage,
  stopGeneration,
  clearStreamError,
  clearMaxRoundsReached,
} = useStreamChat({
  sessionId,
  resetSession: async () => resetSession({workspace, extraAllowedPaths}),
});
```

Note: Check how `useStreamChat` calls `resetSession` and make sure the config is passed through correctly. The `resetSession` function in `useStreamChat` is called lazily on first send — the workspace/extraAllowedPaths values at that time will be captured.

Modify `apps/frontend/src/pages/chat/ChatPageView.tsx` to:

1. Replace `UsageBar` import with `InfoBar` import
2. Add `SessionConfigBar` import
3. Add new props for config state
4. Render `SessionConfigBar` when no session, `InfoBar` when session active
5. Remove the `UsageBar` conditional render

```typescript
import {InfoBar} from './components/InfoBar/index.js';
import {SessionConfigBar} from './components/SessionConfigBar/index.js';

// In the view:
{!sessionId && (
  <SessionConfigBar
    allowedPaths={allowedPaths}
    pathsLoading={pathsLoading}
    pathsError={pathsError}
    workspace={workspace}
    onWorkspaceChange={setWorkspace}
    extraAllowedPaths={extraAllowedPaths}
    onExtraAllowedPathsChange={setExtraAllowedPaths}
  />
)}
<InfoBar
  workspace={workspace}
  extraPaths={resolvedExtraPaths}
  usage={usage}
/>
<ChatInput ... />
```

- [ ] **Step 5: Run typecheck**

Run: `cd apps/frontend && bun run typecheck`

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/chat/
git commit -m "feat(frontend): add SessionConfigBar and integrate InfoBar in chat page"
```

---

## Task 10: Run full lint, format, and tests

**Files:** None (verification only)

- [ ] **Step 1: Run backend checks**

Run: `cd apps/backend && bun run lint && bun run typecheck && bun test`

Expected: All pass.

- [ ] **Step 2: Run frontend checks**

Run: `cd apps/frontend && bun run lint && bun run typecheck && bun test`

Expected: All pass.

- [ ] **Step 3: Run settings-schema checks**

Run: `cd packages/settings-schema && bun run typecheck && bun test`

Expected: All pass.

- [ ] **Step 4: Fix any issues found**

Address lint errors, type errors, or test failures.

- [ ] **Step 5: Final commit if fixes were needed**

```bash
git add -A
git commit -m "fix: address lint and type errors from workspace feature"
```
