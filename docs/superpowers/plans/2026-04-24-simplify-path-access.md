# Simplify Path Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `extraAllowedPaths` end-to-end from service → agent → tool layer, and drop path-based read/write checks from file tools. `workingDirectory` narrows to base-for-relative-paths + default bash cwd.

**Architecture:** Bottom-up deletion: first drop `checkAccess` usage in leaf tools, then remove the field from `ToolExecutionContext`, then from the `Agent` base class and subclasses, then from the service layer. Finally rename the helpers module and prune the unused `checkAccess` / `AccessCheckResult` exports. All tests are updated alongside to keep the tree green after each commit.

**Tech Stack:** TypeScript, Vitest, Bun, Node.js. Zod for schemas.

**Spec:** `docs/superpowers/specs/2026-04-24-simplify-path-access-design.md`

**Working directory:** `apps/backend/` (most commands below assume `cd apps/backend` first).

**Commit style:** Conventional Commits. Each task ends with one commit. Run `bun run lint && bun run typecheck && bun run test` before committing when code changed.

---

## Task 1: Remove `checkAccess` usage from file tools and `dispatch-agent-tool`

**Files:**

- Modify: `apps/backend/src/agent/tools/file/read-file.ts`
- Modify: `apps/backend/src/agent/tools/file/write-file.ts`
- Modify: `apps/backend/src/agent/tools/file/edit-file.ts`
- Modify: `apps/backend/src/agent/tools/file/find-files.ts`
- Modify: `apps/backend/src/agent/tools/file/search-files.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/file/read-file.test.ts`
- Modify: `apps/backend/src/agent/tools/file/write-file.test.ts`
- Modify: `apps/backend/src/agent/tools/file/edit-file.test.ts`
- Modify: `apps/backend/src/agent/tools/file/find-files.test.ts`
- Modify: `apps/backend/src/agent/tools/file/search-files.test.ts`

At this point `context.extraAllowedPaths` still exists (removed in Task 2). Do not touch it in this task — it just becomes unused by file tools.

- [ ] **Step 1: Remove access check from `read-file.ts`**

Edit `read-file.ts`:

- Remove the import `import {AccessCheckResult, checkAccess} from '@/helpers/path-access.js';`
- Delete lines 52–68 (the "2. Security check" block). Leave the comment-free flow: after `path.resolve(...)`, jump straight to `// 3. Stat`.
- Update description string at line 43: remove `'Only text files within the working directory are allowed.'` (concat trailing period preserved on previous line).

Resulting snippet:

```typescript
async execute(args: ReadFileArgs, context: ToolExecutionContext) {
    const {workingDirectory, fileCache} = context;

    // 1. Resolve path
    const absolutePath = path.resolve(workingDirectory, args.filePath);

    // 2. Stat
    let stat: Stats;
    try {
      stat = await fs.stat(absolutePath);
    } catch {
      ...
```

- [ ] **Step 2: Remove access check from `write-file.ts`**

Edit `write-file.ts`:

- Remove the import line 17.
- Delete lines 56–81 (the "3. Security check" block).
- Renumber surrounding comments so flow reads 1. content size, 2. resolve, 3. check existing stat, 4. mkdir, 5. write, 6. count/return.

- [ ] **Step 3: Remove access check from `edit-file.ts`**

Edit `edit-file.ts`:

- Remove the import line 18.
- Delete lines 56–79 (the "2. Security check" block).
- Renumber surrounding comments.

- [ ] **Step 4: Remove access check from `find-files.ts`**

Edit `find-files.ts`:

- Remove the import line 18.
- Delete lines 47–65 (the "2. Security check" block).
- Renumber surrounding comments.

- [ ] **Step 5: Remove access check from `search-files.ts`**

Edit `search-files.ts`:

- Remove the import line 21.
- Delete lines 98–114 (the "2. Security check" block).
- Renumber surrounding comments.

- [ ] **Step 6: Simplify `dispatch-agent-tool.ts`**

Edit `dispatch-agent-tool.ts`:

- Remove the import `import {AccessCheckResult, checkAccess} from '@/helpers/path-access.js';` (line 14).
- Replace lines 104–127 (the `workingDirectory` validation block) with a simple resolve-only normalization:

```typescript
// Resolve working directory (relative paths resolved against parent's cwd).
let workingDirectory = context.workingDirectory;
if (args.workingDirectory) {
  workingDirectory = path.resolve(
    context.workingDirectory,
    args.workingDirectory,
  );
}
```

- `new GeneralSubAgent(getConfig, workingDirectory, context.extraAllowedPaths)` at line 134 stays for now — the third arg is removed in Task 4. `context.extraAllowedPaths` still exists until Task 2.

- [ ] **Step 7: Remove `extraAllowedPaths` describe blocks from file-tool tests**

For each of the five test files, delete the entire `describe('extraAllowedPaths', ...)` block:

- `read-file.test.ts`: line 185 to the end of that describe block (through ~line 260).
- `write-file.test.ts`: line 153 to the end of that describe block.
- `edit-file.test.ts`: line 189 to the end of that describe block.
- `find-files.test.ts`: line 192 to the end of that describe block.
- `search-files.test.ts`: line 337 to the end of that describe block.

Each of these describes tested access-denied behavior against extra paths — no longer applicable.

- [ ] **Step 8: Run lint + typecheck + tests**

Run from `apps/backend`:

```
bun run lint
bun run typecheck
bun run test
```

Expected: all pass. Any remaining reference to `checkAccess` or `AccessCheckResult` in production code indicates a missed spot.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent/tools/file apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts
git commit -m "refactor: drop path access checks from file tools"
```

---

## Task 2: Remove `extraAllowedPaths` from `ToolExecutionContext` and `buildSystemPrompt`

**Files:**

- Modify: `apps/backend/src/agent-core/tool/types.ts`
- Modify: `apps/backend/src/agent-core/tool/testing.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-catalog.ts`

- [ ] **Step 1: Remove field from `ToolExecutionContext`**

Edit `agent-core/tool/types.ts`:

- Delete lines 42–46 (the `extraAllowedPaths` doc comment and field).
- Remove the `import type {AllowedPathEntry} from '@omnicraft/settings-schema';` at line 1 — it becomes unused.

Resulting header:

```typescript
import type {SseSubAgentEvent} from '@omnicraft/sse-events';
import type {ToolFailureData} from '@omnicraft/tool-schemas';
import type {z} from 'zod';

import type {FileContentCache} from '../agent/file-content-cache.js';
...
```

- [ ] **Step 2: Remove field from mock context**

Edit `agent-core/tool/testing.ts`:

- Delete line 43: `extraAllowedPaths: [],`

- [ ] **Step 3: Simplify `buildSystemPrompt` signature and body**

Edit `agent-core/agent/agent-catalog.ts`:

- Remove `AllowedPathEntry` from the import on line 2. After edit:
  ```typescript
  import type {ToolDefinition} from '../tool/index.js';
  import type {ToolRegistry} from '../tool/index.js';
  ```
- Change `buildSystemPrompt` signature:
  ```typescript
  export function buildSystemPrompt(
    baseSystemPrompt: string,
    toolRegistries: readonly ToolRegistry[],
    skillRegistries: readonly SkillRegistry[],
    workingDirectory: string,
  ): string {
  ```
- Replace the existing working-directory block (lines 90–99) with one neutral environment line:

```typescript
  prompt +=
    `\n\nWorking directory: ${workingDirectory}. ` +
    'Relative paths in file operations are resolved from this directory; ' +
    'shell commands start here by default.';

  return prompt;
}
```

Delete the "Additional accessible paths" block and the earlier shell-command advisory entirely.

- [ ] **Step 4: Update `Agent.ts` to match**

Edit `agent-core/agent/agent.ts`:

- In `runAgentLoop`, line 327–333, change the `buildSystemPrompt` call:

```typescript
const systemPrompt = buildSystemPrompt(
  this.baseSystemPrompt,
  this.toolRegistries,
  this.skillRegistries,
  this.workingDirectory ?? os.tmpdir(),
);
```

(The 5th arg `this.extraAllowedPaths` is removed. The `?? os.tmpdir()` stays here until Task 3 narrows `workingDirectory` to non-optional.)

- In `executeTool`, delete line 602: `extraAllowedPaths: this.extraAllowedPaths,` from the `ToolExecutionContext` literal.

At this point `this.extraAllowedPaths` is still referenced in `toSnapshot` — that's removed in Task 3.

- [ ] **Step 5: Run lint + typecheck + tests**

```
bun run lint
bun run typecheck
bun run test
```

Expected: all pass. Snapshot tests (if any) and existing tool-context tests should still work since no runtime behavior changed beyond the removed field.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/tool/types.ts apps/backend/src/agent-core/tool/testing.ts apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent-catalog.ts
git commit -m "refactor: drop extraAllowedPaths from tool context and system prompt"
```

---

## Task 3: Remove `extraAllowedPaths` from `Agent` base and narrow `workingDirectory` to `string`

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/types.ts`

- [ ] **Step 1: Update `AgentOptions` and `agentSnapshotOptionsSchema`**

Edit `agent-core/agent/types.ts`:

- Remove the `allowedPathEntrySchema` import on line 1. Keep the `z` import.
- Remove the `AllowedPathEntry` import on line 8 (unused after).
- Delete the `extraAllowedPaths` field from `agentSnapshotOptionsSchema` (line 28).
- Delete the `extraAllowedPaths` field from `AgentOptions` (line 56).

Final `agentSnapshotOptionsSchema`:

```typescript
const agentSnapshotOptionsSchema = z.object({
  workingDirectory: z.string().optional(),
  claudeCodeSessionId: z.string().optional(),
});
```

Final `AgentOptions` (minus field):

```typescript
export interface AgentOptions {
  readonly toolRegistries: ToolRegistry[];
  readonly skillRegistries: SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly getLightConfig?: () => Promise<LlmConfig>;
  readonly workingDirectory?: string;
  readonly sessionsDir?: string;
}
```

- [ ] **Step 2: Narrow `workingDirectory` to `string` in `Agent`**

Edit `agent-core/agent/agent.ts`:

- Change field declaration (line 82):

```typescript
  private readonly workingDirectory: string;
```

- In the constructor, rewrite the `extraAllowedPaths` + `workingDirectory` initialization. Replace lines 125–167 with the pattern below. The key change: drop `extraAllowedPaths` setup entirely, and resolve `workingDirectory` once with the tmpdir fallback.

Before:

```typescript
this.extraAllowedPaths = [
  {path: os.tmpdir(), mode: 'read-write' as const},
  ...options.extraAllowedPaths,
];

this.sessionsDir = options.sessionsDir ?? null;

if (snapshot) {
  this.id = snapshot.id;
  this.title = snapshot.title;
  this.sseEventCount = snapshot.sseEventCount;
  this.workingDirectory = snapshot.options.workingDirectory;
  this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
} else {
  this.id = crypto.randomUUID();
  this.workingDirectory = options.workingDirectory;
  this.llmSession = new LlmSession(getConfig);
}
```

After:

```typescript
this.sessionsDir = options.sessionsDir ?? null;

if (snapshot) {
  this.id = snapshot.id;
  this.title = snapshot.title;
  this.sseEventCount = snapshot.sseEventCount;
  this.workingDirectory = snapshot.options.workingDirectory ?? os.tmpdir();
  this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
} else {
  this.id = crypto.randomUUID();
  this.workingDirectory = options.workingDirectory ?? os.tmpdir();
  this.llmSession = new LlmSession(getConfig);
}
```

- Delete the `private readonly extraAllowedPaths: ...;` field declaration (line 84).

- Remove the `AllowedPathEntry` import at line 34 of `agent-core/agent/agent.ts` (it was only used for that field).

- [ ] **Step 3: Simplify `shellState` initialization**

Edit `agent-core/agent/agent.ts` line 155:

Before:

```typescript
this.shellState = {cwd: this.workingDirectory ?? os.tmpdir()};
```

After:

```typescript
this.shellState = {cwd: this.workingDirectory};
```

- [ ] **Step 4: Simplify `toSnapshot`**

Edit `agent-core/agent/agent.ts` lines 180–193:

Before:

```typescript
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      sseEventCount: this.sseEventCount,
      llmSession: this.llmSession.toSnapshot(),
      options: {
        workingDirectory: this.workingDirectory,
        extraAllowedPaths: this.extraAllowedPaths.filter(
          (p) => p.path !== os.tmpdir(),
        ),
      },
    };
  }
```

After:

```typescript
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      sseEventCount: this.sseEventCount,
      llmSession: this.llmSession.toSnapshot(),
      options: {
        workingDirectory: this.workingDirectory,
      },
    };
  }
```

- [ ] **Step 5: Simplify `runAgentLoop` and `executeTool` tmpdir fallbacks**

Edit `agent-core/agent/agent.ts`:

- In `runAgentLoop` line 331, replace `this.workingDirectory ?? os.tmpdir()` with `this.workingDirectory`.
- In `executeTool` line 599, replace `this.workingDirectory ?? os.tmpdir()` with `this.workingDirectory`.

- [ ] **Step 6: Verify `os` import still needed**

`os.tmpdir()` is still used in the constructor for the fallback. Keep `import os from 'node:os';`.

- [ ] **Step 7: Run lint + typecheck + tests**

```
bun run lint
bun run typecheck
bun run test
```

Expected: all pass. Subclasses (`MainAgent`, `CodingAgent`, `GeneralSubAgent`, `CodingSubAgent`) still pass `extraAllowedPaths` into `AgentOptions` — but since that field is now gone from `AgentOptions`, typecheck will fail on the subclasses. **That's expected — we fix it in Task 4.**

Revised expected result: typecheck fails with errors in the four subclasses (unknown property `extraAllowedPaths`). Lint and existing passing tests still run. Commit with known typecheck failures is OK here because the next task fixes them.

**Do NOT commit yet.** Combine with Task 4 since these two changes are a unit.

---

## Task 4: Remove `extraAllowedPaths` from the four agent subclasses

**Files:**

- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`
- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`

- [ ] **Step 1: Update `MainAgent`**

Edit `agent/agents/main-agent/main-agent.ts`:

Before:

```typescript
export class MainAgent extends Agent {
  constructor(
    workingDirectory: string | undefined,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      async () => { ... },
      {
        toolRegistries: [...],
        ...
        workingDirectory,
        extraAllowedPaths,
        sessionsDir,
      },
      snapshot,
    );
  }

  static async restore(sessionsDir: string, id: string): Promise<MainAgent> {
    const snapshot = await agentPersistence.loadSnapshot(sessionsDir, id);
    await agentPersistence.reconcileEventsFile(
      sessionsDir,
      id,
      snapshot.sseEventCount,
    );
    return new MainAgent(
      snapshot.options.workingDirectory,
      snapshot.options.extraAllowedPaths ?? [],
      sessionsDir,
      snapshot,
    );
  }
}
```

After:

```typescript
export class MainAgent extends Agent {
  constructor(
    workingDirectory: string | undefined,
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      async () => { ... },
      {
        toolRegistries: [...],
        ...
        workingDirectory,
        sessionsDir,
      },
      snapshot,
    );
  }

  static async restore(sessionsDir: string, id: string): Promise<MainAgent> {
    const snapshot = await agentPersistence.loadSnapshot(sessionsDir, id);
    await agentPersistence.reconcileEventsFile(
      sessionsDir,
      id,
      snapshot.sseEventCount,
    );
    return new MainAgent(
      snapshot.options.workingDirectory,
      sessionsDir,
      snapshot,
    );
  }
}
```

Also remove `import type {AllowedPathEntry} from '@omnicraft/settings-schema';` at line 1 (unused).

- [ ] **Step 2: Update `CodingAgent`**

Edit `agent/agents/coding-agent/coding-agent.ts`:

- Apply the same transformation as Step 1 (drop `extraAllowedPaths` param and super option, drop `AllowedPathEntry` import, drop `extraAllowedPaths` from the `restore` call to `new CodingAgent(...)`).

- [ ] **Step 3: Update `GeneralSubAgent`**

Edit `agent/agents/general-sub-agent/general-sub-agent.ts`:

Before:

```typescript
export class GeneralSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    extraAllowedPaths: readonly AllowedPathEntry[] = [],
  ) {
    super(getConfig, {
      toolRegistries: [...],
      ...
      workingDirectory,
      extraAllowedPaths,
    });
  }
}
```

After:

```typescript
export class GeneralSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
  ) {
    super(getConfig, {
      toolRegistries: [...],
      ...
      workingDirectory,
    });
  }
}
```

Remove the `AllowedPathEntry` import.

- [ ] **Step 4: Update `CodingSubAgent`**

Edit `agent/agents/coding-sub-agent/coding-sub-agent.ts`:

- Remove `extraAllowedPaths` from the constructor signature and from the `super(...)` options.
- Remove the `AllowedPathEntry` import.

- [ ] **Step 5: Update `dispatch-agent-tool.ts` subagent instantiation**

Edit `agent/tools/sub-agent/dispatch-agent-tool.ts`:

- Change line 134 from:

  ```typescript
  const subagent: Agent = new GeneralSubAgent(
    getConfig,
    workingDirectory,
    context.extraAllowedPaths,
  );
  ```

  to:

  ```typescript
  const subagent: Agent = new GeneralSubAgent(getConfig, workingDirectory);
  ```

- [ ] **Step 6: Run lint + typecheck + tests**

```
bun run lint
bun run typecheck
bun run test
```

Expected: lint and typecheck pass. Tests compile. Some tests may still fail if the service layer is tested with `extraAllowedPaths` — but at this stage the service itself still accepts it. The `createSession` call site in `agent-session-service.ts` passes `resolvedExtraFilePathEntries` to `new MainAgent(...)` / `new CodingAgent(...)` — this becomes a type error because the subclasses no longer accept a second entries arg.

**Revised expected:** typecheck fails inside `agent-session-service.ts` on the `new MainAgent(...)` / `new CodingAgent(...)` calls. That's the next task.

**Do NOT commit yet.** Combine Tasks 3+4+5 into one commit, since each individually leaves the tree red.

---

## Task 5: Remove `extraAllowedPaths` from the service layer

**Files:**

- Modify: `apps/backend/src/services/agent-session/agent-session-service.ts`
- Modify: `apps/backend/src/services/agent-session/validation.ts`
- Modify: `apps/backend/src/services/agent-session/types.ts`
- Modify: `apps/backend/src/services/agent-session/validation.test.ts`

- [ ] **Step 1: Drop `EXTRA_PATH_*` enums**

Edit `services/agent-session/types.ts`. Replace the whole `CreateSessionError` enum with:

```typescript
export enum CreateSessionError {
  BASE_URL_NOT_CONFIGURED = 'BASE_URL_NOT_CONFIGURED',
  MODEL_NOT_CONFIGURED = 'MODEL_NOT_CONFIGURED',
  WORKSPACE_PATH_NOT_FOUND = 'WORKSPACE_PATH_NOT_FOUND',
  WORKSPACE_PATH_NOT_DIRECTORY = 'WORKSPACE_PATH_NOT_DIRECTORY',
  WORKSPACE_PATH_NOT_ACCESSIBLE = 'WORKSPACE_PATH_NOT_ACCESSIBLE',
  WORKSPACE_NOT_IN_ALLOWED_PATHS = 'WORKSPACE_NOT_IN_ALLOWED_PATHS',
  WORKSPACE_NOT_READ_WRITE = 'WORKSPACE_NOT_READ_WRITE',
}
```

- [ ] **Step 2: Simplify `validation.ts`**

Edit `services/agent-session/validation.ts`. Replace the entire file body with:

```typescript
import {constants} from 'node:fs';

import type {AllowedPathEntry} from '@omnicraft/settings-schema';

import {checkDirectoryAccess} from '@/helpers/fs.js';

import {CreateSessionError} from './types.js';

/**
 * Validates workspace against settings and filesystem.
 * Returns null if valid, or the error found.
 */
export async function validateSessionPaths(
  workspace: string | undefined,
  allowedPaths: readonly AllowedPathEntry[],
): Promise<CreateSessionError | null> {
  if (!workspace) return null;

  const entry = allowedPaths.find((e) => e.path === workspace);
  if (!entry) return CreateSessionError.WORKSPACE_NOT_IN_ALLOWED_PATHS;
  if (entry.mode !== 'read-write') {
    return CreateSessionError.WORKSPACE_NOT_READ_WRITE;
  }

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

`validateExtraPaths` is deleted. The `validateWorkspace` helper is inlined since it's the whole function now.

- [ ] **Step 3: Simplify `agent-session-service.ts`**

Edit `services/agent-session/agent-session-service.ts`:

- Remove the `import type {AllowedPathEntry} from '@omnicraft/settings-schema';` and the `import assert from 'node:assert';` imports — both become unused.
- Change `CreateSessionOptions`:

```typescript
interface CreateSessionOptions {
  workspace?: string;
}
```

- Rewrite `createSession`. Replace lines 47–112 with:

```typescript
  async createSession(
    agentType: AgentType,
    options: CreateSessionOptions = {},
  ): Promise<CreateSessionResult> {
    const llmConfig = await getLlmConfig(agentType);

    if (!llmConfig.baseUrl) {
      return {
        success: false,
        error: CreateSessionError.BASE_URL_NOT_CONFIGURED,
      };
    }
    if (!llmConfig.model) {
      return {success: false, error: CreateSessionError.MODEL_NOT_CONFIGURED};
    }

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

    const store = getStore(agentType);
    const sessionsDir = store.sessionsDir;
    let agent: Agent;
    switch (agentType) {
      case AgentType.CHAT:
        agent = new MainAgent(options.workspace, sessionsDir);
        break;
      case AgentType.CODING:
        agent = new CodingAgent(options.workspace, sessionsDir);
        break;
    }
    return {success: true, sessionId: agent.id};
  },
```

- [ ] **Step 4: Update `validation.test.ts`**

Edit `services/agent-session/validation.test.ts`:

- Delete the two `EXTRA_PATH_*` cases (lines 51–64).
- Update the remaining test calls to the new 2-arg signature. Replace `validateSessionPaths(tempDir, [], allowed)` with `validateSessionPaths(tempDir, allowed)` everywhere.
- Delete the final "returns null for valid workspace with valid extra paths" test (lines 66–73) — it validated extra-path behavior.
- Since the `subDir` variable is no longer used for any assertion, its setup can stay (harmless) or be removed. Remove it for clarity: drop `subDir = path.join(tempDir, 'sub'); await fs.mkdir(subDir);` and the `subDir` declaration.

Resulting file should have exactly four tests:

1. returns null for valid workspace
2. returns WORKSPACE_PATH_NOT_FOUND
3. returns WORKSPACE_NOT_IN_ALLOWED_PATHS
4. returns WORKSPACE_NOT_READ_WRITE

- [ ] **Step 5: Run lint + typecheck + tests**

```
bun run lint
bun run typecheck
bun run test
```

Expected: **all pass**. The only remaining `checkAccess` / `AccessCheckResult` reference in production is in `helpers/path-access.ts` itself. No `extraAllowedPaths` references should remain outside `helpers/path-access.ts` and docs.

- [ ] **Step 6: Sanity grep**

```
cd apps/backend
grep -rn "extraAllowedPaths\|AccessCheckResult\|checkAccess" src
```

Expected: only hits are `src/helpers/path-access.ts`, `src/helpers/path-access.test.ts`, and `src/agent/tools/bash/run-command.ts` (which uses `isSubPathOrSelf` but not `checkAccess`). No hits in `agent/` business code, `services/`, or `agent-core/` apart from bash's usage of `isSubPathOrSelf`.

If `extraAllowedPaths` appears anywhere in `src/` outside `path-access.ts`, investigate and fix before committing.

- [ ] **Step 7: Commit Tasks 3 + 4 + 5 together**

```bash
git add apps/backend/src/agent-core apps/backend/src/agent/agents apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/services/agent-session
git commit -m "refactor: drop extraAllowedPaths from agents and session service"
```

---

## Task 6: Rename `path-access.ts` → `path-helpers.ts`, prune unused exports

**Files:**

- Rename: `apps/backend/src/helpers/path-access.ts` → `apps/backend/src/helpers/path-helpers.ts`
- Rename: `apps/backend/src/helpers/path-access.test.ts` → `apps/backend/src/helpers/path-helpers.test.ts`
- Modify: `apps/backend/src/agent/tools/bash/run-command.ts` (import path)

- [ ] **Step 1: Rename via git mv**

```bash
cd apps/backend
git mv src/helpers/path-access.ts src/helpers/path-helpers.ts
git mv src/helpers/path-access.test.ts src/helpers/path-helpers.test.ts
```

- [ ] **Step 2: Prune `checkAccess` and `AccessCheckResult` from the renamed module**

Edit `src/helpers/path-helpers.ts`. Replace the whole file with:

```typescript
import path from 'node:path';

/** Returns true if `child` is strictly inside `parent` (not equal to it). */
export function isSubPath(parent: string, child: string): boolean {
  const resolvedParent = path.resolve(parent);
  const resolvedChild = path.resolve(child);
  return resolvedChild.startsWith(resolvedParent + path.sep);
}

/** Returns true if `child` is `parent` itself or strictly inside it. */
export function isSubPathOrSelf(parent: string, child: string): boolean {
  return (
    path.resolve(parent) === path.resolve(child) || isSubPath(parent, child)
  );
}
```

The `AllowedPathEntry` import and everything from `AccessCheckResult` downward are deleted.

- [ ] **Step 3: Update the test file import**

Edit `src/helpers/path-helpers.test.ts`. Change line 3:

Before:

```typescript
import {isSubPath, isSubPathOrSelf} from './path-access.js';
```

After:

```typescript
import {isSubPath, isSubPathOrSelf} from './path-helpers.js';
```

No other test content changes — the existing tests only cover `isSubPath` / `isSubPathOrSelf`.

- [ ] **Step 4: Update bash import**

Edit `src/agent/tools/bash/run-command.ts`. Change the import path `@/helpers/path-access.js` → `@/helpers/path-helpers.js`. Find the exact line with:

```
grep -n "path-access" src/agent/tools/bash/run-command.ts
```

Then edit that line's `from '@/helpers/path-access.js'` to `from '@/helpers/path-helpers.js'`.

- [ ] **Step 5: Final sanity grep**

```
grep -rn "path-access\|AccessCheckResult\|checkAccess\|extraAllowedPaths" apps/backend/src
```

Expected: no hits.

```
grep -rn "path-access" apps/backend
```

Expected: no hits outside `docs/`.

- [ ] **Step 6: Run lint + typecheck + tests one more time**

```
cd apps/backend
bun run lint
bun run typecheck
bun run test
```

Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/helpers apps/backend/src/agent/tools/bash/run-command.ts
git commit -m "refactor: rename path-access to path-helpers and drop unused exports"
```

---

## Final verification

- [ ] **Step 1: Confirm clean tree**

```bash
cd apps/backend
bun run lint
bun run typecheck
bun run test
```

All three pass.

- [ ] **Step 2: Skim the three commits on this branch**

```bash
git log --oneline main..HEAD
```

Expected:

```
<hash> refactor: rename path-access to path-helpers and drop unused exports
<hash> refactor: drop extraAllowedPaths from agents and session service
<hash> refactor: drop path access checks from file tools
```

- [ ] **Step 3: Smoke test — create a CHAT session without workspace and exercise file + bash tools manually**

Run `bun run dev` in `apps/backend`, create a session from the frontend with no workspace, and confirm:

- The agent's working directory defaults to `os.tmpdir()` (check the system prompt rendered in logs).
- Reading, writing, and editing files under tmpdir works.
- Bash `pwd` returns tmpdir on first invocation.
- Bash `cd /some/absolute/path && pwd` — the subsequent bash call starts back at tmpdir (cwd reset).

Manual smoke — not a blocker, but a good final sanity check before handing the branch over.
