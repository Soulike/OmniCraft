# Coding Task `waiting` Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Source the coding task list's `waiting` status from a real backend signal so a session blocked on a client-side tool call (e.g. `ask_user`) shows the already-built `waiting` indicator.

**Architecture:** Add an orthogonal boolean `isWaitingForInput` that mirrors the existing `isRunning` mechanism end-to-end: a `UserInteractionBridge.hasPending` getter (source of truth) → delegating getters on `AgentRuntimeState` and `Agent` → an `AgentStore.getWaitingIds()` cache scan → injected onto each `SessionMetadata` in `CodingAgentStore.listSessionMetadata` → carried on the existing 3s `GET /coding/sessions` poll → one new branch in the `useTaskStatuses` derivation hook. Because a blocked agent is _also_ running, the frontend must derive `waiting` **before** `running`.

**Tech Stack:** TypeScript, Node.js, Zod (api-schema), Vitest, React, PNPM monorepo.

## Global Constraints

- Package manager is **PNPM**. Run package scripts with `pnpm --filter <pkg> <script>`.
- **Never use `any`** — use `unknown` and narrow, or precise types.
- **Node.js runtime only** — use `node:*` APIs; no alternative-runtime APIs.
- **No default exports** in backend (`@omnicraft/backend`); use named exports.
- Relative imports use the **`.js`** extension (nodenext resolution).
- **No `console`** in backend production code (tests may use Vitest only).
- File names are **kebab-case**; unit test files are `<file-name>.test.ts(x)`.
- Use **early-return** style for `if`.
- Do not add npm packages (none needed here).
- Scope is **coding store only** — do not touch the main/chat store or the `TaskStatusIndicator` component (its `waiting` visual already ships from #348).

**Package names / test commands:**

- Backend: `@omnicraft/backend` — `pnpm --filter @omnicraft/backend test <path>` (runs `vitest run <path>`), typecheck `pnpm --filter @omnicraft/backend run typecheck`.
- api-schema: `@omnicraft/api-schema` — `pnpm --filter @omnicraft/api-schema test <path>`.
- Frontend: `@omnicraft/frontend` — `pnpm --filter @omnicraft/frontend test <path>`.

---

### Task 1: `UserInteractionBridge.hasPending`

The leaf source of truth: a pending interaction exists only while a client-side tool's `execute` is blocked in `waitForResponse`. This is the only step with real branching logic.

**Files:**

- Modify: `apps/backend/src/agent-core/user-interaction/user-interaction-bridge.ts`
- Test: `apps/backend/src/agent-core/user-interaction/user-interaction-bridge.test.ts` (create)

**Interfaces:**

- Consumes: nothing (leaf).
- Produces: `UserInteractionBridge.hasPending: boolean` (getter) — `true` iff at least one interaction is awaiting a response.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/agent-core/user-interaction/user-interaction-bridge.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {UserInteractionBridge} from './user-interaction-bridge.js';

describe('UserInteractionBridge.hasPending', () => {
  it('is false when nothing is pending', () => {
    const bridge = new UserInteractionBridge();
    expect(bridge.hasPending).toBe(false);
  });

  it('is true while an interaction is awaiting a response', () => {
    const bridge = new UserInteractionBridge();
    void bridge.waitForResponse('c1');
    expect(bridge.hasPending).toBe(true);
  });

  it('is false again after the response is submitted', async () => {
    const bridge = new UserInteractionBridge();
    const pending = bridge.waitForResponse('c1');
    bridge.submitResponse('c1', {ok: true});
    await pending;
    expect(bridge.hasPending).toBe(false);
  });

  it('is false again after the waiting signal aborts', async () => {
    const bridge = new UserInteractionBridge();
    const controller = new AbortController();
    const pending = bridge.waitForResponse('c1', controller.signal);
    expect(bridge.hasPending).toBe(true);
    controller.abort();
    await expect(pending).rejects.toThrow();
    expect(bridge.hasPending).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/user-interaction/user-interaction-bridge.test.ts`
Expected: FAIL — `bridge.hasPending` is `undefined` (getter not defined), so the first assertion `expect(undefined).toBe(false)` fails.

- [ ] **Step 3: Add the getter**

In `user-interaction-bridge.ts`, immediately after the `private readonly pending = new Map<...>();` field block (before `waitForResponse`), add:

```ts
  /** Whether any interaction is currently awaiting a user response. */
  get hasPending(): boolean {
    return this.pending.size > 0;
  }
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/user-interaction/user-interaction-bridge.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/user-interaction/user-interaction-bridge.ts apps/backend/src/agent-core/user-interaction/user-interaction-bridge.test.ts
git commit -m "feat(backend): add UserInteractionBridge.hasPending accessor"
```

---

### Task 2: Plumb `isWaitingForInput` through `AgentRuntimeState` and `Agent`

Two delegating getters that carry the bridge signal up to where the store can read it. The runtime-state test also verifies the non-obvious wiring invariant: `buildToolExecutionContext` hands tools the **same** bridge instance the getter reads (a second bridge would silently break the feature).

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent-runtime-state.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Test: `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts` (create)

**Interfaces:**

- Consumes: `UserInteractionBridge.hasPending` (Task 1).
- Produces:
  - `AgentRuntimeState.isWaitingForInput: boolean` (getter) → the runtime state's bridge `hasPending`.
  - `Agent.isWaitingForInput: boolean` (getter) → `this.runtimeState.isWaitingForInput`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/agent-core/agent/agent-runtime-state.test.ts`:

```ts
import os from 'node:os';

import {describe, expect, it} from 'vitest';

import type {LlmConfig} from '../llm-api/index.js';
import {AgentRuntimeState} from './agent-runtime-state.js';
import {SubagentRegistry} from './state/subagent-registry.js';

const CONFIG: LlmConfig = {
  apiFormat: 'claude',
  apiKey: '',
  baseUrl: 'https://api.anthropic.com',
  model: 'mock-model',
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};

describe('AgentRuntimeState.isWaitingForInput', () => {
  it('reflects a pending client-tool interaction on its own bridge', async () => {
    const state = new AgentRuntimeState(os.tmpdir());
    const context = state.buildToolExecutionContext({
      callId: 'c1',
      agentId: 'a1',
      sessionsDir: null,
      subagentRegistry: new SubagentRegistry(),
      availableSkills: new Map(),
      workingDirectory: os.tmpdir(),
      signal: new AbortController().signal,
      onSubAgentEvent: () => {
        // noop — the delegation test ignores subagent events
      },
      getConfig: () => Promise.resolve(CONFIG),
      getTierConfig: () => Promise.resolve(CONFIG),
    });

    expect(state.isWaitingForInput).toBe(false);
    const pending = context.userInteractionBridge.waitForResponse('c1');
    expect(state.isWaitingForInput).toBe(true);
    state.submitUserResponse('c1', {ok: true});
    await pending;
    expect(state.isWaitingForInput).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent-runtime-state.test.ts`
Expected: FAIL — `state.isWaitingForInput` does not exist (TypeScript error / `undefined`), so `expect(undefined).toBe(false)` fails.

- [ ] **Step 3: Add the runtime-state getter**

In `agent-runtime-state.ts`, add immediately after the `submitUserResponse` method:

```ts
  /** Whether a client-side tool call is currently blocked awaiting the user. */
  get isWaitingForInput(): boolean {
    return this.userInteractionBridge.hasPending;
  }
```

- [ ] **Step 4: Add the Agent getter**

In `agent.ts`, add immediately after the `isRunning` getter (which ends at the line `return this.pendingTurnCount > 0 || this.isGeneratingTitle;` and its closing brace):

```ts
  /** Whether a client-side tool call is blocked awaiting the user's response. */
  get isWaitingForInput(): boolean {
    return this.runtimeState.isWaitingForInput;
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent-runtime-state.test.ts`
Expected: PASS (1 test).

- [ ] **Step 6: Typecheck (covers the `Agent` delegation)**

Run: `pnpm --filter @omnicraft/backend run typecheck`
Expected: no errors. (The `Agent.isWaitingForInput` getter is a pure one-line delegation mirroring the shipped `isRunning`; its correctness is a compile-time concern and it is exercised end-to-end by the store scan in Task 4.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent-runtime-state.ts apps/backend/src/agent-core/agent/agent-runtime-state.test.ts apps/backend/src/agent-core/agent/agent.ts
git commit -m "feat(backend): expose Agent.isWaitingForInput via runtime state"
```

---

### Task 3: Add `isWaitingForInput` to `sessionMetadataSchema`

The transport field. Optional for backward compatibility; present so it survives the client-side `parse()` (default `z.object` strips unknown keys).

**Files:**

- Modify: `packages/api-schema/src/chat/schema.ts:52-58`
- Test: `packages/api-schema/src/chat/schema.test.ts`

**Interfaces:**

- Consumes: nothing.
- Produces: `SessionMetadata.isWaitingForInput?: boolean` (Zod-inferred type field), round-tripping through `sessionMetadataSchema` and `listSessionsResponseSchema`.

- [ ] **Step 1: Write the failing tests**

In `packages/api-schema/src/chat/schema.test.ts`, ensure `listSessionsResponseSchema` is imported (add it to the existing import from `./schema.js`):

```ts
import {
  chatCompletionsRequestSchema,
  createCodingSessionRequestSchema,
  createSessionRequestSchema,
  listSessionsResponseSchema,
  sessionMetadataSchema,
} from './schema.js';
```

Then add these tests inside the existing `describe('sessionMetadataSchema', ...)` block (after the `isRunning` tests):

```ts
it('preserves isWaitingForInput when present', () => {
  const parsed = sessionMetadataSchema.parse({
    id: ID,
    title: 'T',
    isWaitingForInput: true,
  });
  expect(parsed.isWaitingForInput).toBe(true);
});

it('parses without isWaitingForInput (backward compatible)', () => {
  const parsed = sessionMetadataSchema.parse({id: ID, title: 'T'});
  expect(parsed.isWaitingForInput).toBeUndefined();
});

it('round-trips isWaitingForInput through listSessionsResponseSchema', () => {
  const parsed = listSessionsResponseSchema.parse({
    sessions: [{id: ID, title: 'T', isWaitingForInput: true}],
    total: 1,
  });
  expect(parsed.sessions[0].isWaitingForInput).toBe(true);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/api-schema test src/chat/schema.test.ts`
Expected: FAIL — `parsed.isWaitingForInput` is `undefined` on the "preserves" and "round-trips" tests (the default `z.object` strips the unknown key), so `expect(undefined).toBe(true)` fails.

- [ ] **Step 3: Add the schema field**

In `schema.ts`, add the field to `sessionMetadataSchema` immediately after the `isRunning` line:

```ts
export const sessionMetadataSchema = z.object({
  id: sessionIdSchema,
  title: z.string(),
  workingDirectory: z.string().optional(),
  updatedAt: z.number().optional(), // epoch ms; last-activity (snapshot mtime, may be fractional)
  isRunning: z.boolean().optional(), // in-memory turn/title-gen state; absent = idle (e.g. after restart)
  isWaitingForInput: z.boolean().optional(), // in-memory: blocked on a client tool call; absent = not waiting
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/api-schema test src/chat/schema.test.ts`
Expected: PASS (all `sessionMetadataSchema` tests, including the 3 new ones).

- [ ] **Step 5: Commit**

```bash
git add packages/api-schema/src/chat/schema.ts packages/api-schema/src/chat/schema.test.ts
git commit -m "feat(api-schema): add optional isWaitingForInput to session metadata"
```

---

### Task 4: `AgentStore.getWaitingIds()` + `CodingAgentStore` injection

Scan the in-memory cache for blocked agents (mirroring `getRunningIds`) and stamp `isWaitingForInput` onto each session in the coding list.

**Files:**

- Modify: `apps/backend/src/models/agent-store/agent-store.ts` (add accessor after `getRunningIds`, ~line 82)
- Modify: `apps/backend/src/models/agent-store/coding-agent-store.ts:96-106`
- Test: `apps/backend/src/models/agent-store/coding-agent-store.test.ts`

**Interfaces:**

- Consumes: `Agent.isWaitingForInput` (Task 2); `SessionMetadata.isWaitingForInput` (Task 3).
- Produces: `AgentStore.getWaitingIds(): Set<string>`; `listSessionMetadata` returns sessions carrying `isWaitingForInput: boolean`.

- [ ] **Step 1: Write the failing tests**

In `coding-agent-store.test.ts`, update the `createMockAgent` helper to carry the new flag:

```ts
function createMockAgent(
  id: string,
  isRunning: boolean,
  isWaitingForInput = false,
): Agent {
  const sseLog = new AgentSseLog();
  Object.defineProperty(sseLog, 'activeReaderCount', {get: () => 0});
  return {id, isRunning, isWaitingForInput, sseLog} as Agent;
}
```

Then add a new `describe` block at the end of the file:

```ts
describe('CodingAgentStore waiting status', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-wait-'));
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('getWaitingIds returns exactly the waiting agents', () => {
    const store = CodingAgentStore.create(sessionsDir);
    const waitingId = crypto.randomUUID();
    const runningId = crypto.randomUUID();
    const idleId = crypto.randomUUID();
    store.set(createMockAgent(waitingId, true, true));
    store.set(createMockAgent(runningId, true, false));
    store.set(createMockAgent(idleId, false, false));

    expect(store.getWaitingIds()).toEqual(new Set([waitingId]));
  });

  it('marks isWaitingForInput true only for cached waiting agents', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const waitingId = crypto.randomUUID();
    const runningId = crypto.randomUUID();
    await writeSnapshot(sessionsDir, waitingId, {id: waitingId, title: 'Wait'});
    await writeSnapshot(sessionsDir, runningId, {id: runningId, title: 'Run'});
    store.set(createMockAgent(waitingId, true, true));
    store.set(createMockAgent(runningId, true, false));

    const {sessions} = await store.listSessionMetadata(0, 100);
    const byId = new Map(sessions.map((s) => [s.id, s.isWaitingForInput]));
    expect(byId.get(waitingId)).toBe(true);
    expect(byId.get(runningId)).toBe(false);
  });

  it('marks isWaitingForInput false when the session has no cached agent', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Cold'});

    const {sessions} = await store.listSessionMetadata(0, 100);
    expect(sessions[0].isWaitingForInput).toBe(false);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/backend test src/models/agent-store/coding-agent-store.test.ts`
Expected: FAIL — `store.getWaitingIds` is not a function, and `s.isWaitingForInput` is `undefined` on the listed sessions.

- [ ] **Step 3: Add `getWaitingIds` to the base store**

In `agent-store.ts`, add immediately after the `getRunningIds()` method (after its closing brace, before the `abstract listSessionMetadata` declaration):

```ts
  /**
   * Ids of cached agents currently blocked awaiting a user response to a
   * client-side tool call. Mirrors {@link getRunningIds}: a blocked agent is
   * always running, so eviction never removes it and this in-memory scan is a
   * complete view. Cold cache after a restart ⇒ empty, which is correct.
   */
  getWaitingIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, entry] of this.cache) {
      if (entry.agent.isWaitingForInput) {
        ids.add(id);
      }
    }
    return ids;
  }
```

- [ ] **Step 4: Inject the flag in `listSessionMetadata`**

In `coding-agent-store.ts`, add the accessor read next to the existing `const running` (line 96):

```ts
const running = this.getRunningIds();
const waiting = this.getWaitingIds();
```

Then in the returned object inside the `page.map(...)` callback, add the field after `isRunning`:

```ts
return {
  ...sessionMetadataSchema.parse(json),
  updatedAt: mtime,
  isRunning: running.has(id),
  isWaitingForInput: waiting.has(id),
};
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test src/models/agent-store/coding-agent-store.test.ts`
Expected: PASS (existing `isRunning` tests + 3 new waiting tests).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/models/agent-store/agent-store.ts apps/backend/src/models/agent-store/coding-agent-store.ts apps/backend/src/models/agent-store/coding-agent-store.test.ts
git commit -m "feat(backend): stamp isWaitingForInput on coding session metadata"
```

---

### Task 5: `useTaskStatuses` — derive `waiting`

Add the `waiting` branch with precedence **`waiting` → `running` → `done` → `idle`**. `waiting` is not gated by selection (unlike `done`).

**Files:**

- Modify: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts`
- Test: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts`

**Interfaces:**

- Consumes: `SessionMetadata.isWaitingForInput` (Task 3); the existing `TaskStatus` union (`'idle' | 'running' | 'done' | 'waiting'`) from `@/components/TaskStatusIndicator/index.js`.
- Produces: `useTaskStatuses` now emits `'waiting'` for sessions with `isWaitingForInput === true`.

- [ ] **Step 1: Write the failing tests**

In `useTaskStatuses.test.ts`, update the `s` helper to accept the new flag:

```ts
function s(
  id: string,
  isRunning: boolean,
  isWaitingForInput = false,
): SessionMetadata {
  return {id, title: id, isRunning, isWaitingForInput};
}
```

Then add these tests inside the existing `describe('useTaskStatuses', ...)` block:

```ts
it('reports waiting when a session is blocked on input', () => {
  const {result} = renderHook(() =>
    useTaskStatuses([s('a', true, true)], null),
  );
  expect(result.current.get('a')).toBe('waiting');
});

it('prefers waiting over running when both flags are set', () => {
  const {result} = renderHook(() =>
    useTaskStatuses([s('a', true, true)], null),
  );
  expect(result.current.get('a')).toBe('waiting');
});

it('shows waiting even for the selected session', () => {
  const {result} = renderHook(() => useTaskStatuses([s('a', true, true)], 'a'));
  expect(result.current.get('a')).toBe('waiting');
});

it('reverts to running when it stops waiting but keeps running', () => {
  const {result, rerender} = renderHook(
    ({sessions}: {sessions: SessionMetadata[]}) =>
      useTaskStatuses(sessions, null),
    {initialProps: {sessions: [s('a', true, true)]}},
  );
  expect(result.current.get('a')).toBe('waiting');
  rerender({sessions: [s('a', true, false)]});
  expect(result.current.get('a')).toBe('running');
});

it('becomes done when a waiting session finishes (unselected)', () => {
  const {result, rerender} = renderHook(
    ({sessions}: {sessions: SessionMetadata[]}) =>
      useTaskStatuses(sessions, null),
    {initialProps: {sessions: [s('a', true, true)]}},
  );
  expect(result.current.get('a')).toBe('waiting');
  rerender({sessions: [s('a', false, false)]});
  expect(result.current.get('a')).toBe('done');
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/frontend test src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts`
Expected: FAIL — the hook returns `'running'` (not `'waiting'`) for blocked sessions, so the new assertions fail.

- [ ] **Step 3: Add `currentWaiting` and the `waiting` branch**

In `useTaskStatuses.ts`, add a `currentWaiting` memo next to `currentRunning`:

```ts
const currentWaiting = useMemo(
  () => new Set(sessions.filter((s) => s.isWaitingForInput).map((s) => s.id)),
  [sessions],
);
```

Then change the derivation `useMemo` to check `waiting` first and add `currentWaiting` to its dependency array:

```ts
return useMemo(() => {
  const map = new Map<string, TaskStatus>();
  for (const s of sessions) {
    const status: TaskStatus = currentWaiting.has(s.id)
      ? 'waiting'
      : currentRunning.has(s.id)
        ? 'running'
        : s.id !== selectedId && doneIds.has(s.id)
          ? 'done'
          : 'idle';
    map.set(s.id, status);
  }
  return map;
}, [sessions, currentWaiting, currentRunning, doneIds, selectedId]);
```

Also update the hook's doc comment: change the sentence about `waiting` not being produced yet to reflect that it now comes from the backend `isWaitingForInput` flag and takes precedence over `running`. Replace the final sentence of the JSDoc block with:

```ts
 * it is selected (acknowledged), runs again, or leaves the list. `waiting` comes
 * from the backend `isWaitingForInput` flag and takes precedence over `running`
 * (a blocked agent is also running); it is shown regardless of selection.
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/frontend test src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts`
Expected: PASS (existing tests + 5 new waiting tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts
git commit -m "feat(frontend): derive waiting task status from isWaitingForInput"
```

---

### Task 6: Full verification

Confirm the whole feature typechecks, lints, and the three touched suites are green together; then a best-effort live smoke check.

**Files:** none (verification only).

- [ ] **Step 1: Typecheck all touched packages**

Run:

```bash
pnpm --filter @omnicraft/api-schema run typecheck
pnpm --filter @omnicraft/backend run typecheck
pnpm --filter @omnicraft/frontend run typecheck
```

Expected: no errors.

- [ ] **Step 2: Run the three touched test suites in full**

Run:

```bash
pnpm --filter @omnicraft/api-schema test
pnpm --filter @omnicraft/backend test
pnpm --filter @omnicraft/frontend test
```

Expected: all pass.

- [ ] **Step 3: Live smoke check (best-effort)**

Start the dev server from the repo root (`pnpm dev`), open the coding page in a browser, and drive an agent turn that triggers `ask_user`. While the ask card is awaiting your answer, confirm the task-list row shows the `waiting` indicator (warning-colored dot with ripple), and that answering it clears the indicator on the next poll (~3s). Verify in both light and dark themes.

Note: the `waiting` _visual_ itself was already verified in #348; this step only confirms the new data wiring lights it up. If `ask_user` cannot be triggered on demand, the unit tests in Tasks 1–5 are the authoritative verification of the wiring.

- [ ] **Step 4: No commit needed** (verification only; any lint auto-fixes from the pre-commit hook were already committed with their task).

---

## Notes for the implementer

- **Why `waiting` before `running`:** a blocked agent has `isRunning === true` _and_ `isWaitingForInput === true` simultaneously (the `ask_user` `await` sits inside the agent loop, so the turn never settles while blocked). If `running` were checked first, `waiting` would never render. This reverses the tentative precedence in the older #348 spec.
- **Non-durable by design:** after a process restart the cache is cold, so `getWaitingIds()` is empty and every session reports `idle` — correct, since a blocked turn cannot survive a reload.
- **No UI changes:** `TaskStatusIndicator` already renders `waiting`; the `useAllCodingSessions` poll already applies whatever fields `SessionMetadata` carries, so no poll/threading changes are needed.
