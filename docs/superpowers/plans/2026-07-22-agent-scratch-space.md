# Agent Scratch Space (Session Workspace) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each agent a per-session **scratch space** directory (`{sessionsDir}/{id}/scratch`) distinct from its working directory, so task-support files stay out of the user's repo, and teach the agent the distinction via its system prompt.

**Architecture:** The base `Agent` always derives and creates the scratch directory from `sessionsDir + id`; the working directory defaults to the scratch directory when no repo is supplied. `scratchDirectory` is threaded through the tool-execution context so tools (and the `run_command` cwd guard) can use it, and the environment section of the system prompt gains a two-template description. Agent-facing large temp outputs (`web_fetch`, `run_command`) are relocated from `os.tmpdir()` into scratch.

**Tech Stack:** Node.js (`node:fs`, `node:path`, `node:os`), TypeScript (nodenext, `.js` import extensions), Vitest, PNPM monorepo (`@omnicraft/backend`).

## Global Constraints

- Package manager: **PNPM**. Run backend tests with `pnpm --filter @omnicraft/backend test <relative-path>` and typecheck with `pnpm --filter @omnicraft/backend typecheck`. All command paths below are relative to `apps/backend`.
- No default exports (config files exempted). Group related functions as object-literal namespaces where the file already does.
- Relative imports use the `.js` extension (nodenext). Use the `@/*` alias for cross-module `src/` imports; in-module imports stay relative.
- No `console`. Use `logger` from `@/logger.js` outside requests. No `any` — use `unknown` + narrowing. No non-null `!` — use `assert` from `node:assert`.
- Node.js runtime APIs only (`node:fs/promises`, `node:path`, etc.).
- File names kebab-case; unit test for `foo.ts` is `foo.test.ts`.
- Conventional Commits (`feat:`, `refactor:`, `test:`, etc.). Commit after each task. The pre-commit hook runs prettier/lint-staged — do not re-verify compilation/tests just because it reformatted files.
- Backend only. No frontend, no `@omnicraft/*` schema-package changes, no tool-schema changes.

---

### Task 1: `scratchPath` persistence helper

Add the pure path helper that defines the on-disk scratch location, mirroring the existing `snapshotPath` / `metadataPath` / `eventsPath`.

**Files:**

- Modify: `src/agent-core/agent/persistence/agent-persistence.ts`
- Test: `src/agent-core/agent/persistence/agent-persistence.test.ts`

**Interfaces:**

- Produces: `agentPersistence.scratchPath(sessionsDir: string, id: string): string` → `{sessionsDir}/{id}/scratch`.

- [ ] **Step 1: Write the failing test**

Append to `src/agent-core/agent/persistence/agent-persistence.test.ts` inside the top-level `describe` (or add a new `describe('scratchPath')`):

```ts
describe('scratchPath', () => {
  it('returns the scratch subdirectory of the session directory', () => {
    expect(agentPersistence.scratchPath('/sessions', 'abc')).toBe(
      path.join('/sessions', 'abc', 'scratch'),
    );
  });
});
```

Ensure the test file imports `path` (`import path from 'node:path';`) and `agentPersistence` — most persistence tests already do; add the import if missing.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/persistence/agent-persistence.test.ts`
Expected: FAIL — `agentPersistence.scratchPath is not a function`.

- [ ] **Step 3: Add the method**

In `src/agent-core/agent/persistence/agent-persistence.ts`, add directly after `eventsPath` (after line 28):

```ts
  scratchPath(sessionsDir: string, id: string): string {
    return path.join(sessionsDir, id, 'scratch');
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/persistence/agent-persistence.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/agent-core/agent/persistence/agent-persistence.ts src/agent-core/agent/persistence/agent-persistence.test.ts
git commit -m "feat(agent-core): add agentPersistence.scratchPath helper"
```

---

### Task 2: Scratch directory service

Create the service that decides the scratch path (session-backed or tmp fallback) and creates it with the same hardening the working-directory service uses. Leave the old `agent-working-directory-service.ts` in place for now — it is removed in Task 3 when its last consumer changes.

**Files:**

- Create: `src/agent-core/agent/agent-scratch-directory-service.ts`
- Create: `src/agent-core/agent/agent-scratch-directory-service.test.ts`

**Interfaces:**

- Consumes: `agentPersistence.scratchPath` (Task 1); `agentIdSchema` from `@omnicraft/api-schema`.
- Produces: `agentScratchDirectoryService.createScratchDirectory(sessionsDir: string | null, agentId: string): string` — creates and returns the realpath of the scratch dir. `{sessionsDir}/{id}/scratch` when `sessionsDir` is set, else `os.tmpdir()/{id}/scratch`. Throws on non-UUID `agentId`.

- [ ] **Step 1: Write the failing test**

Create `src/agent-core/agent/agent-scratch-directory-service.test.ts`:

```ts
import crypto from 'node:crypto';
import {realpathSync, rmSync, statSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {afterEach, describe, expect, it} from 'vitest';

import {agentScratchDirectoryService} from './agent-scratch-directory-service.js';

const tmpDirsToCleanup = new Set<string>();

afterEach(() => {
  for (const dir of tmpDirsToCleanup) {
    rmSync(dir, {recursive: true, force: true});
  }
  tmpDirsToCleanup.clear();
});

describe('AgentScratchDirectoryService', () => {
  it('creates a scratch dir under sessionsDir for a valid id', () => {
    const sessionsDir = realpathSync(
      // eslint-disable-next-line n/no-sync
      require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'scratch-svc-')),
    );
    tmpDirsToCleanup.add(sessionsDir);
    const id = crypto.randomUUID();

    const dir = agentScratchDirectoryService.createScratchDirectory(
      sessionsDir,
      id,
    );

    expect(dir).toBe(path.join(sessionsDir, id, 'scratch'));
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('falls back to an owner-only tmp scratch dir when sessionsDir is null', () => {
    const id = crypto.randomUUID();
    const expected = path.join(realpathSync(os.tmpdir()), id, 'scratch');
    tmpDirsToCleanup.add(path.join(realpathSync(os.tmpdir()), id));

    const dir = agentScratchDirectoryService.createScratchDirectory(null, id);

    expect(dir).toBe(expected);
    expect(statSync(dir).isDirectory()).toBe(true);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
  });

  it('rejects non-UUID ids before building a path', () => {
    expect(() =>
      agentScratchDirectoryService.createScratchDirectory(null, '../escape'),
    ).toThrow();
  });
});
```

> Note: replace the inline `require('node:fs').mkdtempSync(...)` with a top-level `import {mkdtempSync} from 'node:fs';` and call `mkdtempSync(...)` directly — shown inline only to keep the snippet self-contained. Final import line: `import {mkdtempSync, realpathSync, rmSync, statSync} from 'node:fs';`.

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent-scratch-directory-service.test.ts`
Expected: FAIL — cannot find module `./agent-scratch-directory-service.js`.

- [ ] **Step 3: Create the service**

Create `src/agent-core/agent/agent-scratch-directory-service.ts`:

```ts
import {chmodSync, lstatSync, mkdirSync, realpathSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {agentIdSchema} from '@omnicraft/api-schema';

import {agentPersistence} from './persistence/agent-persistence.js';

export class AgentScratchDirectoryService {
  /**
   * Creates and returns the per-session scratch directory. Uses
   * `{sessionsDir}/{id}/scratch` when a sessions directory is configured, and an
   * `os.tmpdir()/{id}/scratch` fallback for in-memory agents.
   */
  createScratchDirectory(sessionsDir: string | null, agentId: string): string {
    // Defense in depth: agentId reaches here from snapshots on disk. Reject
    // anything that isn't a UUID so path.join can't escape the intended parent.
    agentIdSchema.parse(agentId);
    const dir =
      sessionsDir === null
        ? path.join(os.tmpdir(), agentId, 'scratch')
        : agentPersistence.scratchPath(sessionsDir, agentId);
    mkdirSync(dir, {recursive: true, mode: 0o700});
    // lstat (not stat) so a pre-planted symlink at `dir` is rejected before
    // chmod/realpath would follow it to a target we don't own.
    if (!lstatSync(dir).isDirectory()) {
      throw new Error(`Agent scratch path is not a real directory: ${dir}`);
    }
    // mkdir's `mode` is only applied on creation and can be masked by umask, so
    // re-assert 0o700 to cover the "directory already exists" case.
    chmodSync(dir, 0o700);
    return realpathSync(dir);
  }
}

export const agentScratchDirectoryService = new AgentScratchDirectoryService();
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent-scratch-directory-service.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/agent-core/agent/agent-scratch-directory-service.ts src/agent-core/agent/agent-scratch-directory-service.test.ts
git commit -m "feat(agent-core): add agent scratch directory service"
```

---

### Task 3: Thread `scratchDirectory` through the context and wire the Agent

This is the central, type-driven change: `ToolExecutionContext` gains a required `scratchDirectory`, which cascades through every context builder and carrier, and the base `Agent` derives/creates the scratch dir and defaults the working directory to it. The old `agent-working-directory-service` is removed here (its only consumer is `agent.ts`).

**Files:**

- Modify: `src/agent-core/tool/types.ts`
- Modify: `src/agent-core/tool/testing.ts`
- Modify: `src/agent-core/agent/agent-runtime-state.ts`
- Modify: `src/agent-core/agent/agent-tool-executor.ts`
- Modify: `src/agent-core/agent/agent-turn-runner.ts`
- Modify: `src/agent-core/agent/agent.ts`
- Delete: `src/agent-core/agent/agent-working-directory-service.ts`
- Delete: `src/agent-core/agent/agent-working-directory-service.test.ts`
- Test/Modify: `src/agent-core/agent/agent-runtime-state.test.ts`, `src/agent-core/agent/agent-tool-executor.test.ts`, `src/agent-core/agent/agent-turn-runner.test.ts`, `src/agent-core/agent/agent.test.ts`

**Interfaces:**

- Consumes: `agentScratchDirectoryService.createScratchDirectory` (Task 2).
- Produces:
  - `ToolExecutionContext.scratchDirectory: string`
  - `BuildToolExecutionContextInput.scratchDirectory: string`
  - `ExecuteAgentToolInput.scratchDirectory: string`
  - `RunAgentTurnInput.scratchDirectory: string`
  - `Agent#getScratchDirectory(): string`
  - Persistence change: `toSnapshot().options.workingDirectory` now holds the caller-provided **primary** working directory (may be `undefined`), not the resolved value.

- [ ] **Step 1: Write/adjust the failing Agent tests**

In `src/agent-core/agent/agent.test.ts`, replace the entire `describe('Agent default working directory', ...)` block (currently lines ~895–986) with the block below. It asserts the new behavior: cwd defaults to scratch, scratch lives under `os.tmpdir()/{id}/scratch` when no sessionsDir, and the snapshot persists only the primary.

```ts
describe('Agent scratch directory', () => {
  function defaultedOptions() {
    const {workingDirectory: _omit, ...rest} = testAgentOptions();
    return rest;
  }
  function registerAgentTmpDir(id: string): string {
    const dir = path.join(realpathSync(os.tmpdir()), id);
    tmpDirsToCleanup.add(dir);
    return dir;
  }

  it('creates a per-id scratch dir and uses it as the working directory when none is provided', () => {
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      defaultedOptions(),
    );
    registerAgentTmpDir(agent.id);

    const expected = path.join(realpathSync(os.tmpdir()), agent.id, 'scratch');
    expect(agent.getScratchDirectory()).toBe(expected);
    expect(agent.getWorkingDirectory()).toBe(expected);
    expect(agent.toSnapshot().options.workingDirectory).toBeUndefined();
    expect(statSync(expected).isDirectory()).toBe(true);
    expect(statSync(expected).mode & 0o777).toBe(0o700);
  });

  it('derives scratch from a restored snapshot without a working directory', () => {
    const id = crypto.randomUUID();
    const snapshot: AgentSnapshot = {
      id,
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      todos: [],
      options: {},
    };
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      defaultedOptions(),
      snapshot,
    );
    registerAgentTmpDir(id);

    const expected = path.join(realpathSync(os.tmpdir()), id, 'scratch');
    expect(agent.getScratchDirectory()).toBe(expected);
    expect(agent.getWorkingDirectory()).toBe(expected);
    expect(agent.toSnapshot().options.workingDirectory).toBeUndefined();
  });

  it('rejects snapshots whose id is not a UUID', () => {
    const snapshot = {
      id: '../escape',
      title: 'Restored Session',
      sseEventCount: 0,
      llmSession: {
        id: 'llm-session-id',
        messages: [],
        compactions: [],
        latestUsageInputMessageCount: null,
        usage: emptyUsage(),
      },
      options: {},
    } as unknown as AgentSnapshot;

    expect(
      () =>
        new TestAgent(
          () => Promise.resolve(MAIN_CONFIG),
          defaultedOptions(),
          snapshot,
        ),
    ).toThrow();
  });

  it('keeps an explicit working directory and still creates a separate scratch dir', () => {
    const explicit = realpathSync(os.tmpdir());
    const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
      ...defaultedOptions(),
      workingDirectory: explicit,
    });
    registerAgentTmpDir(agent.id);

    const expectedScratch = path.join(
      realpathSync(os.tmpdir()),
      agent.id,
      'scratch',
    );
    expect(agent.getWorkingDirectory()).toBe(explicit);
    expect(agent.getScratchDirectory()).toBe(expectedScratch);
    expect(agent.toSnapshot().options.workingDirectory).toBe(explicit);
  });
});
```

Also add scratch-dir cleanup for the other constructions in this file (hygiene — these leak an empty `os.tmpdir()/{id}/scratch` per agent). Add this helper just below `testAgentOptions()` (after line 80):

```ts
function track<T extends Agent>(agent: T): T {
  tmpDirsToCleanup.add(path.dirname(agent.getScratchDirectory()));
  return agent;
}
```

Then wrap every remaining `new TestAgent(...)` / `new UsageTestAgent(...)` construction in the file with `track(...)`, e.g.:

```ts
// before
const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), options);
// after
const agent = track(new TestAgent(() => Promise.resolve(MAIN_CONFIG), options));
```

```ts
// before
const agent = new UsageTestAgent(() => Promise.resolve(MAIN_CONFIG), {
  ...
});
// after
const agent = track(
  new UsageTestAgent(() => Promise.resolve(MAIN_CONFIG), {
    ...
  }),
);
```

Leave the two snapshot-restore tests that pass `options: {workingDirectory: realpathSync(os.tmpdir())}` as-is except for wrapping their construction in `track(...)`.

- [ ] **Step 2: Run tests to verify they fail (red)**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts`
Expected: FAIL — `agent.getScratchDirectory is not a function` and the new assertions do not hold.

- [ ] **Step 3: Add the `scratchDirectory` field to the tool context type**

In `src/agent-core/tool/types.ts`, add the field right after `workingDirectory` (after line 48):

```ts
  /**
   * The Agent's private per-session scratch space for task-support files that
   * are not part of the task's output. Always an absolute path; equals the
   * working directory when the agent has no separate repo.
   */
  readonly scratchDirectory: string;
```

- [ ] **Step 4: Default `scratchDirectory` in the mock context**

In `src/agent-core/tool/testing.ts`, inside `createMockContext`, after the `workingDirectory` const (line 37) add:

```ts
const scratchDirectory = overrides?.scratchDirectory ?? os.tmpdir();
```

and add `scratchDirectory,` to the returned object literal (next to `workingDirectory,`).

- [ ] **Step 5: Thread through `AgentRuntimeState`**

In `src/agent-core/agent/agent-runtime-state.ts`:

- Add to `BuildToolExecutionContextInput` after `workingDirectory` (line 23): `readonly scratchDirectory: string;`
- In `buildToolExecutionContext`'s returned object, add after `workingDirectory: input.workingDirectory,` (line 80): `scratchDirectory: input.scratchDirectory,`

- [ ] **Step 6: Thread through `AgentToolExecutor`**

In `src/agent-core/agent/agent-tool-executor.ts`:

- Add to `ExecuteAgentToolInput` after `workingDirectory` (line 35): `readonly scratchDirectory: string;`
- In the `buildToolExecutionContext({...})` call, add after `workingDirectory: input.workingDirectory,` (line 71): `scratchDirectory: input.scratchDirectory,`

- [ ] **Step 7: Thread through `AgentTurnRunner`**

In `src/agent-core/agent/agent-turn-runner.ts`:

- Add to `RunAgentTurnInput` after `workingDirectory` (line 47): `readonly scratchDirectory: string;`
- In the `agentToolExecutor.execute({...})` call, add after `workingDirectory: input.workingDirectory,` (line 239): `scratchDirectory: input.scratchDirectory,`

- [ ] **Step 8: Wire the base `Agent`**

In `src/agent-core/agent/agent.ts`:

Replace the import of the working-directory service (line 19):

```ts
import {agentScratchDirectoryService} from './agent-scratch-directory-service.js';
```

Add two fields near `workingDirectory` (after line 64):

```ts
  private readonly workingDirectory: string;

  private readonly primaryWorkingDirectory: string | undefined;

  private readonly scratchDirectory: string;
```

Replace the snapshot/fresh branch that computes `workingDirectory` (lines 105–121) with:

```ts
let primaryWorkingDirectory: string | undefined;
if (snapshot) {
  this.id = snapshot.id;
  this.title = snapshot.title;
  this.sseEventCount = snapshot.sseEventCount;
  primaryWorkingDirectory = snapshot.options.workingDirectory;
  this.llmSession = new LlmSession(getConfig, snapshot.llmSession);
  this.subagentRegistry = new SubagentRegistry();
} else {
  this.id = crypto.randomUUID();
  primaryWorkingDirectory = options.workingDirectory;
  this.llmSession = new LlmSession(getConfig);
  this.subagentRegistry = new SubagentRegistry();
}

this.primaryWorkingDirectory = primaryWorkingDirectory;
this.scratchDirectory = agentScratchDirectoryService.createScratchDirectory(
  this.sessionsDir,
  this.id,
);
this.workingDirectory = primaryWorkingDirectory ?? this.scratchDirectory;
```

Update `getWorkingDirectory()` (leave as-is) and add a getter after it (after line 157):

```ts
  /** Returns the Agent's per-session scratch directory. */
  getScratchDirectory(): string {
    return this.scratchDirectory;
  }
```

Change `toSnapshot()` to persist the primary (line 172-174):

```ts
      options: {
        workingDirectory: this.primaryWorkingDirectory,
      },
```

Add `scratchDirectory` to the `agentTurnRunner.run({...})` call inside `runAgentLoop` (after `workingDirectory: this.workingDirectory,`, line 328):

```ts
      scratchDirectory: this.scratchDirectory,
```

- [ ] **Step 9: Delete the obsolete working-directory service**

```bash
git rm src/agent-core/agent/agent-working-directory-service.ts src/agent-core/agent/agent-working-directory-service.test.ts
```

- [ ] **Step 10: Fix the remaining input-literal test sites**

- `src/agent-core/agent/agent-runtime-state.test.ts`: add `scratchDirectory: '/scratch',` next to each `workingDirectory:` in the two `buildToolExecutionContext({...})` literals (near lines 36 and 50).
- `src/agent-core/agent/agent-tool-executor.test.ts`: in the `executeInput` return literal, add `scratchDirectory: '/scratch',` after `workingDirectory: '/workspace/project',` (line 69); and add `scratchDirectory: '/scratch',` to the `toMatchObject({...})` assertion after `workingDirectory: '/workspace/project',` (line 124).
- `src/agent-core/agent/agent-turn-runner.test.ts`: in `createInput`'s `defaults` object, add `scratchDirectory: overrides.scratchDirectory ?? '/scratch',` after `workingDirectory,` (line 140).

- [ ] **Step 11: Typecheck, then run the affected suites**

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: PASS (no remaining `ToolExecutionContext` / input literals missing `scratchDirectory`).

Run:

```bash
pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts src/agent-core/agent/agent-runtime-state.test.ts src/agent-core/agent/agent-tool-executor.test.ts src/agent-core/agent/agent-turn-runner.test.ts
```

Expected: PASS.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(agent-core): derive per-session scratch directory and thread it to tools"
```

---

### Task 4: `run_command` dual-root cwd guard

Allow the shell cwd to persist when it is inside **either** the working directory or the scratch directory, delivering the second sandbox root.

**Files:**

- Modify: `src/agent/tools/bash/run-command.ts`
- Test: `src/agent/tools/bash/run-command.test.ts`

**Interfaces:**

- Consumes: `ToolExecutionContext.scratchDirectory` (Task 3).

- [ ] **Step 1: Write the failing test**

In `src/agent/tools/bash/run-command.test.ts`, the `beforeEach` builds `context` via `createMockContext({workingDirectory: tmpDir, ...})`. Add a `scratchDir` alongside `tmpDir` and pass it in. Update the `beforeEach`/`afterEach` and add two tests inside the existing cwd `describe` block (after line 135):

Change `beforeEach` to also create a scratch dir and wire it:

```ts
let tmpDir: string;
let scratchDir: string;
let context: ToolExecutionContext;

beforeEach(async () => {
  tmpDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'rct-test-')),
  );
  scratchDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'rct-scratch-')),
  );
  context = createMockContext({
    workingDirectory: tmpDir,
    scratchDirectory: scratchDir,
    fileCache: new FileContentCache(),
    shellState: {cwd: tmpDir},
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, {recursive: true, force: true});
  await fs.rm(scratchDir, {recursive: true, force: true});
});
```

Add tests:

```ts
it('persists cwd when a command navigates into the scratch directory', async () => {
  const result = await runCommandTool.execute(
    {command: `cd ${scratchDir}`},
    context,
  );
  expect(context.shellState.cwd).toBe(scratchDir);
  expect(result.status).toBe('success');
  assert(result.status === 'success');
  expect(result.data.cwd).toBe(scratchDir);
});

it('resets cwd when a command navigates outside both roots', async () => {
  const result = await runCommandTool.execute({command: 'cd /'}, context);
  expect(context.shellState.cwd).toBe(tmpDir);
  expect(result.content).toContain('Working directory reset to:');
});
```

- [ ] **Step 2: Run test to verify the new scratch test fails**

Run: `pnpm --filter @omnicraft/backend test src/agent/tools/bash/run-command.test.ts`
Expected: FAIL — the scratch-navigation test resets cwd to `tmpDir` instead of persisting `scratchDir`.

- [ ] **Step 3: Widen the guard**

In `src/agent/tools/bash/run-command.ts`, add `scratchDirectory` to the destructure (line 104):

```ts
const {shellState, workingDirectory, scratchDirectory, signal} = context;
```

Replace the CWD-enforcement block (lines 119–131) with:

```ts
// CWD enforcement — resolve symlinks since pwd returns real paths. The shell
// may operate within either the working directory or the scratch space.
let cwdMessage = '';
if (result.cwd) {
  const allowedRoots = [
    realpathSync(workingDirectory),
    realpathSync(scratchDirectory),
  ];
  const withinAllowedRoot = allowedRoots.some((root) =>
    isSubPathOrSelf(root, result.cwd as string),
  );
  if (withinAllowedRoot) {
    if (result.cwd !== shellState.cwd) {
      shellState.cwd = result.cwd;
      cwdMessage = `\n(Working directory: ${result.cwd})`;
    }
  } else {
    shellState.cwd = workingDirectory;
    cwdMessage = `\n(Working directory reset to: ${workingDirectory})`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/agent/tools/bash/run-command.test.ts`
Expected: PASS (including the existing "resets CWD when command navigates outside workingDirectory" test).

- [ ] **Step 5: Commit**

```bash
git add src/agent/tools/bash/run-command.ts src/agent/tools/bash/run-command.test.ts
git commit -m "feat(agent): allow run_command cwd within the scratch directory"
```

---

### Task 5: Two-template environment section in the system prompt

Teach the agent about the two locations. `buildEnvironmentSection` and `buildSystemPrompt` take the scratch directory and emit Template A (distinct) or Template B (equal).

**Files:**

- Modify: `src/agent-core/agent/catalog/agent-catalog.ts`
- Modify: `src/agent-core/agent/agent-turn-runner.ts`
- Create: `src/agent-core/agent/catalog/agent-catalog.test.ts`

**Interfaces:**

- Consumes: `RunAgentTurnInput.scratchDirectory` (Task 3).
- Produces: `buildSystemPrompt(baseSystemPrompt, toolRegistries, skillRegistries, workingDirectory, scratchDirectory)`.

- [ ] **Step 1: Write the failing test**

Create `src/agent-core/agent/catalog/agent-catalog.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {buildSystemPrompt} from './agent-catalog.js';

describe('buildSystemPrompt environment section', () => {
  it('describes two locations when the scratch dir differs from the working dir', () => {
    const prompt = buildSystemPrompt('BASE', [], [], '/repo', '/scratch');
    expect(prompt).toContain('- Working directory: /repo');
    expect(prompt).toContain('- Scratch space: /scratch');
    expect(prompt).toContain('## Working Directory vs Scratch Space');
    expect(prompt).not.toContain('This session has no project repository');
  });

  it('describes a single location when working dir equals scratch dir', () => {
    const prompt = buildSystemPrompt('BASE', [], [], '/scratch', '/scratch');
    expect(prompt).toContain('- Working directory: /scratch');
    expect(prompt).not.toContain('- Scratch space:');
    expect(prompt).not.toContain('## Working Directory vs Scratch Space');
    expect(prompt).toContain('## Scratch Space');
    expect(prompt).toContain('This session has no project repository');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/catalog/agent-catalog.test.ts`
Expected: FAIL — `buildSystemPrompt` expects 4 args / scratch text absent.

- [ ] **Step 3: Rewrite `buildEnvironmentSection` and `buildSystemPrompt`**

In `src/agent-core/agent/catalog/agent-catalog.ts`, replace `buildEnvironmentSection` (lines 8–21) with:

```ts
function buildEnvironmentSection(
  workingDirectory: string,
  scratchDirectory: string,
): string {
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const distinct = workingDirectory !== scratchDirectory;

  const lines = [
    '## Environment',
    '',
    `- OS: ${os.type()} ${os.release()} (${os.platform()}, ${os.arch()})`,
    `- Shell: ${process.env.SHELL ?? 'unknown'}`,
    `- Working directory: ${workingDirectory}`,
  ];
  if (distinct) {
    lines.push(`- Scratch space: ${scratchDirectory}`);
  }
  lines.push(
    `- Time zone: ${timeZone}`,
    '',
    'Relative paths in file operations are resolved from the working directory. Shell commands start in the working directory by default, though shell cwd can change between command calls when commands change directories.',
  );

  if (distinct) {
    lines.push(
      '',
      '## Working Directory vs Scratch Space',
      '',
      'You have access to two locations:',
      '',
      `- The working directory (${workingDirectory}) is where the task lives. Everything the user expects as an output of the task — code, docs, and any files that are part of the deliverable — belongs here. Relative paths resolve here.`,
      `- The scratch space (${scratchDirectory}) is a private area for this session. Use it for files that support your work but are not part of the task's output: temporary notes, plans, intermediate artifacts, downloaded references, and throwaway scripts. Address it by its absolute path. It persists for the life of the session and is discarded when the session is deleted.`,
      '',
      'Keep the two separate: do not leave scratch or intermediate files in the working directory, and do not place deliverables in the scratch space. When unsure whether a file is a deliverable, keep it in the scratch space and tell the user.',
    );
  } else {
    lines.push(
      '',
      '## Scratch Space',
      '',
      `This session has no project repository. Your working directory (${scratchDirectory}) is a private scratch space for this session: use it for any files you need to create while working — notes, drafts, downloaded references, and intermediate artifacts. It persists for the life of the session and is discarded when the session is deleted.`,
    );
  }

  return lines.join('\n');
}
```

Update `buildSystemPrompt`'s signature and final call (lines 75–108). Change the signature to add `scratchDirectory: string,` after `workingDirectory: string,`, and change the final environment append (line 106) to:

```ts
prompt += `\n\n${buildEnvironmentSection(workingDirectory, scratchDirectory)}`;
```

- [ ] **Step 4: Pass the scratch dir from the turn runner**

In `src/agent-core/agent/agent-turn-runner.ts`, update the `buildSystemPrompt(...)` call (lines 76–81) to pass the scratch directory:

```ts
const systemPrompt = buildSystemPrompt(
  input.baseSystemPrompt,
  input.toolRegistries,
  input.skillRegistries,
  input.workingDirectory,
  input.scratchDirectory,
);
```

- [ ] **Step 5: Run tests + typecheck**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/catalog/agent-catalog.test.ts`
Expected: PASS.

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/agent-core/agent/catalog/agent-catalog.ts src/agent-core/agent/catalog/agent-catalog.test.ts src/agent-core/agent/agent-turn-runner.ts
git commit -m "feat(agent-core): describe working directory vs scratch space in system prompt"
```

---

### Task 6: Relocate agent-facing temp outputs into scratch

Route the retained large outputs of `web_fetch` and `run_command` into the scratch directory instead of `os.tmpdir()`.

**Files:**

- Modify: `src/helpers/fs.ts`
- Modify: `src/helpers/fs.test.ts`
- Modify: `src/helpers/shell-command-runner.ts`
- Modify: `src/agent/tools/bash/run-command.ts`
- Modify: `src/agent/tools/web/web-fetch.ts`
- Test: `src/agent/tools/web/web-fetch.test.ts`

**Interfaces:**

- Consumes: `ToolExecutionContext.scratchDirectory` (Task 3).
- Produces:
  - `writeToTempFile(content: string, extension: string, dir?: string): Promise<string>` (default `os.tmpdir()`).
  - `createTempFileWriteStream(extension: string, dir?: string): {filePath; stream}` (default `os.tmpdir()`).
  - `new ShellCommandRunner(command, cwd, timeout, signal?, outputDir?)` (default `os.tmpdir()`).

- [ ] **Step 1: Write failing tests for the helper dir parameter**

In `src/helpers/fs.test.ts`, add a test that `writeToTempFile` honors a target dir (add `mkdtemp`/`realpath` usage):

```ts
it('writes under a provided directory when given one', async () => {
  const dir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'wtf-dir-')),
  );
  filePath = await writeToTempFile('scoped', '.md', dir);
  expect(path.dirname(filePath)).toBe(dir);
  const content = await fs.readFile(filePath, 'utf-8');
  expect(content).toBe('scoped');
  await fs.rm(dir, {recursive: true, force: true});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/helpers/fs.test.ts`
Expected: FAIL — `writeToTempFile` ignores the third argument (writes under `os.tmpdir()`).

- [ ] **Step 3: Add the `dir` parameter to the fs helpers**

In `src/helpers/fs.ts`, replace the two helpers (lines 54–71) with:

```ts
/** Writes content to a temporary file and returns the absolute path. */
export async function writeToTempFile(
  content: string,
  extension: string,
  dir: string = os.tmpdir(),
): Promise<string> {
  const filePath = path.join(dir, `${crypto.randomUUID()}${extension}`);
  await fs.writeFile(filePath, content, 'utf-8');
  return filePath;
}

/** Creates a writable stream to a new temporary file. */
export function createTempFileWriteStream(
  extension: string,
  dir: string = os.tmpdir(),
): {
  filePath: string;
  stream: WriteStream;
} {
  const filePath = path.join(dir, `${crypto.randomUUID()}${extension}`);
  return {filePath, stream: createWriteStream(filePath, 'utf-8')};
}
```

- [ ] **Step 4: Run to verify the helper test passes**

Run: `pnpm --filter @omnicraft/backend test src/helpers/fs.test.ts`
Expected: PASS.

- [ ] **Step 5: Give `ShellCommandRunner` an output directory**

In `src/helpers/shell-command-runner.ts`:

- Add a field and constructor parameter (after line 58 / in the constructor at lines 62–76):

```ts
  private readonly outputDir: string;
```

Update the constructor signature and body:

```ts
  constructor(
    command: string,
    cwd: string,
    timeout: number,
    signal?: AbortSignal,
    outputDir: string = os.tmpdir(),
  ) {
    this.command = command;
    this.cwd = cwd;
    this.timeout = timeout;
    this.signal = signal;
    this.outputDir = outputDir;
    this.cwdFilePath = path.join(
      os.tmpdir(),
      `omni-cwd-${crypto.randomUUID()}.txt`,
    );
  }
```

- In `run()`, change the stdout/stderr stream creation (lines 83–84) to use the output dir:

```ts
const stdoutFile = createTempFileWriteStream('.txt', this.outputDir);
const stderrFile = createTempFileWriteStream('.txt', this.outputDir);
```

(The cwd-capture file stays in `os.tmpdir()` — it is internal and never surfaced.)

- [ ] **Step 6: Pass scratch into the runner from `run_command`**

In `src/agent/tools/bash/run-command.ts`, update the `ShellCommandRunner` construction (lines 107–112) to pass `scratchDirectory` (already destructured in Task 4):

```ts
const result = await new ShellCommandRunner(
  args.command,
  shellState.cwd,
  timeout,
  signal,
  scratchDirectory,
).run({onStdoutData: onOutput});
```

- [ ] **Step 7: Route large `web_fetch` content into scratch + test**

In `src/agent/tools/web/web-fetch.ts`:

- Change the execute signature to use the context (line 121): `async execute(args: WebFetchArgs, context: ToolExecutionContext) {`
- Change the temp-file write (line 189): `filePath = await writeToTempFile(content, '.md', context.scratchDirectory);`

In `src/agent/tools/web/web-fetch.test.ts`, tighten the existing "large content fallback" test to assert the file lands in scratch. Update `beforeEach` to set a scratch dir, and extend the assertion:

```ts
let tmpDir: string;
let scratchDir: string;
let context: ToolExecutionContext;

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'wf-test-'));
  scratchDir = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), 'wf-scratch-')),
  );
  context = createMockContext({
    workingDirectory: tmpDir,
    scratchDirectory: scratchDir,
  });
});

afterEach(async () => {
  await fs.rm(tmpDir, {recursive: true, force: true});
  await fs.rm(scratchDir, {recursive: true, force: true});
});
```

In the "writes content to temp file when exceeding 32KB" test, after asserting `result.data.content` add:

```ts
expect(result.data.content).toContain(scratchDir);
```

- [ ] **Step 8: Run affected tests + typecheck**

Run:

```bash
pnpm --filter @omnicraft/backend test src/helpers/fs.test.ts src/agent/tools/bash/run-command.test.ts src/agent/tools/web/web-fetch.test.ts
```

Expected: PASS. (The run-command "Output saved to file:" test now writes under the scratch dir set in Task 4's `beforeEach`.)

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/helpers/fs.ts src/helpers/fs.test.ts src/helpers/shell-command-runner.ts src/agent/tools/bash/run-command.ts src/agent/tools/web/web-fetch.ts src/agent/tools/web/web-fetch.test.ts
git commit -m "feat(agent): write large web_fetch and run_command outputs into scratch"
```

---

### Task 7: Full backend verification

Confirm the whole backend suite and static checks pass after all changes.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck**

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: PASS.

- [ ] **Step 2: Lint**

Run: `pnpm --filter @omnicraft/backend lint`
Expected: PASS (no `console`, no `any`, import order, no non-null `!`).

- [ ] **Step 3: Full test suite**

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS — all suites green, no leaked `os.tmpdir()/{id}/scratch` directories from `agent.test.ts` (verified by the `track()` cleanup added in Task 3).

- [ ] **Step 4: Commit (if lint/format changed anything)**

```bash
git add -A
git commit -m "chore(backend): verification pass for scratch space" || echo "nothing to commit"
```

---

## Notes / deliberately out of scope

- **Backward-compat hardening for legacy chat snapshots** (they persisted a resolved `os.tmpdir()/{id}` cwd) is intentionally not implemented — confirmed optional. New sessions persist `undefined` and adopt scratch correctly; old chat sessions keep a stale tmp cwd (matching pre-change behavior) until they age out.
- **Subagents** derive their own scratch (`{parentSessionsDir}/{parentId}/subagents/{subId}/scratch`) automatically via the base `Agent` — no code change and no cross-agent sharing. The dispatch tool is untouched.
- No changes to settings/workspace validation, tool schemas, or the frontend.

## Self-Review

- **Spec coverage:** scratch dir + ownership (Tasks 1–3), cwd defaulting to scratch (Task 3), persistence of primary only (Task 3), context plumbing (Task 3), dual-root run_command guard (Task 4), two prompt templates (Task 5), temp-output relocation for web_fetch + run_command (Task 6), lifecycle/delete (inherited — no code, covered in notes), subagents (notes), out-of-scope items (notes). All spec sections map to a task.
- **Placeholder scan:** no TBD/TODO; every code step shows complete code. The one `require(...)` inline is explicitly flagged to be replaced by a top-level import in the same step.
- **Type consistency:** `scratchDirectory: string` is used identically across `ToolExecutionContext`, `BuildToolExecutionContextInput`, `ExecuteAgentToolInput`, `RunAgentTurnInput`, and the `Agent`; `createScratchDirectory(sessionsDir, agentId)` and `getScratchDirectory()` names match between definition (Tasks 2–3) and use.
