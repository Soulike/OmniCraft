# Coding Task List: per-task status indicator — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a per-task status indicator (idle / running / done / waiting) in the coding "Tasks" sidebar, fed by a 3-second unconditional poll of `GET /coding/sessions` carrying a new backend `isRunning` flag.

**Architecture:** Backend surfaces the in-memory `Agent.isRunning` on each session-list item (no new persistence). The frontend polls the list every 3s via the existing background-reload path, derives a per-session `TaskStatus` (client-side `done` on running→idle transitions), and renders a standalone `TaskStatusIndicator` in the leading status slot reserved by PR #351. `waiting` is built visually but not wired (its data source is tracked in #354).

**Tech Stack:** TypeScript, Zod (v4), Node.js + Koa (backend), React 19 + Vite + CSS Modules + HeroUI tokens (frontend), Vitest + @testing-library/react.

## Global Constraints

- PNPM monorepo; run scripts per package, e.g. `pnpm --filter @omnicraft/api-schema test`, `pnpm --filter @omnicraft/backend test`, `pnpm --filter @omnicraft/frontend test`. Lint: `... lint`. Typecheck: `... typecheck`.
- Never use `any`; use `unknown` and narrow.
- Backend: no default exports; kebab-case filenames; relative imports use `.js`; no `console` (use `logger`); Conventional Commits.
- Frontend: CSS Modules only (no Tailwind in our components); consume HeroUI tokens (`var(--accent)`, `var(--success)`, …), no bespoke material (no gradients/blur); **motion is event-driven and must honor `prefers-reduced-motion`**; one React component per file; named exports only; import components via their folder `index.ts`; **a component must not set its own placement** (no `margin`/`flex`/`align-self` on the component root — the parent's slot controls layout); verify UI in a real browser in **both light and dark** themes.
- Feature is **coding-only**: `MainAgentStore` / chat `SessionItem` are untouched.
- Poll interval is **3000 ms**, unconditional (no visibility gating).
- `TaskStatus` is a frontend view type: `'idle' | 'running' | 'done' | 'waiting'`. It is NOT added to `@omnicraft/api-schema`.

---

## File Structure

**Backend**

- Modify `packages/api-schema/src/chat/schema.ts` — add `isRunning` to `sessionMetadataSchema`.
- Modify `packages/api-schema/src/chat/schema.test.ts` — cover the new field.
- Modify `apps/backend/src/models/agent-store/agent-store.ts` — add `getRunningIds()`.
- Modify `apps/backend/src/models/agent-store/main-agent-store.test.ts` — cover `getRunningIds()` (uses the existing base-class test harness).
- Modify `apps/backend/src/models/agent-store/coding-agent-store.ts` — inject `isRunning` in `listSessionMetadata`.
- Create `apps/backend/src/models/agent-store/coding-agent-store.test.ts` — cover the injection.

**Frontend**

- Create `apps/frontend/src/components/TaskStatusIndicator/{index.ts,TaskStatusIndicator.tsx,styles.module.css,TaskStatusIndicator.test.tsx}` — the presentational indicator + `TaskStatus` type.
- Create `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts` + `useTaskStatuses.test.ts` — status derivation (incl. client-side `done`).
- Modify `.../WorkspaceSessionList/hooks/useAllCodingSessions.ts` + its `.test.tsx` — add the 3s poll.
- Modify `.../WorkspaceSessionList/WorkspaceSessionList.tsx` (container) — derive statuses, pass down.
- Modify `.../WorkspaceSessionList/WorkspaceSessionListView.tsx` + `.test.tsx` — thread `statuses`.
- Modify `.../WorkspaceGroup/WorkspaceGroupView.tsx` + `.test.tsx` — thread `statuses`, pass `status` per row.
- Modify `.../TaskListItem/TaskListItem.tsx` — accept + forward `status`.
- Modify `.../TaskListItem/TaskListItemView.tsx` + `.test.tsx` — render `TaskStatusIndicator` in the slot.
- Modify `.../TaskListItem/styles.module.css` — remove `.dot`, add `.statusSlot`.

---

## Task 1: Add `isRunning` to `sessionMetadataSchema` (api-schema)

**Files:**

- Modify: `packages/api-schema/src/chat/schema.ts:52-57`
- Test: `packages/api-schema/src/chat/schema.test.ts`

**Interfaces:**

- Produces: `SessionMetadata` now has optional `isRunning?: boolean`. Consumed by Task 3 (backend injection) and Tasks 5/7 (frontend).

- [ ] **Step 1: Write the failing tests**

Add to the `describe('sessionMetadataSchema', …)` block in `packages/api-schema/src/chat/schema.test.ts`:

```ts
it('preserves isRunning when present', () => {
  const parsed = sessionMetadataSchema.parse({
    id: ID,
    title: 'T',
    isRunning: true,
  });
  expect(parsed.isRunning).toBe(true);
});

it('parses without isRunning (backward compatible)', () => {
  const parsed = sessionMetadataSchema.parse({id: ID, title: 'T'});
  expect(parsed.isRunning).toBeUndefined();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/api-schema test`
Expected: FAIL — `parsed.isRunning` is `undefined` (field stripped) so `toBe(true)` fails.

- [ ] **Step 3: Add the field**

In `packages/api-schema/src/chat/schema.ts`, update `sessionMetadataSchema`:

```ts
/** Schema for a single session entry in the list response. */
export const sessionMetadataSchema = z.object({
  id: sessionIdSchema,
  title: z.string(),
  workingDirectory: z.string().optional(),
  updatedAt: z.number().optional(), // epoch ms; last-activity (snapshot mtime, may be fractional)
  isRunning: z.boolean().optional(), // in-memory turn/title-gen state; absent = idle (e.g. after restart)
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/api-schema test`
Expected: PASS (all schema tests green).

- [ ] **Step 5: Commit**

```bash
git add packages/api-schema/src/chat/schema.ts packages/api-schema/src/chat/schema.test.ts
git commit -m "feat(api-schema): add optional isRunning to sessionMetadataSchema (#348)"
```

---

## Task 2: Add `getRunningIds()` to `AgentStore` (backend)

**Files:**

- Modify: `apps/backend/src/models/agent-store/agent-store.ts`
- Test: `apps/backend/src/models/agent-store/main-agent-store.test.ts`

**Interfaces:**

- Produces: `AgentStore.getRunningIds(): Set<string>` — ids of cached agents whose `isRunning` is true. Consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Add a new `describe` block to `apps/backend/src/models/agent-store/main-agent-store.test.ts` (the file already has `createMockAgent`):

```ts
describe('getRunningIds', () => {
  it('returns an empty set when nothing is running', () => {
    const store = MainAgentStore.create(sessionsDir);
    store.set(createMockAgent('idle-1'));
    expect(store.getRunningIds()).toEqual(new Set());
  });

  it('returns only the ids of running agents', () => {
    const store = MainAgentStore.create(sessionsDir);
    store.set(createMockAgent('idle-1'));
    store.set(createMockAgent('run-1', {isRunning: true}));
    store.set(createMockAgent('run-2', {isRunning: true}));
    expect(store.getRunningIds()).toEqual(new Set(['run-1', 'run-2']));
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/backend test -- main-agent-store`
Expected: FAIL — `store.getRunningIds is not a function`.

- [ ] **Step 3: Implement the accessor**

In `apps/backend/src/models/agent-store/agent-store.ts`, add this method to `AgentStore` (place it right after `delete(...)`, before the abstract `listSessionMetadata`):

```ts
  /**
   * Ids of currently-running agents resident in the cache. Running agents are
   * never evicted (see evictIfNeeded), so this in-memory scan (O(≤50), no disk)
   * is a complete view of what is running right now. After a process restart the
   * cache is cold, so this is empty — correct, since a turn cannot survive one.
   */
  getRunningIds(): Set<string> {
    const ids = new Set<string>();
    for (const [id, entry] of this.cache) {
      if (entry.agent.isRunning) {
        ids.add(id);
      }
    }
    return ids;
  }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/backend test -- main-agent-store`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/models/agent-store/agent-store.ts apps/backend/src/models/agent-store/main-agent-store.test.ts
git commit -m "feat(backend): add AgentStore.getRunningIds() (#348)"
```

---

## Task 3: Inject `isRunning` in `CodingAgentStore.listSessionMetadata`

**Files:**

- Modify: `apps/backend/src/models/agent-store/coding-agent-store.ts:96-107`
- Create: `apps/backend/src/models/agent-store/coding-agent-store.test.ts`

**Interfaces:**

- Consumes: `AgentStore.getRunningIds()` (Task 2), `SessionMetadata.isRunning` (Task 1).
- Produces: `GET /coding/sessions` items now carry `isRunning: boolean`.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/models/agent-store/coding-agent-store.test.ts`:

```ts
import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {AgentSseLog} from '@/agent-core/agent/events/agent-sse-log.js';
import type {Agent} from '@/agent-core/agent/index.js';

import {CodingAgentStore} from './coding-agent-store.js';

function createMockAgent(id: string, isRunning: boolean): Agent {
  const sseLog = new AgentSseLog();
  Object.defineProperty(sseLog, 'activeReaderCount', {get: () => 0});
  return {id, isRunning, sseLog} as Agent;
}

async function writeSnapshot(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(data));
}

describe('CodingAgentStore.listSessionMetadata isRunning', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-test-'));
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('marks isRunning true only for cached running agents', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const runningId = crypto.randomUUID();
    const idleId = crypto.randomUUID();
    await writeSnapshot(sessionsDir, runningId, {id: runningId, title: 'Run'});
    await writeSnapshot(sessionsDir, idleId, {id: idleId, title: 'Idle'});
    store.set(createMockAgent(runningId, true));
    store.set(createMockAgent(idleId, false));

    const {sessions} = await store.listSessionMetadata(0, 100);
    const byId = new Map(sessions.map((s) => [s.id, s.isRunning]));
    expect(byId.get(runningId)).toBe(true);
    expect(byId.get(idleId)).toBe(false);
  });

  it('marks isRunning false when the session has no cached agent', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Cold'});

    const {sessions} = await store.listSessionMetadata(0, 100);
    expect(sessions[0].isRunning).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test -- coding-agent-store`
Expected: FAIL — `isRunning` is `undefined`, so `toBe(true)` / `toBe(false)` fail.

- [ ] **Step 3: Inject the flag**

In `apps/backend/src/models/agent-store/coding-agent-store.ts`, update `listSessionMetadata` — read the running set once before the page map, and add `isRunning` to the returned object:

```ts
statResults.sort((a, b) => b.mtime - a.mtime);
const total = statResults.length;
const page = statResults.slice(offset, offset + limit);

const running = this.getRunningIds();
const results = await Promise.all(
  page.map(async ({id, mtime}): Promise<SessionMetadata | null> => {
    try {
      const content = await this.readSessionMetadataFile(id);
      const json: unknown = JSON.parse(content);
      return {
        ...sessionMetadataSchema.parse(json),
        updatedAt: mtime,
        isRunning: running.has(id),
      };
    } catch (e) {
      logger.warn({err: e, sessionId: id}, 'Skipping unreadable session');
      return null;
    }
  }),
);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test -- coding-agent-store`
Expected: PASS.

- [ ] **Step 5: Run the full backend suite (guard the main store's list tests)**

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS. `main-agent-store.test.ts` `listSessionMetadata` expectations use `toEqual` with objects that have no `isRunning` — they stay green because `MainAgentStore.listSessionMetadata` is unchanged (coding-only injection).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/models/agent-store/coding-agent-store.ts apps/backend/src/models/agent-store/coding-agent-store.test.ts
git commit -m "feat(backend): surface isRunning on coding session list (#348)"
```

---

## Task 4: `TaskStatusIndicator` component + `TaskStatus` type (frontend)

**Files:**

- Create: `apps/frontend/src/components/TaskStatusIndicator/TaskStatusIndicator.tsx`
- Create: `apps/frontend/src/components/TaskStatusIndicator/styles.module.css`
- Create: `apps/frontend/src/components/TaskStatusIndicator/index.ts`
- Test: `apps/frontend/src/components/TaskStatusIndicator/TaskStatusIndicator.test.tsx`

**Interfaces:**

- Produces: `TaskStatus = 'idle' | 'running' | 'done' | 'waiting'` and `TaskStatusIndicator({status: TaskStatus})`. Consumed by Tasks 5 and 7.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/components/TaskStatusIndicator/TaskStatusIndicator.test.tsx`:

```tsx
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it} from 'vitest';

import {TaskStatusIndicator} from './TaskStatusIndicator.js';

afterEach(cleanup);

describe('TaskStatusIndicator', () => {
  it('exposes the status via data-status', () => {
    render(<TaskStatusIndicator status='idle' />);
    expect(screen.getByTestId('task-status-indicator')).toHaveAttribute(
      'data-status',
      'idle',
    );
  });

  it('renders a spinner for running and no ripples', () => {
    const {container} = render(<TaskStatusIndicator status='running' />);
    expect(container.querySelector('[data-part="spinner"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-part="ripple"]')).toHaveLength(0);
  });

  it('renders two ripples for done and waiting', () => {
    const {container: done} = render(<TaskStatusIndicator status='done' />);
    expect(done.querySelectorAll('[data-part="ripple"]')).toHaveLength(2);
    cleanup();
    const {container: waiting} = render(
      <TaskStatusIndicator status='waiting' />,
    );
    expect(waiting.querySelectorAll('[data-part="ripple"]')).toHaveLength(2);
  });

  it('labels attention states for assistive tech', () => {
    render(<TaskStatusIndicator status='waiting' />);
    expect(screen.getByLabelText('Needs your input')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/frontend test -- TaskStatusIndicator`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the component**

Create `apps/frontend/src/components/TaskStatusIndicator/TaskStatusIndicator.tsx`:

```tsx
import styles from './styles.module.css';

export type TaskStatus = 'idle' | 'running' | 'done' | 'waiting';

/** Accessible labels for the states that need user attention. */
const STATUS_LABEL: Record<TaskStatus, string | undefined> = {
  idle: undefined,
  running: 'Running',
  done: 'Finished — review',
  waiting: 'Needs your input',
};

interface TaskStatusIndicatorProps {
  readonly status: TaskStatus;
}

export function TaskStatusIndicator({status}: TaskStatusIndicatorProps) {
  const label = STATUS_LABEL[status];
  return (
    <span
      data-testid='task-status-indicator'
      data-status={status}
      className={styles.indicator}
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {status === 'running' && (
        <span data-part='spinner' className={styles.spinner} />
      )}
      {(status === 'done' || status === 'waiting') && (
        <>
          <span data-part='ripple' className={styles.ripple} />
          <span
            data-part='ripple'
            className={`${styles.ripple} ${styles.rippleDelayed}`}
          />
        </>
      )}
    </span>
  );
}
```

Create `apps/frontend/src/components/TaskStatusIndicator/styles.module.css`:

```css
/*
 * Task status indicator. Consumes HeroUI tokens only. Motion appears only for
 * active/pending states (running spinner; done/waiting diffusion) — never at
 * rest (idle). prefers-reduced-motion drops all motion but keeps every state
 * distinguishable via color + a static halo.
 */
.indicator {
  position: relative;
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.indicator[data-status='idle'] {
  border: 1.5px solid var(--muted);
  background: transparent;
  opacity: 0.55;
}

.indicator[data-status='running'] {
  width: 12px;
  height: 12px;
}

.indicator[data-status='done'] {
  background: var(--success);
  color: var(--success);
}

.indicator[data-status='waiting'] {
  background: var(--warning);
  color: var(--warning);
}

.spinner {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  border: 2px solid var(--accent-soft);
  border-top-color: var(--accent);
  animation: task-status-spin 0.7s linear infinite;
}

.ripple {
  position: absolute;
  inset: 0;
  border-radius: 50%;
  background: currentColor;
  animation: task-status-ripple 1.7s ease-out infinite;
}

.rippleDelayed {
  animation-delay: 0.85s;
}

@keyframes task-status-spin {
  to {
    transform: rotate(360deg);
  }
}

@keyframes task-status-ripple {
  0% {
    transform: scale(1);
    opacity: 0.5;
  }
  80%,
  100% {
    transform: scale(3);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .spinner {
    animation: none;
  }
  .ripple {
    animation: none;
    opacity: 0;
  }
  .indicator[data-status='done'] {
    box-shadow: 0 0 0 3px var(--success-soft);
  }
  .indicator[data-status='waiting'] {
    box-shadow: 0 0 0 3px var(--warning-soft);
  }
}
```

Create `apps/frontend/src/components/TaskStatusIndicator/index.ts`:

```ts
export {TaskStatusIndicator} from './TaskStatusIndicator.js';
export type {TaskStatus} from './TaskStatusIndicator.js';
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/frontend test -- TaskStatusIndicator`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/components/TaskStatusIndicator/
git commit -m "feat(frontend): add TaskStatusIndicator component (#348)"
```

---

## Task 5: `useTaskStatuses` derivation hook (frontend)

**Files:**

- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts`
- Test: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts`

**Interfaces:**

- Consumes: `SessionMetadata` (with `isRunning`), `TaskStatus` from `@/components/TaskStatusIndicator/index.js`.
- Produces: `useTaskStatuses(sessions, selectedId): ReadonlyMap<string, TaskStatus>`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts`:

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import {renderHook} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {useTaskStatuses} from './useTaskStatuses.js';

function s(id: string, isRunning: boolean): SessionMetadata {
  return {id, title: id, isRunning};
}

describe('useTaskStatuses', () => {
  it('reports running for sessions with isRunning true', () => {
    const {result} = renderHook(() => useTaskStatuses([s('a', true)], null));
    expect(result.current.get('a')).toBe('running');
  });

  it('reports done when a non-selected session stops running', () => {
    const {result, rerender} = renderHook(
      ({sessions}: {sessions: SessionMetadata[]}) =>
        useTaskStatuses(sessions, null),
      {initialProps: {sessions: [s('a', true)]}},
    );
    expect(result.current.get('a')).toBe('running');
    rerender({sessions: [s('a', false)]});
    expect(result.current.get('a')).toBe('done');
  });

  it('never reports done for the selected session', () => {
    const {result, rerender} = renderHook(
      ({sessions, selected}: {sessions: SessionMetadata[]; selected: string}) =>
        useTaskStatuses(sessions, selected),
      {initialProps: {sessions: [s('a', true)], selected: 'a'}},
    );
    rerender({sessions: [s('a', false)], selected: 'a'});
    expect(result.current.get('a')).toBe('idle');
  });

  it('clears done when the session is selected', () => {
    const {result, rerender} = renderHook(
      ({
        sessions,
        selected,
      }: {
        sessions: SessionMetadata[];
        selected: string | null;
      }) => useTaskStatuses(sessions, selected),
      {
        initialProps: {
          sessions: [s('a', true)],
          selected: null as string | null,
        },
      },
    );
    rerender({sessions: [s('a', false)], selected: null});
    expect(result.current.get('a')).toBe('done');
    rerender({sessions: [s('a', false)], selected: 'a'});
    expect(result.current.get('a')).toBe('idle');
  });

  it('clears done when the session starts running again', () => {
    const {result, rerender} = renderHook(
      ({sessions}: {sessions: SessionMetadata[]}) =>
        useTaskStatuses(sessions, null),
      {initialProps: {sessions: [s('a', true)]}},
    );
    rerender({sessions: [s('a', false)]});
    expect(result.current.get('a')).toBe('done');
    rerender({sessions: [s('a', true)]});
    expect(result.current.get('a')).toBe('running');
  });

  it('drops sessions that leave the list', () => {
    const {result, rerender} = renderHook(
      ({sessions}: {sessions: SessionMetadata[]}) =>
        useTaskStatuses(sessions, null),
      {initialProps: {sessions: [s('a', true), s('b', false)]}},
    );
    rerender({sessions: [s('b', false)]});
    expect(result.current.has('a')).toBe(false);
    expect(result.current.get('b')).toBe('idle');
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/frontend test -- useTaskStatuses`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the hook**

Create `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts`:

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import {useEffect, useMemo, useRef, useState} from 'react';

import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>): boolean {
  if (a.size !== b.size) return false;
  for (const id of a) {
    if (!b.has(id)) return false;
  }
  return true;
}

/**
 * Derives a per-session TaskStatus from the polled session list. `running` and
 * `idle` come straight from the backend `isRunning` flag; `done` is client-only,
 * raised when a non-selected session transitions running → idle and cleared when
 * it is selected (acknowledged), runs again, or leaves the list. `waiting` is not
 * produced yet — its data source is tracked in #354; once available it slots
 * ahead of `done`.
 */
export function useTaskStatuses(
  sessions: readonly SessionMetadata[],
  selectedId: string | null,
): ReadonlyMap<string, TaskStatus> {
  const currentRunning = useMemo(
    () => new Set(sessions.filter((s) => s.isRunning).map((s) => s.id)),
    [sessions],
  );
  const presentIds = useMemo(
    () => new Set(sessions.map((s) => s.id)),
    [sessions],
  );

  const prevRunningRef = useRef<ReadonlySet<string>>(new Set());
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());

  useEffect(() => {
    const prevRunning = prevRunningRef.current;
    setDoneIds((prevDone) => {
      const next = new Set(prevDone);
      for (const id of prevRunning) {
        if (
          !currentRunning.has(id) &&
          presentIds.has(id) &&
          id !== selectedId
        ) {
          next.add(id);
        }
      }
      for (const id of [...next]) {
        if (
          currentRunning.has(id) ||
          id === selectedId ||
          !presentIds.has(id)
        ) {
          next.delete(id);
        }
      }
      return sameSet(next, prevDone) ? prevDone : next;
    });
    prevRunningRef.current = currentRunning;
  }, [currentRunning, presentIds, selectedId]);

  return useMemo(() => {
    const map = new Map<string, TaskStatus>();
    for (const s of sessions) {
      const status: TaskStatus = currentRunning.has(s.id)
        ? 'running'
        : doneIds.has(s.id)
          ? 'done'
          : 'idle';
      map.set(s.id, status);
    }
    return map;
  }, [sessions, currentRunning, doneIds]);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @omnicraft/frontend test -- useTaskStatuses`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useTaskStatuses.test.ts
git commit -m "feat(frontend): derive per-task status incl. client-side done (#348)"
```

---

## Task 6: Add the 3s poll to `useAllCodingSessions`

**Files:**

- Modify: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.ts`
- Test: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.test.tsx`

**Interfaces:**

- No signature change. Adds a background poll that calls the existing `reload(true)` every 3000 ms while mounted.

- [ ] **Step 1: Write the failing test**

Add to `useAllCodingSessions.test.tsx` (the `wrapper` + `listSessions` mock already exist):

```ts
it('polls in the background every 3 seconds', async () => {
  vi.useFakeTimers();
  try {
    listSessions.mockResolvedValue({sessions: [], total: 0});
    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});

    // Flush the mount load.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });
    expect(result.current.isLoading).toBe(false);
    const afterMount = listSessions.mock.calls.length;

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(listSessions.mock.calls.length).toBe(afterMount + 1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(3000);
    });
    expect(listSessions.mock.calls.length).toBe(afterMount + 2);

    // Background poll must not flip the loading spinner.
    expect(result.current.isLoading).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/frontend test -- useAllCodingSessions`
Expected: FAIL — call count stays at `afterMount` (no polling yet).

- [ ] **Step 3: Add the interval effect**

In `useAllCodingSessions.ts`, add the interval constant next to `FETCH_ALL_LIMIT`:

```ts
/** Unconditional background poll cadence for running/idle + recency freshness. */
const POLL_INTERVAL_MS = 3000;
```

Then add this effect immediately after the existing event-bus subscription `useEffect` (the one wiring `session-created` / `session-title`):

```ts
useEffect(() => {
  const id = setInterval(() => {
    void reload(true);
  }, POLL_INTERVAL_MS);
  return () => {
    clearInterval(id);
  };
}, [reload]);
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/frontend test -- useAllCodingSessions`
Expected: PASS (all tests in the file green — the new poll test plus the four existing ones).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.test.tsx
git commit -m "feat(frontend): poll coding sessions every 3s (#348)"
```

---

## Task 7: Render the indicator in the task row

Wires the derived status through the view tree and swaps the static `.dot` for `TaskStatusIndicator`. This is one reviewable unit: prop threading + render swap + the tests that break from the new required props, ending with browser validation.

**Files:**

- Modify: `.../WorkspaceSessionList/WorkspaceSessionList.tsx`
- Modify: `.../WorkspaceSessionList/WorkspaceSessionListView.tsx` + `.test.tsx`
- Modify: `.../WorkspaceGroup/WorkspaceGroupView.tsx` + `.test.tsx`
- Modify: `.../TaskListItem/TaskListItem.tsx`
- Modify: `.../TaskListItem/TaskListItemView.tsx` + `.test.tsx`
- Modify: `.../TaskListItem/styles.module.css`

**Interfaces:**

- Consumes: `useTaskStatuses` (Task 5), `TaskStatusIndicator` + `TaskStatus` (Task 4).
- New props (all `readonly`): `WorkspaceSessionListView` and `WorkspaceGroupView` gain `statuses: ReadonlyMap<string, TaskStatus>`; `TaskListItem` and `TaskListItemView` gain `status: TaskStatus`.

- [ ] **Step 1: Update the failing tests first**

`TaskListItemView.test.tsx` — add `status` to `baseProps`, plus a state assertion. Update the import and `baseProps`, and add a test:

```tsx
import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';
// ...
const baseProps = {
  title: 'Fix the thing',
  timeLabel: '2h ago' as string | null,
  status: 'idle' as TaskStatus,
  isSelected: false,
  isDeleteOpen: false,
  onDeleteOpenChange: () => undefined,
  onConfirmDelete: () => undefined,
  isDeleting: false,
};

it('renders the status indicator', () => {
  render(<TaskListItemView {...baseProps} status='running' />);
  expect(screen.getByTestId('task-status-indicator')).toHaveAttribute(
    'data-status',
    'running',
  );
});
```

`WorkspaceGroupView.test.tsx` — add `statuses={new Map()}` to both `<WorkspaceGroupView …/>` renders (it is a new required prop).

`WorkspaceSessionListView.test.tsx` — add `statuses: new Map()` to the shared `baseProps` object.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/frontend test -- WorkspaceSessionList`
Expected: FAIL — TypeScript/prop errors and the new `TaskListItemView` assertion fail (indicator not rendered yet).

- [ ] **Step 3: Thread `status` into `TaskListItem` / `TaskListItemView` and render the indicator**

`TaskListItem.tsx` — add `status` to props and forward it:

```tsx
import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';

import {formatRelativeTime} from '@/helpers/format-relative-time.js';

import {useTaskDeletion} from './hooks/useTaskDeletion.js';
import {TaskListItemView} from './TaskListItemView.js';

interface TaskListItemProps {
  title: string;
  updatedAt?: number;
  status: TaskStatus;
  isSelected: boolean;
  now: number;
  onDelete: () => Promise<void>;
}

export function TaskListItem({
  title,
  updatedAt,
  status,
  isSelected,
  now,
  onDelete,
}: TaskListItemProps) {
  const {isDeleteOpen, isDeleting, onDeleteOpenChange, onConfirmDelete} =
    useTaskDeletion(onDelete);
  const timeLabel =
    updatedAt === undefined ? null : formatRelativeTime(updatedAt, now);

  return (
    <TaskListItemView
      title={title}
      timeLabel={timeLabel}
      status={status}
      isSelected={isSelected}
      isDeleteOpen={isDeleteOpen}
      onDeleteOpenChange={onDeleteOpenChange}
      onConfirmDelete={onConfirmDelete}
      isDeleting={isDeleting}
    />
  );
}
```

`TaskListItemView.tsx` — import the component + type, add `status` to props, replace the `.dot` span with a layout slot wrapping the indicator:

```tsx
import {Button, Popover} from '@heroui/react';
import {Trash2} from 'lucide-react';

import {
  TaskStatusIndicator,
  type TaskStatus,
} from '@/components/TaskStatusIndicator/index.js';

import styles from './styles.module.css';

interface TaskListItemViewProps {
  title: string;
  timeLabel: string | null;
  status: TaskStatus;
  isSelected: boolean;
  isDeleteOpen: boolean;
  onDeleteOpenChange: (open: boolean) => void;
  onConfirmDelete: () => void;
  isDeleting: boolean;
}

export function TaskListItemView({
  title,
  timeLabel,
  status,
  isSelected,
  isDeleteOpen,
  onDeleteOpenChange,
  onConfirmDelete,
  isDeleting,
}: TaskListItemViewProps) {
  return (
    <div
      className={styles.item}
      data-selected={isSelected ? 'true' : undefined}
    >
      <span className={styles.statusSlot}>
        <TaskStatusIndicator status={status} />
      </span>
      <div className={styles.content}>
        <span className={styles.title} title={title}>
          {title}
        </span>
        {timeLabel !== null && <span className={styles.meta}>{timeLabel}</span>}
      </div>
      <div className={styles.actions}>
        <Popover isOpen={isDeleteOpen} onOpenChange={onDeleteOpenChange}>
          <Popover.Trigger>
            <Button
              isIconOnly
              size='sm'
              variant='ghost'
              aria-label='Delete task'
            >
              <Trash2 size={14} />
            </Button>
          </Popover.Trigger>
          <Popover.Content placement='right'>
            <Popover.Dialog>
              <Popover.Heading>Delete task?</Popover.Heading>
              <p className={styles.popoverBody}>This cannot be undone.</p>
              <div className={styles.popoverActions}>
                <Button
                  size='sm'
                  variant='ghost'
                  onPress={() => {
                    onDeleteOpenChange(false);
                  }}
                >
                  Cancel
                </Button>
                <Button
                  size='sm'
                  variant='danger'
                  isDisabled={isDeleting}
                  onPress={onConfirmDelete}
                >
                  Delete
                </Button>
              </div>
            </Popover.Dialog>
          </Popover.Content>
        </Popover>
      </div>
    </div>
  );
}
```

`TaskListItem/styles.module.css` — remove the `.dot` rule (lines defining `.dot`) and add the placement slot (the alignment that used to live on `.dot` now lives on the parent slot):

```css
/* Leading status column. Fixed box so the row layout is stable across states
   (the running spinner is larger than the idle/done/waiting dots). */
.statusSlot {
  flex-shrink: 0;
  width: 12px;
  height: 12px;
  margin-top: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
}
```

- [ ] **Step 4: Thread `statuses` through the group + list views**

`WorkspaceGroupView.tsx` — import `TaskStatus`, add `statuses` to props, pass `status` per row:

```tsx
import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';
```

Add to `WorkspaceGroupViewProps`:

```tsx
  readonly statuses: ReadonlyMap<string, TaskStatus>;
```

Destructure `statuses` in the function signature, and update the `TaskListItem` render inside the `ListBox`:

```tsx
<TaskListItem
  title={session.title}
  updatedAt={session.updatedAt}
  status={statuses.get(session.id) ?? 'idle'}
  isSelected={isSelected}
  now={now}
  onDelete={async () => onDeleteSession(session.id)}
/>
```

`WorkspaceSessionListView.tsx` — import `TaskStatus`, add `statuses` to props, forward to each group:

```tsx
import type {TaskStatus} from '@/components/TaskStatusIndicator/index.js';
```

Add to `WorkspaceSessionListViewProps`:

```tsx
  readonly statuses: ReadonlyMap<string, TaskStatus>;
```

Destructure `statuses` in the signature and pass it to `WorkspaceGroupView`:

```tsx
<WorkspaceGroupView
  key={key}
  workspace={group.workspace}
  sessions={group.sessions}
  statuses={statuses}
  isExpanded={expanded.has(key)}
  onExpandedChange={(isExpanded) => {
    onToggle(key, isExpanded);
  }}
  currentSessionId={currentSessionId}
  now={now}
  onSelectSession={onSelectSession}
  onDeleteSession={onDeleteSession}
  onNewSession={group.workspace ? onNewSession : undefined}
/>
```

- [ ] **Step 5: Derive and pass `statuses` from the container**

`WorkspaceSessionList.tsx` — import the hook and derive statuses from the flat session list + selected id, then pass to the view. Add the import:

```tsx
import {useTaskStatuses} from './hooks/useTaskStatuses.js';
```

After the existing `useAllCodingSessions()` / `useSessionId()` calls (both `sessions` and `sessionId` are already in scope), add:

```tsx
const statuses = useTaskStatuses(sessions, sessionId);
```

Then add `statuses={statuses}` to the `<WorkspaceSessionListView … />` element in the container's returned JSX.

- [ ] **Step 6: Run the frontend suite + typecheck + lint**

Run: `pnpm --filter @omnicraft/frontend test`
Expected: PASS (all suites).
Run: `pnpm --filter @omnicraft/frontend typecheck`
Expected: no errors.
Run: `pnpm --filter @omnicraft/frontend lint`
Expected: no errors.

- [ ] **Step 7: Browser validation (both themes)**

Start the dev server from the repo root (`pnpm dev`) and open the coding page.

- Confirm idle rows show a hollow ring; a session with a turn in flight shows the accent spinner; when it finishes (and is not the open one) it shows a green diffusing dot; selecting it returns it to idle.
- Toggle light/dark and confirm contrast and alignment in both.
- Confirm the spinner/diffusion sizes align with the title baseline (tune `.statusSlot` `margin-top` / `width` if needed).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/ apps/frontend/src/components/TaskStatusIndicator/
git commit -m "feat(frontend): render per-task status indicator in the task list (#348)"
```

---

## Self-Review

- **Spec coverage:** `isRunning` schema field → Task 1. `getRunningIds()` → Task 2. `listSessionMetadata` injection (coding-only) → Task 3. `TaskStatusIndicator` + `TaskStatus` union + visual/animation + `prefers-reduced-motion` + a11y → Task 4. Client-side `done` derivation + acknowledge/clear rules + selected-session exclusion → Task 5. 3s unconditional poll via background reload → Task 6. Render in reserved slot + thread through views + remove old `.dot` + both-theme browser check → Task 7. `waiting` designed but unwired (component includes it; derivation never emits it) → Tasks 4/5, tracked in #354. Chat surface + `MainAgentStore` untouched → respected throughout.
- **Placeholder scan:** none — every code and test step contains full content.
- **Type consistency:** `TaskStatus` defined in Task 4, imported unchanged in Tasks 5 and 7. `getRunningIds(): Set<string>` (Task 2) matches `this.getRunningIds()` + `running.has(id)` (Task 3). `statuses: ReadonlyMap<string, TaskStatus>` and `status: TaskStatus` prop names are consistent across `WorkspaceSessionListView`, `WorkspaceGroupView`, `TaskListItem`, `TaskListItemView`. `useTaskStatuses(sessions, selectedId)` signature matches its call in Task 7 (`useTaskStatuses(sessions, sessionId)`).
