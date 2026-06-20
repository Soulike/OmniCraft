# Persist the TODO List in the Agent Snapshot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist a per-agent TODO list in the agent snapshot so a restored / evicted-and-reloaded agent recovers the TODO items it had before, keeping the backend's `TodoStore` consistent with the UI.

**Architecture:** Mirror the existing `llmSession` persistence path. `TodoStore` gains a `toSnapshot()` and a constructor that accepts initial items + version. `AgentRuntimeState` threads an optional todo snapshot into the `TodoStore` it builds. `agentSnapshotSchema` gains a `todos` field (reusing `sseTodoItemSchema`), populated by `Agent.toSnapshot()` and fed back into the `AgentRuntimeState` constructed in `Agent`'s restore branch.

**Tech Stack:** TypeScript, Zod, Vitest. Bun is the runtime/package manager; code uses Node.js APIs only.

---

## Background (verified against current code)

- `TodoStore` (`apps/backend/src/agent-core/agent/state/todo-store.ts`) holds `items: TodoItem[]` + `_version`, with field initializers `items = []` / `_version = 0` and no serialization.
- `AgentRuntimeState` (`apps/backend/src/agent-core/agent/agent-runtime-state.ts:34`) does `new TodoStore()` unconditionally; its constructor only takes `workingDirectory`. It exposes `todoVersion` and `listTodos()`.
- `Agent` (`apps/backend/src/agent-core/agent/agent.ts:133`) builds `this.runtimeState = new AgentRuntimeState(this.workingDirectory)` **outside** the `if (snapshot) / else` branch, so the snapshot path never feeds TODO state in.
- `agentSnapshotSchema` (`apps/backend/src/agent-core/agent/types.ts:34`) persists only `id`, `title`, `sseEventCount`, `llmSession`, `options`.
- `agentPersistence.loadSnapshot()` runs `agentSnapshotSchema.parse(json)` (`persistence/agent-persistence.ts:93`), so a new field with `.default([])` upgrades pre-existing on-disk snapshots without breaking validation.
- `TodoItem` (in `todo-store.ts`) is structurally identical to `SseTodoItem` / `sseTodoItemSchema` (`packages/sse-events/src/schema.ts:133`). Both `sseTodoItemSchema` and `SseTodoItem` are re-exported from `@omnicraft/sse-events`.

## Design decisions

- **Reuse `sseTodoItemSchema`** for the snapshot field — no parallel schema. The persisted shape is `SseTodoItem[]`.
- **Persist `version` too.** Keeps `todoVersion` monotonic across restore so it stays a meaningful staleness counter. The stop-check token map is _not_ persisted (ephemeral, out of scope), so a restored session may still fire one first-boundary reminder — that is accepted as harmless per #300. Persisting the version is for clean `todoVersion` semantics, not to suppress that reminder.
- **Backward compatibility:** the new `todos` field uses `.default([])`, so old snapshots load as an empty TODO list rather than failing validation.
- **`version` is not in the on-disk schema.** The snapshot stores only `todos: SseTodoItem[]`. On restore, `TodoStore`'s version is seeded from the restored item set (see Task 1) so we don't widen the persisted schema for a derived counter.

## Out of scope (per issue #301)

Persisting other `AgentRuntimeState` slices — file cache, file stat tracker, shell state, `TodoState.lastObservedVersion`, stop-check token map. These are legitimately ephemeral.

## File Structure

- **Modify** `apps/backend/src/agent-core/agent/state/todo-store.ts` — add constructor arg + `toSnapshot()`.
- **Modify** `apps/backend/src/agent-core/agent/state/todo-store.test.ts` — round-trip tests.
- **Modify** `apps/backend/src/agent-core/agent/agent-runtime-state.ts` — accept optional initial todos, pass to `TodoStore`.
- **Modify** `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts` — restore-state test.
- **Modify** `apps/backend/src/agent-core/agent/types.ts` — add `todos` to `agentSnapshotSchema`.
- **Modify** `apps/backend/src/agent-core/agent/agent.ts` — populate `todos` in `toSnapshot()`; feed snapshot todos into `AgentRuntimeState` in the restore branch.
- **Modify** `apps/backend/src/agent-core/agent/agent.test.ts` — restore round-trip test.

**Test command (run from `apps/backend`):** `bun run test` (Vitest). Never `bun test`.

---

### Task 1: `TodoStore` — restore via constructor + `toSnapshot()`

**Files:**

- Modify: `apps/backend/src/agent-core/agent/state/todo-store.ts`
- Test: `apps/backend/src/agent-core/agent/state/todo-store.test.ts`

- [ ] **Step 1: Write the failing tests**

Append to `todo-store.test.ts` inside the top-level `describe('TodoStore', ...)` block (before its closing `});`):

```typescript
describe('snapshot round-trip', () => {
  it('toSnapshot returns the current items', () => {
    const store = new TodoStore();
    store.append([
      {subject: 'Task A', description: 'Do A'},
      {subject: 'Task B', description: 'Do B'},
    ]);
    store.update(1, {status: 'in_progress'});

    expect(store.toSnapshot()).toEqual([
      {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
      {
        index: 1,
        subject: 'Task B',
        description: 'Do B',
        status: 'in_progress',
      },
    ]);
  });

  it('restores items from a snapshot passed to the constructor', () => {
    const source = new TodoStore();
    source.append([{subject: 'Task A', description: 'Do A'}]);
    source.update(0, {status: 'completed'});

    const restored = new TodoStore(source.toSnapshot());

    expect(restored.list()).toEqual(source.list());
  });

  it('seeds version to 1 when restoring a non-empty snapshot', () => {
    const restored = new TodoStore([
      {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
    ]);

    expect(restored.version).toBe(1);
  });

  it('keeps version at 0 when restoring an empty snapshot', () => {
    const restored = new TodoStore([]);

    expect(restored.version).toBe(0);
  });

  it('appends after a restore using indices past the restored items', () => {
    const restored = new TodoStore([
      {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
    ]);
    restored.append([{subject: 'Task B', description: 'Do B'}]);

    expect(restored.list()).toEqual([
      {index: 0, subject: 'Task A', description: 'Do A', status: 'pending'},
      {index: 1, subject: 'Task B', description: 'Do B', status: 'pending'},
    ]);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run (from `apps/backend`): `bun run test src/agent-core/agent/state/todo-store.test.ts`
Expected: FAIL — `TodoStore` constructor takes no arguments and `toSnapshot` does not exist.

- [ ] **Step 3: Implement the constructor + `toSnapshot()`**

In `todo-store.ts`:

1. Add the import at the top (next to the existing `SseTodoStatus` import):

```typescript
import type {SseTodoItem, SseTodoStatus} from '@omnicraft/sse-events';
```

2. Replace the field initializers and add a constructor. Change:

```typescript
export class TodoStore {
  private items: TodoItem[] = [];

  private _version = 0;
```

to:

```typescript
export class TodoStore {
  private items: TodoItem[];

  private _version: number;

  /**
   * @param initialItems Items to restore from a snapshot. When non-empty, the
   *   version starts at 1 so it reads as "mutated since empty"; an empty or
   *   absent snapshot starts at version 0.
   */
  constructor(initialItems: readonly SseTodoItem[] = []) {
    this.items = initialItems.map((item) => ({...item}));
    this._version = initialItems.length === 0 ? 0 : 1;
  }
```

3. Add `toSnapshot()` next to `list()` (a snapshot is structurally a `SseTodoItem[]`):

```typescript
  /** Returns a serializable snapshot of all items. */
  toSnapshot(): SseTodoItem[] {
    return this.items.map((item) => ({...item}));
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run (from `apps/backend`): `bun run test src/agent-core/agent/state/todo-store.test.ts`
Expected: PASS (all `TodoStore` tests, including the pre-existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/state/todo-store.ts apps/backend/src/agent-core/agent/state/todo-store.test.ts
git commit -m "feat(agent): add TodoStore snapshot serialization"
```

---

### Task 2: `AgentRuntimeState` — accept and expose restored todos

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-runtime-state.ts`
- Test: `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `agent-runtime-state.test.ts`, inside `describe('AgentRuntimeState', ...)` (before its closing `});`). The top of the file already imports `AgentRuntimeState`; add the sse-events import alongside the existing imports:

```typescript
import type {SseTodoItem} from '@omnicraft/sse-events';
```

Then the test:

```typescript
it('restores todos and version from an initial snapshot', () => {
  const todos: SseTodoItem[] = [
    {
      index: 0,
      subject: 'Restored task',
      description: 'From snapshot',
      status: 'in_progress',
    },
  ];
  const state = new AgentRuntimeState('/workspace/project', todos);

  expect(state.listTodos()).toEqual(todos);
  expect(state.todoVersion).toBe(1);
});

it('defaults to an empty todo list when no snapshot is provided', () => {
  const state = new AgentRuntimeState('/workspace/project');

  expect(state.listTodos()).toEqual([]);
  expect(state.todoVersion).toBe(0);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/backend`): `bun run test src/agent-core/agent/agent-runtime-state.test.ts`
Expected: FAIL — `AgentRuntimeState` constructor takes a second arg that does not exist yet.

- [ ] **Step 3: Implement the constructor change**

In `agent-runtime-state.ts`:

1. Add to the `@omnicraft/sse-events` import (currently `import type {SseSubAgentEvent} from '@omnicraft/sse-events';`):

```typescript
import type {SseSubAgentEvent, SseTodoItem} from '@omnicraft/sse-events';
```

2. Change the `todoStore` field from an initializer to a declaration, and build it in the constructor. Replace:

```typescript
  private readonly todoStore = new TodoStore();
```

with:

```typescript
  private readonly todoStore: TodoStore;
```

3. Update the constructor to accept and pass the initial todos:

```typescript
  constructor(workingDirectory: string, initialTodos?: readonly SseTodoItem[]) {
    this.shellState = {cwd: workingDirectory};
    this.todoStore = new TodoStore(initialTodos);
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run (from `apps/backend`): `bun run test src/agent-core/agent/agent-runtime-state.test.ts`
Expected: PASS (including the pre-existing isolation tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-runtime-state.ts apps/backend/src/agent-core/agent/agent-runtime-state.test.ts
git commit -m "feat(agent): thread restored todos through AgentRuntimeState"
```

---

### Task 3: Add `todos` to the snapshot schema

**Files:**

- Modify: `apps/backend/src/agent-core/agent/types.ts`

- [ ] **Step 1: Add the schema field**

In `types.ts`:

1. Add `sseTodoItemSchema` to the `@omnicraft/sse-events` import. The current import is:

```typescript
import type {SseErrorEvent, SseEvent} from '@omnicraft/sse-events';
```

Split it so the schema is a value import (the existing line is type-only):

```typescript
import {sseTodoItemSchema} from '@omnicraft/sse-events';
import type {SseErrorEvent, SseEvent} from '@omnicraft/sse-events';
```

2. Add the `todos` field to `agentSnapshotSchema`. Change:

```typescript
export const agentSnapshotSchema = z.object({
  id: agentIdSchema,
  title: z.string(),
  sseEventCount: z.number(),
  llmSession: llmSessionSnapshotSchema,
  options: agentSnapshotOptionsSchema,
});
```

to:

```typescript
export const agentSnapshotSchema = z.object({
  id: agentIdSchema,
  title: z.string(),
  sseEventCount: z.number(),
  llmSession: llmSessionSnapshotSchema,
  // Defaulted so snapshots written before TODO persistence still validate,
  // restoring as an empty list.
  todos: z.array(sseTodoItemSchema).default([]),
  options: agentSnapshotOptionsSchema,
});
```

- [ ] **Step 2: Verify the package type-checks**

Run (from `apps/backend`): `bun run test src/agent-core/agent/types` — or, if there is no dedicated types test, defer verification to Task 4/5 where the field is exercised. At minimum confirm no TypeScript error:

Run (from `apps/backend`): `bunx tsc --noEmit` (or the repo's configured typecheck script if present in `package.json`).
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add apps/backend/src/agent-core/agent/types.ts
git commit -m "feat(agent): add todos field to agent snapshot schema"
```

---

### Task 4: `Agent` — populate and restore todos

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Write the failing test**

In `agent.test.ts`, inside `describe('Agent snapshot restore', ...)` (the block starting at line 816), add a round-trip test. Use the same snapshot shape the existing tests use, plus a `todos` array. Note: the restore-without-workingDirectory test at line 888 builds a `snapshot` literal — model the new one on that but with an explicit `workingDirectory` (use `realpathSync(os.tmpdir())`) so it doesn't create a tmp dir, and with todos populated:

```typescript
it('restores the TODO list from a snapshot', () => {
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
    todos: [
      {index: 0, subject: 'Task A', description: 'Do A', status: 'completed'},
      {index: 1, subject: 'Task B', description: 'Do B', status: 'pending'},
    ],
    options: {
      workingDirectory: realpathSync(os.tmpdir()),
      thinkingLevel: 'high',
    },
  };

  const agent = new TestAgent(
    () => Promise.resolve(MAIN_CONFIG),
    defaultedOptions(),
    snapshot,
  );

  expect(agent.toSnapshot().todos).toEqual(snapshot.todos);
});

it('round-trips todos through toSnapshot when none are set', () => {
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
    options: {
      workingDirectory: realpathSync(os.tmpdir()),
      thinkingLevel: 'high',
    },
  };

  const agent = new TestAgent(
    () => Promise.resolve(MAIN_CONFIG),
    defaultedOptions(),
    snapshot,
  );

  expect(agent.toSnapshot().todos).toEqual([]);
});
```

Note: `defaultedOptions`, `realpathSync`, `os`, `crypto`, `emptyUsage`, `MAIN_CONFIG`, and `TestAgent` are already imported/defined in this test file (verify the imports are in scope at the top of the file; `defaultedOptions` is defined in the `Agent default working directory` describe block — if it is not in scope for the `Agent snapshot restore` block, inline an equivalent: `const {workingDirectory: _omit, ...rest} = testAgentOptions();` and pass `rest`).

- [ ] **Step 2: Run the test to verify it fails**

Run (from `apps/backend`): `bun run test src/agent-core/agent/agent.test.ts`
Expected: FAIL — `agent.toSnapshot().todos` is `undefined` (field not populated) and the restore branch ignores snapshot todos.

- [ ] **Step 3: Populate `todos` in `toSnapshot()`**

In `agent.ts`, update `toSnapshot()` (line ~173) to include todos:

```typescript
  toSnapshot(): AgentSnapshot {
    return {
      id: this.id,
      title: this.title,
      sseEventCount: this.sseEventCount,
      llmSession: this.llmSession.toSnapshot(),
      todos: this.runtimeState.listTodos(),
      options: {
        workingDirectory: this.workingDirectory,
        thinkingLevel: this.thinkingLevel,
      },
    };
  }
```

- [ ] **Step 4: Feed snapshot todos into `AgentRuntimeState`**

In `agent.ts`, the `runtimeState` is currently built once at line ~133, outside the `if (snapshot) / else`. Replace:

```typescript
this.runtimeState = new AgentRuntimeState(this.workingDirectory);
```

with a snapshot-aware build. `snapshot` is in scope here:

```typescript
this.runtimeState = new AgentRuntimeState(
  this.workingDirectory,
  snapshot?.todos,
);
```

(`snapshot?.todos` is `SseTodoItem[] | undefined`; the `AgentRuntimeState` constructor's `initialTodos` is optional and defaults to `[]`.)

- [ ] **Step 5: Run the test to verify it passes**

Run (from `apps/backend`): `bun run test src/agent-core/agent/agent.test.ts`
Expected: PASS (including the pre-existing snapshot-restore tests — they omit `todos`, which now defaults to `[]` via the schema when loaded from disk; note the in-memory `AgentSnapshot` literals in those older tests do **not** set `todos`, so confirm those tests still construct `TestAgent` directly without going through `agentSnapshotSchema.parse`. They pass the literal straight to the constructor, where `snapshot?.todos` is simply `undefined` → empty list. No change needed to them.)

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "feat(agent): persist and restore the TODO list in agent snapshots"
```

---

### Task 5: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the backend test suite**

Run (from `apps/backend`): `bun run test`
Expected: PASS — all tests green, including pre-existing snapshot persistence tests (`llm-session`, `agent`, `agent-runtime-state`) and the new TODO round-trip tests.

- [ ] **Step 2: Lint + format check**

Run (from `apps/backend`, using whatever scripts `package.json` defines — typically): `bun run lint` and `bun run format` (or the repo's check variants).
Expected: clean. Do not re-run tests solely because a pre-commit hook reformatted files.

- [ ] **Step 3: Final commit (only if lint/format produced changes)**

```bash
git add -A
git commit -m "chore(agent): lint/format after TODO persistence"
```

---

## Self-Review

**Spec coverage (issue #301 acceptance criteria):**

- "A restored agent's `listTodos()` returns the TODO list it had before eviction." → Task 4 Step 4 (restore branch feeds `snapshot.todos` into `AgentRuntimeState`), proven by Task 4 Step 1 test and Task 2 test.
- "Snapshot round-trips through `agentSnapshotSchema` validation." → Task 3 adds the field with `.default([])`; the parse happens in `agentPersistence.loadSnapshot`. Round-trip asserted in Task 4 tests.
- "Existing snapshot persistence tests still pass; a new test covers TODO round-trip." → Task 5 Step 1 runs the full suite; new tests in Tasks 1, 2, 4.

**Proposed-approach coverage:**

- `toSnapshot()` / restore path on `TodoStore` → Task 1.
- `AgentRuntimeState` constructor accepts optional initial todo snapshot → Task 2.
- `todos` field on `agentSnapshotSchema` + populated in `Agent.toSnapshot()` + passed into the restore-branch `AgentRuntimeState` → Tasks 3, 4.
- Reuse `sseTodoItemSchema` → Tasks 1 (`SseTodoItem` type) and 3 (schema).

**Type consistency:** `TodoStore` constructor arg `initialItems: readonly SseTodoItem[]`; `AgentRuntimeState` arg `initialTodos?: readonly SseTodoItem[]`; `Agent` passes `snapshot?.todos` (`SseTodoItem[] | undefined`). `toSnapshot()` on `TodoStore` returns `SseTodoItem[]`; `Agent.toSnapshot().todos` is `SseTodoItem[]` via `listTodos()` (returns `TodoItem[]`, structurally assignable to `SseTodoItem[]`). Consistent.

**Note on `listTodos()` return type:** `listTodos()` returns `TodoItem[]`, and the schema field is `SseTodoItem[]`. These are structurally identical, so assignment in `toSnapshot()` type-checks. If the compiler objects (it should not, since both are `{index, subject, description, status}`), change `toSnapshot()` to use `this.runtimeState.listTodos()` unchanged — no cast needed.
