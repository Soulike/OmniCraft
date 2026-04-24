# Rename `allowedPaths` to `workspaces` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the `fileAccess.allowedPaths` settings concept to `fileAccess.workspaces` across the monorepo, and remove the `mode` (`read` / `read-write`) permission model. Every workspace is implicitly read-write.

**Architecture:** Bottom-up refactor. Update the two schema packages first (`settings-schema`, `api-schema`), then the backend (service + dispatcher + session validation + tests), then the frontend (API client, session config, session setup, settings UI). Each task groups changes that belong together. The repository only typechecks end-to-end at Task 5; within each task, lint/typecheck/test runs are scoped to the just-changed package(s).

**Tech Stack:** TypeScript monorepo, Bun, Zod, React 19, Koa, Vitest.

**Spec:** `docs/superpowers/specs/2026-04-24-rename-allowed-paths-to-workspaces-design.md`

---

## File map

### Created

None.

### Modified (schema packages)

- `packages/settings-schema/src/file-access/schema.ts`
- `packages/settings-schema/src/index.ts`
- `packages/api-schema/src/file-access/schema.ts`
- `packages/api-schema/src/index.ts`

### Modified (backend)

- `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`
- `apps/backend/src/services/file-access-settings/helpers.ts`
- `apps/backend/src/services/file-access-settings/helpers.test.ts`
- `apps/backend/src/services/file-access-settings/types.ts`
- `apps/backend/src/dispatcher/file-access-settings/path.ts`
- `apps/backend/src/dispatcher/file-access-settings/router.ts`
- `apps/backend/src/services/agent-session/validation.ts`
- `apps/backend/src/services/agent-session/validation.test.ts`
- `apps/backend/src/services/agent-session/agent-session-service.ts`
- `apps/backend/src/services/agent-session/types.ts`

### Modified (frontend)

- `apps/frontend/src/api/settings/file-access/file-access.ts`
- `apps/frontend/src/api/settings/file-access/index.ts`
- `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigContext.ts`
- `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigProvider.tsx`
- `apps/frontend/src/pages/coding/components/SessionSetup/SessionSetup.tsx`
- `apps/frontend/src/pages/coding/components/SessionSetup/SessionSetupView.tsx`
- `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/WorkspaceSelect.tsx`
- `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/WorkspaceSelectView.tsx`
- `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/hooks/useWorkspaceSelect.ts`
- `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`
- `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx`
- `apps/frontend/src/pages/settings/sections/file-access/components/PathList/PathList.tsx`
- `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/AddPathForm.tsx`
- `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/AddPathFormView.tsx`
- `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/hooks/useAddPathForm.ts`
- `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/styles.module.css`
- `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts` → rename file to `useWorkspaces.ts`

### Deleted

None (the renamed hook file is a rename, not a delete).

---

## Task 1: Rename in schema packages

**Goal:** Update `settings-schema` and `api-schema` together. After this commit, those two packages typecheck; backend and frontend do not (expected — fixed in later tasks).

**Files:**

- Modify: `packages/settings-schema/src/file-access/schema.ts`
- Modify: `packages/settings-schema/src/index.ts`
- Modify: `packages/api-schema/src/file-access/schema.ts`
- Modify: `packages/api-schema/src/index.ts`

- [ ] **Step 1: Rewrite `packages/settings-schema/src/file-access/schema.ts`**

Replace the entire file with:

```ts
import {z} from 'zod';

export const workspaceSchema = z.object({
  path: z.string().describe('Absolute directory path'),
});

export type Workspace = z.infer<typeof workspaceSchema>;

export const fileAccessSettingsSchema = z.object({
  workspaces: z
    .array(workspaceSchema)
    .describe('Configured workspaces')
    .default([]),
});
```

- [ ] **Step 2: Rewrite `packages/settings-schema/src/index.ts`**

Replace the entire file with:

```ts
export {
  fileAccessSettingsSchema,
  type Workspace,
  workspaceSchema,
} from './file-access/schema.js';
export {type Settings, settingsSchema} from './schema.js';
```

- [ ] **Step 3: Rewrite `packages/api-schema/src/file-access/schema.ts`**

Replace the entire file with:

```ts
import {workspaceSchema} from '@omnicraft/settings-schema';
import {z} from 'zod';

/** Schema for the GET /settings/file-access/workspaces response body. */
export const getWorkspacesResponseSchema = z.object({
  workspaces: z.array(workspaceSchema),
});

export type GetWorkspacesResponse = z.infer<typeof getWorkspacesResponseSchema>;

/** Schema for the PUT /settings/file-access/workspaces request body. */
export const putWorkspacesRequestSchema = z.object({
  workspaces: z.array(workspaceSchema),
});

export type PutWorkspacesRequest = z.infer<typeof putWorkspacesRequestSchema>;

/** Schema for the PUT /settings/file-access/workspaces success response body. */
export const putWorkspacesSuccessResponseSchema = z.object({
  success: z.literal(true),
});

export type PutWorkspacesSuccessResponse = z.infer<
  typeof putWorkspacesSuccessResponseSchema
>;

/** Schema for a single invalid path entry in error responses. */
export const invalidPathEntrySchema = z.object({
  path: z.string(),
  reason: z.string(),
});

export type InvalidPathEntry = z.infer<typeof invalidPathEntrySchema>;

/** Schema for the PUT /settings/file-access/workspaces error response body (422). */
export const invalidPathsResponseSchema = z.object({
  error: z.literal('INVALID_PATHS'),
  invalidPaths: z.array(invalidPathEntrySchema),
});

export type InvalidPathsResponse = z.infer<typeof invalidPathsResponseSchema>;
```

- [ ] **Step 4: Update `packages/api-schema/src/index.ts`**

Replace the `file-access/schema.js` re-export block (lines 20–31 in the original) with:

```ts
export {
  type GetWorkspacesResponse,
  getWorkspacesResponseSchema,
  type InvalidPathEntry,
  invalidPathEntrySchema,
  type InvalidPathsResponse,
  invalidPathsResponseSchema,
  type PutWorkspacesRequest,
  putWorkspacesRequestSchema,
  type PutWorkspacesSuccessResponse,
  putWorkspacesSuccessResponseSchema,
} from './file-access/schema.js';
```

Leave the rest of the file unchanged.

- [ ] **Step 5: Typecheck both schema packages**

Run:

```bash
cd /Users/jingyaozhou/.superset/worktrees/OmniCraft/sudsy-dugong
bun run --filter '@omnicraft/settings-schema' typecheck
bun run --filter '@omnicraft/api-schema' typecheck
```

Expected: both pass.

- [ ] **Step 6: Run settings-schema test**

Run:

```bash
bun run --filter '@omnicraft/settings-schema' test
```

Expected: `settingsSchema` JSON-Schema conversion test passes (the test in `schema.test.ts` doesn't assert structural field names, so no update needed).

- [ ] **Step 7: Commit**

```bash
git add packages/settings-schema/src packages/api-schema/src
git commit -m "$(cat <<'EOF'
refactor(schema): rename allowedPaths to workspaces and drop access mode

Drop the read / read-write permission model; every workspace is
implicitly read-write. Rename Zod schemas and types accordingly.
EOF
)"
```

---

## Task 2: Rename in backend

**Goal:** Update all backend code that consumed the old schema names, including the `CreateSessionError` enum and tests. After this task, backend typechecks, lints, and tests pass.

**Files:**

- Modify: `apps/backend/src/services/file-access-settings/types.ts`
- Modify: `apps/backend/src/services/file-access-settings/helpers.ts`
- Modify: `apps/backend/src/services/file-access-settings/helpers.test.ts`
- Modify: `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`
- Modify: `apps/backend/src/dispatcher/file-access-settings/path.ts`
- Modify: `apps/backend/src/dispatcher/file-access-settings/router.ts`
- Modify: `apps/backend/src/services/agent-session/types.ts`
- Modify: `apps/backend/src/services/agent-session/validation.ts`
- Modify: `apps/backend/src/services/agent-session/validation.test.ts`
- Modify: `apps/backend/src/services/agent-session/agent-session-service.ts`

- [ ] **Step 1: Rewrite `apps/backend/src/services/file-access-settings/types.ts`**

Replace the entire file with:

```ts
export enum PathValidationError {
  NOT_ABSOLUTE = 'NOT_ABSOLUTE',
  DUPLICATE = 'DUPLICATE',
  NOT_FOUND = 'NOT_FOUND',
  NOT_DIRECTORY = 'NOT_DIRECTORY',
  NOT_ACCESSIBLE = 'NOT_ACCESSIBLE',
}

export interface InvalidPathEntry {
  path: string;
  reason: PathValidationError;
}
```

- [ ] **Step 2: Rewrite `apps/backend/src/services/file-access-settings/helpers.ts`**

Replace the entire file with:

```ts
import {constants} from 'node:fs';
import path from 'node:path';

import type {Workspace} from '@omnicraft/settings-schema';

import {checkDirectoryAccess} from '@/helpers/fs.js';

import {type InvalidPathEntry, PathValidationError} from './types.js';

/**
 * Validates workspace entries for duplicates and filesystem access.
 * Normalizes absolute paths before dedup and storage.
 * Returns the normalized entries and an array of errors (empty if all valid).
 */
export async function normalizeAndValidatePaths(
  entries: readonly Workspace[],
): Promise<{normalized: Workspace[]; errors: InvalidPathEntry[]}> {
  const errors: InvalidPathEntry[] = [];
  const seen = new Set<string>();
  const normalized: Workspace[] = [];

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

    const reason = await validateSinglePath(resolvedPath);
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
): Promise<PathValidationError | null> {
  const fsError = await checkDirectoryAccess(
    resolvedPath,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found') return PathValidationError.NOT_FOUND;
  if (fsError === 'not_directory') return PathValidationError.NOT_DIRECTORY;
  if (fsError === 'not_accessible') return PathValidationError.NOT_ACCESSIBLE;

  return null;
}
```

- [ ] **Step 3: Rewrite `apps/backend/src/services/file-access-settings/helpers.test.ts`**

Replace the entire file with:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
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

  it('returns empty errors for valid directory', async () => {
    const {errors} = await normalizeAndValidatePaths([{path: tempDir}]);
    expect(errors).toEqual([]);
  });

  it('returns error for duplicate paths', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir},
      {path: tempDir},
    ]);
    expect(errors).toEqual([
      {path: tempDir, reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('normalizes paths before dedup check', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir},
      {path: tempDir + '/'},
    ]);
    expect(errors).toEqual([
      {path: tempDir + '/', reason: PathValidationError.DUPLICATE},
    ]);
  });

  it('returns normalized paths', async () => {
    const {normalized} = await normalizeAndValidatePaths([
      {path: tempDir + '/'},
    ]);
    expect(normalized[0].path).toBe(tempDir);
  });

  it('returns normalized paths only for valid entries', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {normalized, errors} = await normalizeAndValidatePaths([
      {path: tempDir + '/'},
      {path: '/nonexistent'},
      {path: subDir},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
    expect(normalized).toEqual([{path: tempDir}, {path: subDir}]);
  });

  it('rejects relative path before normalization', async () => {
    const {errors} = await normalizeAndValidatePaths([{path: 'relative/path'}]);
    expect(errors).toEqual([
      {path: 'relative/path', reason: PathValidationError.NOT_ABSOLUTE},
    ]);
  });

  it('returns error for non-existent path', async () => {
    const {errors} = await normalizeAndValidatePaths([
      {path: '/nonexistent/path/xyz'},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent/path/xyz', reason: PathValidationError.NOT_FOUND},
    ]);
  });

  it('returns error for file path (not directory)', async () => {
    const filePath = path.join(tempDir, 'file.txt');
    await fs.writeFile(filePath, 'content');
    const {errors} = await normalizeAndValidatePaths([{path: filePath}]);
    expect(errors).toEqual([
      {path: filePath, reason: PathValidationError.NOT_DIRECTORY},
    ]);
  });

  it('validates multiple paths and returns errors for invalid ones', async () => {
    const subDir = path.join(tempDir, 'sub');
    await fs.mkdir(subDir);
    const {errors} = await normalizeAndValidatePaths([
      {path: tempDir},
      {path: '/nonexistent'},
      {path: subDir},
    ]);
    expect(errors).toEqual([
      {path: '/nonexistent', reason: PathValidationError.NOT_FOUND},
    ]);
  });
});
```

- [ ] **Step 4: Rewrite `apps/backend/src/services/file-access-settings/file-access-settings-service.ts`**

Replace the entire file with:

```ts
import type {Workspace} from '@omnicraft/settings-schema';

import {SettingsManager} from '@/models/settings-manager/index.js';

import {normalizeAndValidatePaths} from './helpers.js';
import type {InvalidPathEntry} from './types.js';

export type SaveWorkspacesResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]};

export const fileAccessSettingsService = {
  async getWorkspaces(): Promise<readonly Workspace[]> {
    const settings = await SettingsManager.getInstance().getAll();
    return settings.fileAccess.workspaces;
  },

  async setWorkspaces(entries: Workspace[]): Promise<SaveWorkspacesResult> {
    const {normalized, errors} = await normalizeAndValidatePaths(entries);
    if (errors.length > 0) {
      return {success: false, invalidPaths: errors};
    }

    await SettingsManager.getInstance().set(
      ['fileAccess', 'workspaces'],
      normalized,
    );
    return {success: true};
  },
};
```

- [ ] **Step 5: Rewrite `apps/backend/src/dispatcher/file-access-settings/path.ts`**

Replace the entire file with:

```ts
export const FILE_ACCESS_WORKSPACES = '/settings/file-access/workspaces';
```

- [ ] **Step 6: Rewrite `apps/backend/src/dispatcher/file-access-settings/router.ts`**

Replace the entire file with:

```ts
import Router from '@koa/router';
import {putWorkspacesRequestSchema} from '@omnicraft/api-schema';
import {StatusCodes} from 'http-status-codes';
import {ZodError} from 'zod';

import {fileAccessSettingsService} from '@/services/file-access-settings/index.js';

import {FILE_ACCESS_WORKSPACES} from './path.js';

const router = new Router();

/** GET /settings/file-access/workspaces — returns the current workspaces. */
router.get(FILE_ACCESS_WORKSPACES, async (ctx) => {
  const workspaces = await fileAccessSettingsService.getWorkspaces();
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = {workspaces};
});

/** PUT /settings/file-access/workspaces — validates and saves workspaces. */
router.put(FILE_ACCESS_WORKSPACES, async (ctx) => {
  let workspaces;
  try {
    const body = putWorkspacesRequestSchema.parse(ctx.request.body);
    workspaces = body.workspaces;
  } catch (e) {
    if (e instanceof ZodError) {
      ctx.response.status = StatusCodes.BAD_REQUEST;
      ctx.response.body = {error: e.issues};
      return;
    }
    throw e;
  }

  const result = await fileAccessSettingsService.setWorkspaces(workspaces);

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

- [ ] **Step 7: Rewrite `apps/backend/src/services/agent-session/types.ts`**

Replace the entire file with:

```ts
/** Reasons why session creation can fail. */
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
  WORKSPACE_PATH_NOT_FOUND = 'WORKSPACE_PATH_NOT_FOUND',
  WORKSPACE_PATH_NOT_DIRECTORY = 'WORKSPACE_PATH_NOT_DIRECTORY',
  WORKSPACE_PATH_NOT_ACCESSIBLE = 'WORKSPACE_PATH_NOT_ACCESSIBLE',
  WORKSPACE_NOT_CONFIGURED = 'WORKSPACE_NOT_CONFIGURED',
}

/** Result of createSession: either success with sessionId, or failure with error. */
export type CreateSessionResult =
  | {success: true; sessionId: string}
  | {success: false; error: CreateSessionError};
```

`WORKSPACE_NOT_IN_ALLOWED_PATHS` is renamed to `WORKSPACE_NOT_CONFIGURED`. `WORKSPACE_NOT_READ_WRITE` is removed.

- [ ] **Step 8: Rewrite `apps/backend/src/services/agent-session/validation.ts`**

Replace the entire file with:

```ts
import {constants} from 'node:fs';

import type {Workspace} from '@omnicraft/settings-schema';

import {checkDirectoryAccess} from '@/helpers/fs.js';

import {CreateSessionError} from './types.js';

/**
 * Validates workspace against settings and filesystem.
 * Returns null if valid, or the error found.
 */
export async function validateSessionPaths(
  workspace: string,
  workspaces: readonly Workspace[],
): Promise<CreateSessionError | null> {
  const entry = workspaces.find((w) => w.path === workspace);
  if (!entry) return CreateSessionError.WORKSPACE_NOT_CONFIGURED;

  const fsError = await checkDirectoryAccess(
    workspace,
    constants.R_OK | constants.W_OK,
  );
  if (fsError === 'not_found') {
    return CreateSessionError.WORKSPACE_PATH_NOT_FOUND;
  }
  if (fsError === 'not_directory') {
    return CreateSessionError.WORKSPACE_PATH_NOT_DIRECTORY;
  }
  if (fsError === 'not_accessible') {
    return CreateSessionError.WORKSPACE_PATH_NOT_ACCESSIBLE;
  }

  return null;
}
```

- [ ] **Step 9: Rewrite `apps/backend/src/services/agent-session/validation.test.ts`**

Replace the entire file with:

```ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import type {Workspace} from '@omnicraft/settings-schema';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CreateSessionError} from './types.js';
import {validateSessionPaths} from './validation.js';

describe('validateSessionPaths', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'session-validation-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, {recursive: true});
  });

  const makeWorkspaces = (...entries: Workspace[]) => entries;

  it('returns null for valid workspace', async () => {
    const workspaces = makeWorkspaces({path: tempDir});
    const result = await validateSessionPaths(tempDir, workspaces);
    expect(result).toBeNull();
  });

  it('returns WORKSPACE_PATH_NOT_FOUND for non-existent workspace', async () => {
    const workspaces = makeWorkspaces({path: '/nonexistent'});
    const result = await validateSessionPaths('/nonexistent', workspaces);
    expect(result).toBe(CreateSessionError.WORKSPACE_PATH_NOT_FOUND);
  });

  it('returns WORKSPACE_NOT_CONFIGURED for workspace not in list', async () => {
    const workspaces = makeWorkspaces({path: '/some/other'});
    const result = await validateSessionPaths(tempDir, workspaces);
    expect(result).toBe(CreateSessionError.WORKSPACE_NOT_CONFIGURED);
  });
});
```

The `WORKSPACE_NOT_READ_WRITE` case is removed entirely.

- [ ] **Step 10: Update `apps/backend/src/services/agent-session/agent-session-service.ts`**

Inside the `createSession` method, change the `validateSessionPaths` call site. Replace:

```ts
if (options.workspace !== undefined) {
  const settings = await SettingsManager.getInstance().getAll();
  const validationError = await validateSessionPaths(
    options.workspace,
    settings.fileAccess.allowedPaths,
  );
  if (validationError) {
    return {success: false, error: validationError};
  }
}
```

With:

```ts
if (options.workspace !== undefined) {
  const settings = await SettingsManager.getInstance().getAll();
  const validationError = await validateSessionPaths(
    options.workspace,
    settings.fileAccess.workspaces,
  );
  if (validationError) {
    return {success: false, error: validationError};
  }
}
```

Only `allowedPaths` → `workspaces` on line 63. Leave everything else in this file untouched.

- [ ] **Step 11: Run backend typecheck, lint, and tests**

Run:

```bash
bun run --filter '@omnicraft/backend' typecheck
bun run --filter '@omnicraft/backend' lint
bun run --filter '@omnicraft/backend' test
```

Expected: all pass.

- [ ] **Step 12: Commit**

```bash
git add apps/backend/src
git commit -m "$(cat <<'EOF'
refactor(backend): rename allowedPaths to workspaces and drop mode

Align service, dispatcher route, validation, and CreateSessionError
with the new workspaces schema. All workspaces are validated as
read-write directories; the per-entry mode is gone.
EOF
)"
```

---

## Task 3: Rename in frontend API client and session config

**Goal:** Update the frontend API client and the session-setup/workspace-select consumers. Settings UI is handled in Task 4.

**Files:**

- Modify: `apps/frontend/src/api/settings/file-access/file-access.ts`
- Modify: `apps/frontend/src/api/settings/file-access/index.ts`
- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigContext.ts`
- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigProvider.tsx`
- Modify: `apps/frontend/src/pages/coding/components/SessionSetup/SessionSetup.tsx`
- Modify: `apps/frontend/src/pages/coding/components/SessionSetup/SessionSetupView.tsx`
- Modify: `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/WorkspaceSelect.tsx`
- Modify: `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/WorkspaceSelectView.tsx`
- Modify: `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/hooks/useWorkspaceSelect.ts`

- [ ] **Step 1: Rewrite `apps/frontend/src/api/settings/file-access/file-access.ts`**

Replace the entire file with:

```ts
import {
  getWorkspacesResponseSchema,
  type InvalidPathEntry,
  invalidPathsResponseSchema,
  putWorkspacesSuccessResponseSchema,
} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {StatusCodes} from 'http-status-codes';

const BASE = '/api/settings/file-access';

export type {InvalidPathEntry};

export class InvalidPathsError extends Error {
  readonly invalidPaths: readonly InvalidPathEntry[];

  constructor(invalidPaths: readonly InvalidPathEntry[]) {
    super('Some paths are invalid');
    this.name = 'InvalidPathsError';
    this.invalidPaths = invalidPaths;
  }
}

export async function getWorkspaces(): Promise<Workspace[]> {
  const res = await fetch(`${BASE}/workspaces`);
  if (!res.ok) {
    throw new Error(`Failed to fetch workspaces: ${res.status.toString()}`);
  }
  const json: unknown = await res.json();
  const {workspaces} = getWorkspacesResponseSchema.parse(json);
  return workspaces;
}

export async function putWorkspaces(workspaces: Workspace[]): Promise<void> {
  const res = await fetch(`${BASE}/workspaces`, {
    method: 'PUT',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({workspaces}),
  });

  if (res.status === (StatusCodes.UNPROCESSABLE_ENTITY as number)) {
    const json: unknown = await res.json();
    const {invalidPaths} = invalidPathsResponseSchema.parse(json);
    throw new InvalidPathsError(invalidPaths);
  }

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to save workspaces (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  putWorkspacesSuccessResponseSchema.parse(json);
}
```

- [ ] **Step 2: Rewrite `apps/frontend/src/api/settings/file-access/index.ts`**

Replace the entire file with:

```ts
export {
  getWorkspaces,
  type InvalidPathEntry,
  InvalidPathsError,
  putWorkspaces,
} from './file-access.js';
```

- [ ] **Step 3: Rewrite `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigContext.ts`**

Replace the entire file with:

```ts
import type {Workspace} from '@omnicraft/settings-schema';
import {createContext} from 'react';

interface SessionConfigContextValue {
  readonly workspaces: readonly Workspace[];
  readonly isLoading: boolean;
  readonly loadError: unknown;
  readonly selectedWorkspace: string | undefined;
  readonly setSelectedWorkspace: (workspace: string | undefined) => void;
}

export type {SessionConfigContextValue};
export const SessionConfigContext =
  createContext<SessionConfigContextValue | null>(null);
```

- [ ] **Step 4: Rewrite `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigProvider.tsx`**

Replace the entire file with:

```tsx
import type {Workspace} from '@omnicraft/settings-schema';
import {type ReactNode, useCallback, useEffect, useMemo, useState} from 'react';

import {getWorkspaces} from '@/api/settings/file-access/index.js';

import {SessionConfigContext} from './SessionConfigContext.js';

export function SessionConfigProvider({children}: {children: ReactNode}) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [selectedWorkspace, setSelectedWorkspace] = useState<
    string | undefined
  >(undefined);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setWorkspaces(await getWorkspaces());
    } catch (e) {
      setLoadError(e);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const value = useMemo(
    () => ({
      workspaces,
      isLoading,
      loadError,
      selectedWorkspace,
      setSelectedWorkspace,
    }),
    [workspaces, isLoading, loadError, selectedWorkspace],
  );

  return <SessionConfigContext value={value}>{children}</SessionConfigContext>;
}
```

- [ ] **Step 5: Rewrite `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/hooks/useWorkspaceSelect.ts`**

Replace the entire file with:

```ts
import {useSessionConfig} from '@/modules/chat-session/index.js';

export function useWorkspaceSelect() {
  const {workspaces, isLoading, selectedWorkspace, setSelectedWorkspace} =
    useSessionConfig();

  return {
    isLoading,
    workspaces,
    selectedWorkspace,
    setSelectedWorkspace,
  };
}
```

The `readWritePaths` filter (`mode === 'read-write'`) is gone — every workspace is selectable.

- [ ] **Step 6: Rewrite `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/WorkspaceSelectView.tsx`**

Replace the entire file with:

```tsx
import {Button, Label, ListBox, Select, Spinner, Tooltip} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';
import {Info} from 'lucide-react';

import styles from './styles.module.css';

interface WorkspaceSelectViewProps {
  readonly isLoading: boolean;
  readonly workspaces: readonly Workspace[];
  readonly selectedWorkspace: string | undefined;
  readonly onWorkspaceChange: (value: string | undefined) => void;
}

export function WorkspaceSelectView({
  isLoading,
  workspaces,
  selectedWorkspace,
  onWorkspaceChange,
}: WorkspaceSelectViewProps) {
  return (
    <Select
      isDisabled={isLoading || workspaces.length === 0}
      value={selectedWorkspace ?? ''}
      onChange={(value) => {
        onWorkspaceChange(value ? String(value) : undefined);
      }}
    >
      <Label>
        <span className={styles.labelContent}>
          Workspace
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='Workspace info'
              >
                <Info size={12} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>Directory the agent works in</p>
            </Tooltip.Content>
          </Tooltip>
          {isLoading && <Spinner size='sm' />}
        </span>
      </Label>
      <Select.Trigger>
        <Select.Value />
        <Select.Indicator />
      </Select.Trigger>
      <Select.Popover>
        <ListBox>
          <ListBox.Item id='' textValue='None'>
            None
            <ListBox.ItemIndicator />
          </ListBox.Item>
          {workspaces.map((entry) => (
            <ListBox.Item
              key={entry.path}
              id={entry.path}
              textValue={entry.path}
            >
              {entry.path}
              <ListBox.ItemIndicator />
            </ListBox.Item>
          ))}
        </ListBox>
      </Select.Popover>
    </Select>
  );
}
```

- [ ] **Step 7: Rewrite `apps/frontend/src/pages/coding/components/SessionSetup/components/WorkspaceSelect/WorkspaceSelect.tsx`**

Replace the entire file with:

```tsx
import {useWorkspaceSelect} from './hooks/useWorkspaceSelect.js';
import {WorkspaceSelectView} from './WorkspaceSelectView.js';

export function WorkspaceSelect() {
  const {isLoading, workspaces, selectedWorkspace, setSelectedWorkspace} =
    useWorkspaceSelect();

  return (
    <WorkspaceSelectView
      isLoading={isLoading}
      workspaces={workspaces}
      selectedWorkspace={selectedWorkspace}
      onWorkspaceChange={setSelectedWorkspace}
    />
  );
}
```

- [ ] **Step 8: Rewrite `apps/frontend/src/pages/coding/components/SessionSetup/SessionSetup.tsx`**

Replace the entire file with:

```tsx
import {useSessionConfig} from '@/modules/chat-session/index.js';

import {SessionSetupView} from './SessionSetupView.js';

export function SessionSetup() {
  const {workspaces, isLoading, loadError, selectedWorkspace} =
    useSessionConfig();

  const hasConfiguredWorkspaces =
    !isLoading && !loadError && workspaces.length > 0;

  return (
    <SessionSetupView
      isLoading={isLoading}
      loadError={loadError}
      hasConfiguredWorkspaces={hasConfiguredWorkspaces}
      selectedWorkspace={selectedWorkspace}
    />
  );
}
```

- [ ] **Step 9: Rewrite `apps/frontend/src/pages/coding/components/SessionSetup/SessionSetupView.tsx`**

Replace the entire file with:

```tsx
import {Alert} from '@heroui/react';
import {Link} from 'react-router';

import {ROUTES} from '@/routes.js';

import {WorkspaceSelect} from './components/WorkspaceSelect/index.js';
import styles from './styles.module.css';

interface SessionSetupViewProps {
  readonly isLoading: boolean;
  readonly loadError: unknown;
  readonly hasConfiguredWorkspaces: boolean;
  readonly selectedWorkspace: string | undefined;
}

export function SessionSetupView({
  isLoading,
  loadError,
  hasConfiguredWorkspaces,
  selectedWorkspace,
}: SessionSetupViewProps) {
  return (
    <div className={styles.container}>
      <p className={styles.welcomeText}>
        Configure workspace for this session below,
        <br />
        or start chatting right away. 🚀
      </p>

      <div className={styles.dropdowns}>
        <WorkspaceSelect />
      </div>

      {loadError !== null && (
        <Alert status='danger'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              Failed to load workspaces from settings.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {!isLoading && !loadError && !hasConfiguredWorkspaces && (
        <Alert status='warning'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              No workspaces configured.{' '}
              <Link
                className={styles.settingsLink}
                to={ROUTES.settings.fileAccess()}
              >
                Configure in Settings &rarr; File Access
              </Link>
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}

      {hasConfiguredWorkspaces && !selectedWorkspace && (
        <Alert status='warning'>
          <Alert.Indicator />
          <Alert.Content>
            <Alert.Description>
              No workspace configured for this session.
            </Alert.Description>
          </Alert.Content>
        </Alert>
      )}
    </div>
  );
}
```

Section title text `Configure in Settings → File Access` is kept intentionally — the settings section title itself is unchanged (spec decision).

- [ ] **Step 10: Do not commit yet**

This task does not commit by itself; the frontend will not typecheck until Task 4 finishes (the settings UI still references the old hook and types). Proceed directly to Task 4.

---

## Task 4: Rename in frontend settings UI

**Goal:** Finish the frontend by updating the settings section that edits workspaces. After this task the frontend typechecks, lints, builds, and tests pass.

**Files:**

- Modify: `apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts` — rename file to `useWorkspaces.ts`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/components/PathList/PathList.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/AddPathForm.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/AddPathFormView.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/hooks/useAddPathForm.ts`
- Modify: `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/styles.module.css`

- [ ] **Step 1: Rename hook file**

Run:

```bash
git mv apps/frontend/src/pages/settings/sections/file-access/hooks/useAllowedPaths.ts \
       apps/frontend/src/pages/settings/sections/file-access/hooks/useWorkspaces.ts
```

- [ ] **Step 2: Rewrite `apps/frontend/src/pages/settings/sections/file-access/hooks/useWorkspaces.ts`**

Replace the entire file with:

```ts
import type {Workspace} from '@omnicraft/settings-schema';
import {useCallback, useEffect, useState} from 'react';

import {
  getWorkspaces,
  type InvalidPathEntry,
  InvalidPathsError,
  putWorkspaces,
} from '@/api/settings/file-access/index.js';

export type SaveResult =
  | {success: true}
  | {success: false; invalidPaths: InvalidPathEntry[]}
  | {success: false; error: string};

export function useWorkspaces() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      const data = await getWorkspaces();
      setWorkspaces(data);
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
    async (entries: Workspace[]): Promise<SaveResult> => {
      setIsSaving(true);
      try {
        await putWorkspaces(entries);
        await load();
        return {success: true};
      } catch (e) {
        if (e instanceof InvalidPathsError) {
          await load();
          return {success: false, invalidPaths: [...e.invalidPaths]};
        }
        await load();
        return {
          success: false,
          error: e instanceof Error ? e.message : 'Failed to save',
        };
      } finally {
        setIsSaving(false);
      }
    },
    [load],
  );

  const addWorkspace = useCallback(
    (entry: Workspace) => save([...workspaces, entry]),
    [workspaces, save],
  );

  const removeWorkspace = useCallback(
    (index: number) => save(workspaces.filter((_, i) => i !== index)),
    [workspaces, save],
  );

  return {
    workspaces,
    isLoading,
    loadError,
    isSaving,
    addWorkspace,
    removeWorkspace,
    reload: load,
  };
}
```

- [ ] **Step 3: Rewrite `apps/frontend/src/pages/settings/sections/file-access/FileAccessSection.tsx`**

Replace the entire file with:

```tsx
import {toast} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';
import {useCallback} from 'react';

import {FileAccessSectionView} from './FileAccessSectionView.js';
import {type SaveResult, useWorkspaces} from './hooks/useWorkspaces.js';

function showSaveResultToast(result: SaveResult) {
  if (result.success) {
    toast.success('Workspaces saved');
    return;
  }
  if ('invalidPaths' in result) {
    const details = result.invalidPaths
      .map((p) => `${p.path}: ${p.reason}`)
      .join('\n');
    toast.danger(details);
    return;
  }
  toast.danger(result.error);
}

export function FileAccessSection() {
  const {
    workspaces,
    isLoading,
    loadError,
    isSaving,
    addWorkspace,
    removeWorkspace,
    reload,
  } = useWorkspaces();

  const handleAdd = useCallback(
    async (entry: Workspace) => {
      showSaveResultToast(await addWorkspace(entry));
    },
    [addWorkspace],
  );

  const handleRemove = useCallback(
    async (index: number) => {
      showSaveResultToast(await removeWorkspace(index));
    },
    [removeWorkspace],
  );

  return (
    <FileAccessSectionView
      workspaces={workspaces}
      isLoading={isLoading}
      loadError={loadError}
      isSaving={isSaving}
      onAdd={(entry) => {
        void handleAdd(entry);
      }}
      onRemove={(index) => {
        void handleRemove(index);
      }}
      onRetry={() => {
        void reload();
      }}
    />
  );
}
```

- [ ] **Step 4: Rewrite `apps/frontend/src/pages/settings/sections/file-access/FileAccessSectionView.tsx`**

Replace the entire file with:

```tsx
import {Skeleton} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';

import {LoadError} from '@/components/LoadError/index.js';

import {AddPathForm} from './components/AddPathForm/index.js';
import {PathList} from './components/PathList/index.js';
import styles from './styles.module.css';

interface FileAccessSectionViewProps {
  workspaces: Workspace[];
  isLoading: boolean;
  loadError: string | null;
  isSaving: boolean;
  onAdd: (entry: Workspace) => void;
  onRemove: (index: number) => void;
  onRetry: () => void;
}

export function FileAccessSectionView({
  workspaces,
  isLoading,
  loadError,
  isSaving,
  onAdd,
  onRemove,
  onRetry,
}: FileAccessSectionViewProps) {
  return (
    <div className={styles.section}>
      <h2 className={styles.title}>File Access</h2>
      {isLoading ? (
        <div className={styles.skeletonContainer}>
          {Array.from({length: 3}).map((_, i) => (
            <Skeleton
              key={`skeleton-${i.toString()}`}
              className={styles.skeletonRow}
            />
          ))}
        </div>
      ) : loadError ? (
        <LoadError message={loadError} onRetry={onRetry} />
      ) : (
        <>
          <PathList
            workspaces={workspaces}
            isSaving={isSaving}
            onRemove={onRemove}
          />
          <AddPathForm onAdd={onAdd} isSaving={isSaving} />
        </>
      )}
    </div>
  );
}
```

Note: the tmpdir `<Alert>` is removed (spec decision); `Alert` no longer needs importing from `@heroui/react`. The section title stays `File Access` per spec.

- [ ] **Step 5: Rewrite `apps/frontend/src/pages/settings/sections/file-access/components/PathList/PathList.tsx`**

Replace the entire file with:

```tsx
import {Button, Label, ListBox, Surface} from '@heroui/react';
import type {Workspace} from '@omnicraft/settings-schema';

import styles from './styles.module.css';

interface PathListProps {
  workspaces: readonly Workspace[];
  isSaving: boolean;
  onRemove: (index: number) => void;
}

export function PathList({workspaces, isSaving, onRemove}: PathListProps) {
  if (workspaces.length === 0) {
    return <p className={styles.emptyState}>No workspaces configured yet.</p>;
  }

  return (
    <Surface className={styles.container}>
      <ListBox aria-label='Workspaces' selectionMode='none'>
        {workspaces.map((entry, i) => (
          <ListBox.Item key={entry.path} id={entry.path} textValue={entry.path}>
            <div className={styles.entryContent}>
              <Label className={styles.entryPath}>{entry.path}</Label>
            </div>
            <div className={styles.entryActions}>
              <Button
                size='sm'
                variant='danger'
                isDisabled={isSaving}
                onPress={() => {
                  onRemove(i);
                }}
              >
                Remove
              </Button>
            </div>
          </ListBox.Item>
        ))}
      </ListBox>
    </Surface>
  );
}
```

`Chip` import and mode chip markup are removed.

- [ ] **Step 6: Rewrite `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/hooks/useAddPathForm.ts`**

Replace the entire file with:

```ts
import type {Workspace} from '@omnicraft/settings-schema';
import {useCallback, useState} from 'react';

export function useAddPathForm(onAdd: (entry: Workspace) => void) {
  const [newPath, setNewPath] = useState('');

  const handleAdd = useCallback(() => {
    const trimmed = newPath.trim();
    if (!trimmed) return;
    onAdd({path: trimmed});
    setNewPath('');
  }, [newPath, onAdd]);

  return {
    newPath,
    setNewPath,
    handleAdd,
  };
}
```

- [ ] **Step 7: Rewrite `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/AddPathFormView.tsx`**

Replace the entire file with:

```tsx
import {Button, Input, Label, TextField} from '@heroui/react';

import styles from './styles.module.css';

interface AddPathFormViewProps {
  readonly newPath: string;
  readonly isSaving: boolean;
  readonly onPathChange: (value: string) => void;
  readonly onAdd: () => void;
}

export function AddPathFormView({
  newPath,
  isSaving,
  onPathChange,
  onAdd,
}: AddPathFormViewProps) {
  return (
    <div className={styles.container}>
      <TextField
        value={newPath}
        onChange={onPathChange}
        className={styles.pathField}
      >
        <Label>Path</Label>
        <Input placeholder='/absolute/path/to/directory' />
      </TextField>
      <Button isDisabled={!newPath.trim() || isSaving} onPress={onAdd}>
        Add
      </Button>
    </div>
  );
}
```

Mode `Select` and related imports (`ListBox`, `Select`) are removed.

- [ ] **Step 8: Rewrite `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/AddPathForm.tsx`**

Replace the entire file with:

```tsx
import type {Workspace} from '@omnicraft/settings-schema';

import {AddPathFormView} from './AddPathFormView.js';
import {useAddPathForm} from './hooks/useAddPathForm.js';

interface AddPathFormProps {
  onAdd: (entry: Workspace) => void;
  isSaving: boolean;
}

export function AddPathForm({onAdd, isSaving}: AddPathFormProps) {
  const {newPath, setNewPath, handleAdd} = useAddPathForm(onAdd);

  return (
    <AddPathFormView
      newPath={newPath}
      isSaving={isSaving}
      onPathChange={setNewPath}
      onAdd={handleAdd}
    />
  );
}
```

- [ ] **Step 9: Update `apps/frontend/src/pages/settings/sections/file-access/components/AddPathForm/styles.module.css`**

Replace the entire file with:

```css
.container {
  display: flex;
  align-items: flex-end;
  gap: 8px;
}

.pathField {
  flex: 1;
  min-width: 0;
}
```

The `.modeSelect` rule is removed.

- [ ] **Step 10: Run frontend typecheck, lint, build, and tests**

Run:

```bash
bun run --filter '@omnicraft/frontend' lint
bun run --filter '@omnicraft/frontend' build
bun run --filter '@omnicraft/frontend' test
```

Expected: all pass. `build` includes `tsc -b`, which catches cross-package type mismatches.

- [ ] **Step 11: Commit**

```bash
git add apps/frontend/src
git commit -m "$(cat <<'EOF'
refactor(frontend): rename allowedPaths to workspaces and drop mode UI

Update API client, session config context, workspace select, session
setup, and the file-access settings section to use the workspaces
schema. Drop the mode Select/Chip UI and the tmpdir permission alert;
the section title stays "File Access" as the namespace name.
EOF
)"
```

---

## Task 5: Full repo verification

**Goal:** Confirm the entire monorepo is green after all renames.

- [ ] **Step 1: Typecheck every package**

Run:

```bash
cd /Users/jingyaozhou/.superset/worktrees/OmniCraft/sudsy-dugong
bun run --filter '@omnicraft/settings-schema' typecheck
bun run --filter '@omnicraft/api-schema' typecheck
bun run --filter '@omnicraft/backend' typecheck
bun run --filter '@omnicraft/frontend' build
```

Expected: all pass.

- [ ] **Step 2: Run all tests**

Run:

```bash
bun run --filter '@omnicraft/settings-schema' test
bun run --filter '@omnicraft/backend' test
bun run --filter '@omnicraft/frontend' test
```

Expected: all pass.

- [ ] **Step 3: Lint every lintable package**

Run:

```bash
bun run --filter '@omnicraft/backend' lint
bun run --filter '@omnicraft/frontend' lint
```

Expected: all pass.

- [ ] **Step 4: Prettier check**

Run:

```bash
bun run format:check
```

Expected: passes. If it fails, run `bun run format` and amend the relevant commit.

- [ ] **Step 5: Grep for leftover references**

Run:

```bash
rg 'allowedPaths|AllowedPath|AllowedPathEntry|accessMode|AccessMode|WORKSPACE_NOT_IN_ALLOWED_PATHS|WORKSPACE_NOT_READ_WRITE|NOT_READABLE|NOT_READABLE_AND_WRITABLE' \
  apps/ packages/ configs/ 2>/dev/null
```

Expected: no hits inside `apps/`, `packages/`, `configs/`. Hits inside `docs/` are acceptable (historical specs/plans are out of scope).

---

## Task 6: Manual UI verification

**Goal:** Exercise the feature end-to-end in a browser to catch anything typecheck missed.

- [ ] **Step 1: Start the dev servers**

Run:

```bash
cd /Users/jingyaozhou/.superset/worktrees/OmniCraft/sudsy-dugong
bun run dev
```

Wait for both backend and frontend to be ready.

- [ ] **Step 2: Verify existing settings migrate silently**

Open the frontend in a browser. Navigate to **Settings → File Access**. Expected:

- Section title reads `File Access`.
- Previous `allowedPaths` entries no longer appear (dropped by Zod on load, by design — spec says no migration).
- The tmpdir alert is gone.
- The add form has a single `Path` input and an `Add` button (no mode dropdown).

- [ ] **Step 3: Add a workspace**

Type an absolute path to an existing read-write directory (e.g., your home directory), press `Add`. Expected: toast "Workspaces saved", list shows the entry with a `Remove` button and no mode chip.

- [ ] **Step 4: Add an invalid path**

Type `/nonexistent/abc`, press `Add`. Expected: danger toast with `NOT_FOUND` reason.

- [ ] **Step 5: Verify session setup picks up the workspace**

Navigate to the coding page (new session). Expected:

- Workspace dropdown is enabled and contains the workspace added in step 3.
- Tooltip reads `Directory the agent works in`.
- With no workspace selected, the warning `No workspace configured for this session.` shows.
- With all workspaces removed and the settings section emptied, the warning changes to `No workspaces configured. Configure in Settings → File Access`.

- [ ] **Step 6: Remove a workspace**

On **Settings → File Access**, press `Remove` on an entry. Expected: toast "Workspaces saved", entry gone.

- [ ] **Step 7: Create a coding session**

Select a workspace, create a session. Expected: session starts successfully. If the backend rejects, the error should read `WORKSPACE_NOT_CONFIGURED` (not the old `WORKSPACE_NOT_IN_ALLOWED_PATHS` or `WORKSPACE_NOT_READ_WRITE`).

- [ ] **Step 8: Stop the dev servers**

Ctrl+C the `bun run dev` process.

No commit needed for this task.
