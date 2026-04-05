# Workspace & Allowed Paths Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow users to configure accessible file paths in settings and select workspace/extra paths per chat session, replacing the hardcoded `os.tmpdir()` workspace and empty extra paths.

**Architecture:** New `fileAccess` settings schema section shared across frontend/backend via `@omnicraft/settings-schema`. Dedicated backend API for path validation (filesystem checks). Chat session creation accepts optional workspace/extra paths. Frontend gets a config bar on the chat page and a new settings tab.

**Tech Stack:** Zod (schema), Koa (backend API), React 19 + HeroUI v3 (frontend), CSS Modules (styling), Vitest (tests)

---

## File Structure

### New files

| File                                                                              | Responsibility                                                |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `packages/settings-schema/src/file-access/schema.ts`                              | Zod schema for `fileAccess` section + `AllowedPathEntry` type |
| `apps/backend/src/dispatcher/file-access-settings/index.ts`                       | Router export                                                 |
| `apps/backend/src/dispatcher/file-access-settings/path.ts`                        | Route path constants                                          |
| `apps/backend/src/dispatcher/file-access-settings/router.ts`                      | GET/PUT handlers for allowed paths                            |
| `apps/backend/src/dispatcher/file-access-settings/validator.ts`                   | Request body Zod schemas                                      |
| `apps/backend/src/services/file-access-settings/index.ts`                         | Service export                                                |
| `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`  | Read/write/validate allowed paths                             |
| `apps/backend/src/services/file-access-settings/helpers.ts`                       | Filesystem validation (exists, isDir, permissions)            |
| `apps/backend/src/services/file-access-settings/helpers.test.ts`                  | Tests for filesystem validation                               |
| `apps/backend/src/services/file-access-settings/types.ts`                         | Error types for validation results                            |
| `apps/backend/src/services/chat/validation.ts`                                    | Session creation path validation                              |
| `apps/backend/src/services/chat/validation.test.ts`                               | Tests for session creation validation                         |
| `apps/frontend/src/api/file-access-settings/file-access-settings.ts`              | Frontend API client for allowed paths                         |
| `apps/frontend/src/api/file-access-settings/index.ts`                             | API export                                                    |
| `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`     | Settings tab container                                        |
| `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx` | Settings tab view (path list, add row, save)                  |
| `apps/frontend/src/pages/settings/sections/file-access/index.ts`                  | Section export                                                |
| `apps/frontend/src/pages/settings/sections/file-access/styles.module.css`         | Section styles                                                |
| `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts`  | Hook for loading/saving allowed paths                         |
| `apps/frontend/src/pages/chat/components/SessionConfigBar/SessionConfigBar.tsx`   | Pre-session config bar (workspace + extra paths dropdowns)    |
| `apps/frontend/src/pages/chat/components/SessionConfigBar/index.ts`               | Component export                                              |
| `apps/frontend/src/pages/chat/components/SessionConfigBar/styles.module.css`      | Config bar styles                                             |
| `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx`                     | Post-session info bar container                               |
| `apps/frontend/src/pages/chat/components/InfoBar/AccessInfo.tsx`                  | Workspace + extra paths display with tooltip                  |
| `apps/frontend/src/pages/chat/components/InfoBar/UsageInfo.tsx`                   | Token usage display (extracted from UsageBar)                 |
| `apps/frontend/src/pages/chat/components/InfoBar/index.ts`                        | Component export                                              |
| `apps/frontend/src/pages/chat/components/InfoBar/styles.module.css`               | InfoBar styles                                                |
| `apps/frontend/src/pages/chat/hooks/useAllowedPaths.ts`                           | Hook to fetch allowed paths for chat page config              |
| `apps/frontend/src/pages/chat/hooks/useSessionConfig.ts`                          | Hook managing workspace/extra paths selection state           |

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
| `apps/frontend/src/pages/chat/components/UsageBar/helpers/format-token-count.ts`      | Moved to InfoBar helpers      |
| `apps/frontend/src/pages/chat/components/UsageBar/helpers/format-token-count.test.ts` | Moved to InfoBar helpers      |

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
export interface InvalidPathEntry {
  index: number;
  path: string;
  reason: string;
}
```

- [ ] **Step 2: Write failing tests for `validatePathsOnFilesystem`**

Create `apps/backend/src/services/file-access-settings/helpers.test.ts`:

```typescript
import os from 'node:os';
import fs from 'node:fs/promises';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {validatePathsOnFilesystem} from './helpers.js';

describe('validatePathsOnFilesystem', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'validate-paths-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true});
  });

  it('returns empty array for valid read-write directory', async () => {
    const result = await validatePathsOnFilesystem([
      {path: tempDir, mode: 'read-write'},
    ]);
    expect(result).toEqual([]);
  });

  it('returns empty array for valid read directory', async () => {
    const result = await validatePathsOnFilesystem([
      {path: tempDir, mode: 'read'},
    ]);
    expect(result).toEqual([]);
  });

  it('returns error for relative path', async () => {
    const result = await validatePathsOnFilesystem([
      {path: 'relative/path', mode: 'read'},
    ]);
    expect(result).toEqual([
      {index: 0, path: 'relative/path', reason: 'Path must be absolute'},
    ]);
  });

  it('returns error for non-existent path', async () => {
    const result = await validatePathsOnFilesystem([
      {path: '/nonexistent/path/xyz', mode: 'read'},
    ]);
    expect(result).toEqual([
      {
        index: 0,
        path: '/nonexistent/path/xyz',
        reason: 'Path does not exist',
      },
    ]);
  });

  it('returns error for file path (not directory)', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    await fs.writeFile(filePath, 'content');
    const result = await validatePathsOnFilesystem([
      {path: filePath, mode: 'read'},
    ]);
    expect(result).toEqual([
      {index: 0, path: filePath, reason: 'Path is not a directory'},
    ]);
  });

  it('validates multiple paths and returns errors with correct indices', async () => {
    const result = await validatePathsOnFilesystem([
      {path: tempDir, mode: 'read'},
      {path: '/nonexistent', mode: 'read-write'},
      {path: tempDir, mode: 'read-write'},
    ]);
    expect(result).toEqual([
      {index: 1, path: '/nonexistent', reason: 'Path does not exist'},
    ]);
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `cd apps/backend && bun test src/services/file-access-settings/helpers.test.ts`

Expected: FAIL — module not found.

- [ ] **Step 4: Implement `validatePathsOnFilesystem`**

Create `apps/backend/src/services/file-access-settings/helpers.ts`:

```typescript
import {constants} from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import type {InvalidPathEntry} from './types.js';

/**
 * Validates each path entry against the filesystem.
 * Returns an array of errors for invalid entries (empty if all valid).
 */
export async function validatePathsOnFilesystem(
  entries: readonly AllowedPathEntry[],
): Promise<InvalidPathEntry[]> {
  const errors: InvalidPathEntry[] = [];

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const reason = await validateSinglePath(entry);
    if (reason) {
      errors.push({index: i, path: entry.path, reason});
    }
  }

  return errors;
}

async function validateSinglePath(
  entry: AllowedPathEntry,
): Promise<string | null> {
  if (!path.isAbsolute(entry.path)) {
    return 'Path must be absolute';
  }

  let stat;
  try {
    stat = await fs.stat(entry.path);
  } catch {
    return 'Path does not exist';
  }

  if (!stat.isDirectory()) {
    return 'Path is not a directory';
  }

  const requiredFlags =
    entry.mode === 'read-write'
      ? constants.R_OK | constants.W_OK
      : constants.R_OK;

  try {
    await fs.access(entry.path, requiredFlags);
  } catch {
    return entry.mode === 'read-write'
      ? 'Path is not readable and writable'
      : 'Path is not readable';
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

import {validatePathsOnFilesystem} from './helpers.js';
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
    const errors = await validatePathsOnFilesystem(entries);
    if (errors.length > 0) {
      return {success: false, invalidPaths: errors};
    }

    await SettingsManager.getInstance().set(
      ['fileAccess', 'allowedPaths'],
      entries,
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

- [ ] **Step 7: Note on SettingsManager**

The service calls `SettingsManager.getInstance().set(['fileAccess', 'allowedPaths'], entries)`. However, the current `SettingsManager.set()` asserts the value is scalar and the path is a valid leaf. Since `fileAccess.allowedPaths` is an array (not a scalar leaf), we need to handle this.

Check if `isLeafSchemaPath` returns true for `['fileAccess', 'allowedPaths']`. If not, the service should use `SettingsManager.getAll()`, mutate the settings object, then persist via a method that writes the full object. Alternatively, add a `setRaw` method to `SettingsManager` that writes to any valid schema path.

The simplest approach: add a `setSection` method to `SettingsManager` that writes an entire section value (like `fileAccess`) after validating against the schema:

In `apps/backend/src/models/settings-manager/settings-manager.ts`, add:

```typescript
/**
 * Writes a value at an arbitrary schema path (not limited to leaf nodes).
 * Validates the full settings object after applying the change.
 */
async setAtPath(keyPath: string[], value: unknown): Promise<void> {
  await this.ioQueue.enqueue(async () => {
    const settings: Record<string, unknown> = await this.load();
    let target: Record<string, unknown> = settings;
    for (let i = 0; i < keyPath.length - 1; i++) {
      target = target[keyPath[i]] as Record<string, unknown>;
    }
    target[keyPath[keyPath.length - 1]] = value;
    const validated = settingsSchema.parse(settings);
    await this.save(validated);
  });
}
```

Then the service calls `SettingsManager.getInstance().setAtPath(['fileAccess', 'allowedPaths'], entries)`.

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
  WORKSPACE_NOT_IN_ALLOWED_PATHS = 'WORKSPACE_NOT_IN_ALLOWED_PATHS',
  WORKSPACE_NOT_READ_WRITE = 'WORKSPACE_NOT_READ_WRITE',
  EXTRA_PATH_NOT_FOUND = 'EXTRA_PATH_NOT_FOUND',
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
  if (
    !(await isAccessibleDirectory(workspace, constants.R_OK | constants.W_OK))
  ) {
    return CreateSessionError.WORKSPACE_PATH_NOT_FOUND;
  }

  const entry = allowedPaths.find((e) => e.path === workspace);
  if (!entry) {
    return CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS;
  }
  if (entry.mode !== 'read-write') {
    return CreateSessionError.WORKSPACE_NOT_READ_WRITE;
  }

  return null;
}

async function validateExtraPaths(
  extraPaths: readonly string[],
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  for (const extraPath of extraPaths) {
    const entry = allowedPaths.find((e) => e.path === extraPath);
    if (!entry) {
      return CreateSessionError.EXTRA_PATH_NOT_IN_ALLOWED_PATHS;
    }

    const requiredFlags =
      entry.mode === 'read-write'
        ? constants.R_OK | constants.W_OK
        : constants.R_OK;

    if (!(await isAccessibleDirectory(extraPath, requiredFlags))) {
      return CreateSessionError.EXTRA_PATH_NOT_FOUND;
    }
  }

  return null;
}

async function isAccessibleDirectory(
  dirPath: string,
  flags: number,
): Promise<boolean> {
  try {
    const stat = await fs.stat(dirPath);
    if (!stat.isDirectory()) return false;
    await fs.access(dirPath, flags);
    return true;
  } catch {
    return false;
  }
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

import {
  generateTitleFromLlm,
  getLlmConfig,
  truncateToTitle,
} from './helpers.js';
import type {CreateSessionResult, StreamCompletionResult} from './types.js';
import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';
import {fileAccessSettingsService} from '@/services/file-access-settings/index.js';

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
      const allowedPaths =
        await fileAccessSettingsService.getAllowedPaths();

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
        return entry!;
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

- Create: `apps/frontend/src/api/file-access-settings/file-access-settings.ts`
- Create: `apps/frontend/src/api/file-access-settings/index.ts`
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

Create `apps/frontend/src/api/file-access-settings/file-access-settings.ts`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';

const BASE = '/api/settings/file-access';

export interface InvalidPathEntry {
  index: number;
  path: string;
  reason: string;
}

export interface SaveAllowedPathsError {
  error: 'INVALID_PATHS';
  invalidPaths: InvalidPathEntry[];
}

export async function getAllowedPaths(): Promise<AllowedPathEntry[]> {
  const res = await fetch(`${BASE}/allowed-paths`);
  if (!res.ok) {
    throw new Error(`Failed to fetch allowed paths: ${res.status.toString()}`);
  }
  const body = (await res.json()) as {allowedPaths: AllowedPathEntry[]};
  return body.allowedPaths;
}

export async function putAllowedPaths(
  allowedPaths: AllowedPathEntry[],
): Promise<SaveAllowedPathsError | null> {
  const res = await fetch(`${BASE}/allowed-paths`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({allowedPaths}),
  });

  if (res.status === 422) {
    return (await res.json()) as SaveAllowedPathsError;
  }

  if (!res.ok) {
    throw new Error(`Failed to save allowed paths: ${res.status.toString()}`);
  }

  return null;
}
```

Create `apps/frontend/src/api/file-access-settings/index.ts`:

```typescript
export {
  getAllowedPaths,
  type InvalidPathEntry,
  putAllowedPaths,
  type SaveAllowedPathsError,
} from './file-access-settings.js';
```

- [ ] **Step 2: Create the `useAllowedPaths` hook for settings**

Create `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getAllowedPaths,
  type InvalidPathEntry,
  putAllowedPaths,
} from '@/api/file-access-settings/index.js';

export function useAllowedPaths() {
  const [paths, setPaths] = useState<AllowedPathEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [invalidPaths, setInvalidPaths] = useState<InvalidPathEntry[]>([]);

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

  const save = useCallback(async (entries: AllowedPathEntry[]) => {
    setIsSaving(true);
    setInvalidPaths([]);
    try {
      const error = await putAllowedPaths(entries);
      if (error) {
        setInvalidPaths(error.invalidPaths);
        return false;
      }
      setPaths(entries);
      return true;
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : 'Failed to save');
      return false;
    } finally {
      setIsSaving(false);
    }
  }, []);

  const addPath = useCallback((entry: AllowedPathEntry) => {
    setPaths((prev) => [...prev, entry]);
    setInvalidPaths([]);
  }, []);

  const removePath = useCallback((index: number) => {
    setPaths((prev) => prev.filter((_, i) => i !== index));
    setInvalidPaths([]);
  }, []);

  return {
    paths,
    setPaths,
    isLoading,
    loadError,
    isSaving,
    invalidPaths,
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
    invalidPaths,
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
      toast.danger('Some paths are invalid. Please fix the errors.');
    }
  }, [save, paths]);

  return (
    <FileAccessSectionView
      paths={paths}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      invalidPaths={invalidPaths}
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
git add apps/frontend/src/api/file-access-settings/ apps/frontend/src/pages/settings/sections/file-access/ apps/frontend/src/pages/settings/SettingsPage.tsx apps/frontend/src/routes.ts apps/frontend/src/router/
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

- Create: `apps/frontend/src/pages/chat/components/InfoBar/UsageInfo.tsx`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/AccessInfo.tsx`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/InfoBar.tsx`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/index.ts`
- Create: `apps/frontend/src/pages/chat/components/InfoBar/styles.module.css`
- Move: `format-token-count.ts` and its test into InfoBar helpers
- Delete: `apps/frontend/src/pages/chat/components/UsageBar/` (entire directory)

- [ ] **Step 1: Move `formatTokenCount` helper**

Create `apps/frontend/src/pages/chat/components/InfoBar/helpers/format-token-count.ts` with the same content as the current file.

Create `apps/frontend/src/pages/chat/components/InfoBar/helpers/format-token-count.test.ts` with the same test content.

- [ ] **Step 2: Create `UsageInfo` sub-component**

Create `apps/frontend/src/pages/chat/components/InfoBar/UsageInfo.tsx`:

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
    <div className={styles.usageInfo}>
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

Create `apps/frontend/src/pages/chat/components/InfoBar/AccessInfo.tsx`:

```typescript
import type {AllowedPathEntry} from '@omnicraft/settings-schema';
import {useState} from 'react';

import styles from './styles.module.css';

interface AccessInfoProps {
  workspace: string;
  extraPaths: readonly AllowedPathEntry[];
}

export function AccessInfo({workspace, extraPaths}: AccessInfoProps) {
  const [showTooltip, setShowTooltip] = useState(false);

  return (
    <div className={styles.accessInfo}>
      <span className={styles.item}>Workspace: {workspace}</span>
      {extraPaths.length > 0 && (
        <>
          <span className={styles.separator} />
          <span
            className={styles.extraPaths}
            onMouseEnter={() => {
              setShowTooltip(true);
            }}
            onMouseLeave={() => {
              setShowTooltip(false);
            }}
          >
            {extraPaths.length} extra {extraPaths.length === 1 ? 'path' : 'paths'}
            {showTooltip && (
              <div className={styles.tooltip}>
                {extraPaths.map((p) => (
                  <div key={p.path} className={styles.tooltipEntry}>
                    <span className={styles.tooltipPath}>{p.path}</span>
                    <span className={styles.tooltipMode}>({p.mode})</span>
                  </div>
                ))}
              </div>
            )}
          </span>
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

import {AccessInfo} from './AccessInfo.js';
import styles from './styles.module.css';
import {UsageInfo} from './UsageInfo.js';

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

Create `apps/frontend/src/pages/chat/components/InfoBar/styles.module.css`:

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

.accessInfo {
  display: flex;
  align-items: center;
  gap: 8px;
}

.usageInfo {
  display: flex;
  gap: 12px;
}

.item {
  white-space: nowrap;
}

.rate {
  opacity: 0.7;
}

.separator {
  width: 1px;
  height: 1em;
  background: currentColor;
  opacity: 0.3;
}

.extraPaths {
  position: relative;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
}

.tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 0;
  background: var(--color-surface);
  border: 1px solid var(--color-default-200);
  border-radius: 6px;
  padding: 8px 12px;
  font-size: 11px;
  white-space: nowrap;
  z-index: 10;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
}

.tooltipEntry {
  display: flex;
  gap: 6px;
}

.tooltipPath {
  font-family: monospace;
}

.tooltipMode {
  opacity: 0.7;
}
```

- [ ] **Step 6: Delete UsageBar directory**

Delete the entire `apps/frontend/src/pages/chat/components/UsageBar/` directory.

- [ ] **Step 7: Run `formatTokenCount` tests**

Run: `cd apps/frontend && bun test src/pages/chat/components/InfoBar/helpers/format-token-count.test.ts`

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

import {getAllowedPaths} from '@/api/file-access-settings/index.js';

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

  const toggleExtraPath = useCallback((path: string) => {
    setExtraAllowedPaths((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path],
    );
  }, []);

  return {
    workspace,
    setWorkspace,
    extraAllowedPaths,
    setExtraAllowedPaths,
    toggleExtraPath,
  };
}
```

- [ ] **Step 3: Create `SessionConfigBar`**

Create `apps/frontend/src/pages/chat/components/SessionConfigBar/SessionConfigBar.tsx` — contains:

- Workspace dropdown (HeroUI `Select`, single select, filtered to `read-write` paths only)
- Extra Allowed Paths dropdown (HeroUI `Select` with multi-select or `ListBox`, all paths)
- Disclaimer text
- Warning/error messages based on state (loading, fetch error, no paths configured, no workspace selected)
- Link to Settings → File Access when no paths configured

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
const {workspace, setWorkspace, extraAllowedPaths, toggleExtraPath} =
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
    onToggleExtraPath={toggleExtraPath}
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
