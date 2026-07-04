# Coding Workspace Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Coding page's flat session sidebar with a per-workspace grouped sidebar, where new sessions are started from a `+` on a workspace group (opening a modal).

**Architecture:** Coding's session list endpoint drops pagination and returns all sessions; the frontend loads them all and buckets them by `workingDirectory` under the configured workspaces (plus an "Ungrouped" group for orphans). A new `WorkspaceSessionList` (Coding-only) renders one collapsible HeroUI `Disclosure` per workspace. A `+` on each group opens a `NewSessionModal` that creates a session in that workspace. Workspace settings move under a new "Coding" settings group. Chat is untouched.

**Tech Stack:** Bun (package manager + runtime), TypeScript, React 19 + Vite + React Router, Vitest, HeroUI `@heroui/react` v3, Zod, Koa (backend), Node APIs.

## Global Constraints

- **Package manager is Bun.** Each package's `test` script is `vitest run`. Run one package's tests (optionally narrowed to a file) with `bun run --filter <pkg> test [fileNamePattern]` — e.g. `bun run --filter @omnicraft/frontend test useWorkspaceGroups.test.ts`. Run the whole repo's tests with `bun run --filter '*' --if-present test`. **Never** use `bun test` (Bun's runner gives false failures). Lint/type across the repo: `bun run lint:all`, `bun run typecheck:all`. Package names: `@omnicraft/api-schema`, `@omnicraft/backend`, `@omnicraft/frontend`.
- **Code uses Node APIs only** (`node:fs/promises`, `node:path`); never Bun-specific APIs.
- **No `any`** — use `unknown` and narrow with type guards/assertions.
- **Frontend MVVM:** one React component per file; `Component.tsx` (container, no state) + `ComponentView.tsx` (stateless) + `hooks/` (view models) + `helpers/` (non-hook helpers) + `styles.module.css` + `index.ts`. CSS Modules only — **no Tailwind utility classes** in our components. Use HeroUI components + theme tokens (`var(--accent)`, `var(--muted)`, `var(--border)`, etc.).
- **No default exports.** Imports within a component use relative paths; across modules use the `@/` alias; all import specifiers end in `.js`.
- **Early-return style** for conditionals.
- **File naming:** components UpperCamelCase, hooks `useX.ts` camelCase, everything else dash-case.
- **UI copy is English.** The orphan group label is exactly **`Ungrouped`**.
- **Backend layering:** Dispatcher → Service → Model (never reverse). No `console` — use `ctx.log` in requests or `logger` from `@/logger.js`. No non-null `!` — use `assert`.
- **Scope is Coding only.** The Chat session list, its endpoint, and its paginated schema are unchanged.
- **Motion is event-driven only** (Aurora Glass design language); no ambient/looping animation; honor `prefers-reduced-motion`.
- **Commit trailer:** end each commit message with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

Spec: `docs/superpowers/specs/2026-06-28-coding-workspace-sidebar-design.md`.

---

## Phase 1 — De-paginate the coding session list (backend + schema + frontend API)

> **Ordering note:** Once Task 3 lands, the backend stops returning `total`, so the Coding page's _old_ flat session list (still mounted until Task 13) errors at runtime. This is expected and temporary — the Coding sidebar is fully functional again after Task 13. Unit tests pass at every task; the end-to-end browser check is the final step.

### Task 1: Add `listCodingSessionsResponseSchema` to api-schema

**Files:**

- Modify: `packages/api-schema/src/chat/schema.ts` (add after `listSessionsResponseSchema`, ~line 74)
- Modify: `packages/api-schema/src/index.ts` (export the new schema + type — only if the index lists exports explicitly)
- Test: `packages/api-schema/src/chat/schema.test.ts` (create if absent, else append)

**Interfaces:**

- Produces: `listCodingSessionsResponseSchema` (Zod), `ListCodingSessionsResponse = { sessions: SessionMetadata[] }`

- [ ] **Step 1: Write the failing test**

Create/append `packages/api-schema/src/chat/schema.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {listCodingSessionsResponseSchema} from './schema.js';

describe('listCodingSessionsResponseSchema', () => {
  it('accepts a sessions array with no total field', () => {
    const parsed = listCodingSessionsResponseSchema.parse({
      sessions: [
        {
          id: '123e4567-e89b-12d3-a456-426614174000',
          title: 'Task',
          workingDirectory: '/tmp/ws',
        },
      ],
    });
    expect(parsed.sessions).toHaveLength(1);
  });

  it('rejects a payload missing the sessions field', () => {
    expect(() => listCodingSessionsResponseSchema.parse({})).toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/api-schema test schema.test.ts`
Expected: FAIL — `listCodingSessionsResponseSchema` is not exported.

- [ ] **Step 3: Add the schema**

In `packages/api-schema/src/chat/schema.ts`, after the `listSessionsResponseSchema` block:

```ts
/** Schema for the GET /coding/sessions response body (no pagination). */
export const listCodingSessionsResponseSchema = z.object({
  sessions: z.array(sessionMetadataSchema),
});

export type ListCodingSessionsResponse = z.infer<
  typeof listCodingSessionsResponseSchema
>;
```

- [ ] **Step 4: Ensure it is exported from the package entry**

Run: `grep -n "listSessionsResponseSchema\|export \*" packages/api-schema/src/index.ts`

- If the index uses `export * from './chat/schema.js';`, no change is needed.
- Otherwise, add `listCodingSessionsResponseSchema` and `ListCodingSessionsResponse` to the same export statement that lists `listSessionsResponseSchema`.

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter @omnicraft/api-schema test schema.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add packages/api-schema/src/chat/schema.ts packages/api-schema/src/chat/schema.test.ts packages/api-schema/src/index.ts
git commit -m "feat(api-schema): add non-paginated coding sessions list response schema

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 2: `CodingAgentStore.listAllSessionMetadata()`

**Files:**

- Modify: `apps/backend/src/models/agent-store/coding-agent-store.ts`
- Test: `apps/backend/src/models/agent-store/coding-agent-store.test.ts` (create)

**Interfaces:**

- Produces: `CodingAgentStore.listAllSessionMetadata(): Promise<SessionMetadata[]>` — every persisted coding session's metadata, sorted by snapshot mtime descending.

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/models/agent-store/coding-agent-store.test.ts` (fixtures mirror `main-agent-store.test.ts`):

```ts
import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, utimes, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CodingAgentStore} from './coding-agent-store.js';

async function writeSnapshot(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'snapshot.json'), JSON.stringify(data));
}

async function writeMetadata(
  sessionsDir: string,
  id: string,
  data: Record<string, unknown>,
): Promise<void> {
  const dir = path.join(sessionsDir, id);
  await mkdir(dir, {recursive: true});
  await writeFile(path.join(dir, 'metadata.json'), JSON.stringify(data));
}

describe('CodingAgentStore.listAllSessionMetadata', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-store-test-'));
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('returns an empty array when the directory is empty', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    expect(await store.listAllSessionMetadata()).toEqual([]);
  });

  it('returns every session (no pagination) sorted by mtime desc', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const olderId = crypto.randomUUID();
    const newerId = crypto.randomUUID();
    await writeSnapshot(sessionsDir, olderId, {id: olderId, title: 'Older'});
    await writeSnapshot(sessionsDir, newerId, {id: newerId, title: 'Newer'});
    const past = new Date(Date.now() - 60_000);
    const now = new Date();
    await utimes(path.join(sessionsDir, olderId, 'snapshot.json'), past, past);
    await utimes(path.join(sessionsDir, newerId, 'snapshot.json'), now, now);

    expect(await store.listAllSessionMetadata()).toEqual([
      {id: newerId, title: 'Newer'},
      {id: olderId, title: 'Older'},
    ]);
  });

  it('includes workingDirectory from metadata.json', async () => {
    const store = CodingAgentStore.create(sessionsDir);
    const id = crypto.randomUUID();
    await writeSnapshot(sessionsDir, id, {id, title: 'Snapshot'});
    await writeMetadata(sessionsDir, id, {
      id,
      title: 'Meta',
      workingDirectory: '/tmp/ws',
    });

    expect(await store.listAllSessionMetadata()).toEqual([
      {id, title: 'Meta', workingDirectory: '/tmp/ws'},
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/backend test coding-agent-store.test.ts`
Expected: FAIL — `listAllSessionMetadata` is not a function.

- [ ] **Step 3: Implement by extracting a shared sorted-read helper**

In `apps/backend/src/models/agent-store/coding-agent-store.ts`, replace the existing `listSessionMetadata` method with the following three members (the paginated method stays to satisfy the abstract base; it now delegates to the shared helper):

```ts
  async listAllSessionMetadata(): Promise<SessionMetadata[]> {
    return this.readAllSessionsSorted();
  }

  async listSessionMetadata(
    offset: number,
    limit: number,
  ): Promise<{sessions: SessionMetadata[]; total: number}> {
    const all = await this.readAllSessionsSorted();
    return {sessions: all.slice(offset, offset + limit), total: all.length};
  }

  /** Reads every session's metadata, newest snapshot first. */
  private async readAllSessionsSorted(): Promise<SessionMetadata[]> {
    let entries: string[];
    try {
      entries = await readdir(this.sessionsDir);
    } catch {
      return [];
    }

    const statResults: {id: string; mtime: number}[] = [];
    await Promise.all(
      entries.map(async (entry) => {
        try {
          const fileStat = await stat(
            agentPersistence.snapshotPath(this.sessionsDir, entry),
          );
          statResults.push({id: entry, mtime: fileStat.mtimeMs});
        } catch (e) {
          logger.warn(
            {err: e, sessionId: entry},
            'Failed to stat session snapshot',
          );
        }
      }),
    );

    statResults.sort((a, b) => b.mtime - a.mtime);

    const results = await Promise.all(
      statResults.map(async ({id}): Promise<SessionMetadata | null> => {
        try {
          const content = await this.readSessionMetadataFile(id);
          const json: unknown = JSON.parse(content);
          return sessionMetadataSchema.parse(json);
        } catch (e) {
          logger.warn({err: e, sessionId: id}, 'Skipping unreadable session');
          return null;
        }
      }),
    );

    return results.filter((r): r is SessionMetadata => r !== null);
  }
```

(The `readdir`, `stat`, `agentPersistence`, `logger`, and `sessionMetadataSchema` imports already exist in this file.)

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @omnicraft/backend test coding-agent-store.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/models/agent-store/coding-agent-store.ts apps/backend/src/models/agent-store/coding-agent-store.test.ts
git commit -m "feat(backend): add CodingAgentStore.listAllSessionMetadata

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 3: De-paginate the coding service + route

**Files:**

- Modify: `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts:93-99` (`listSessions`)
- Modify: `apps/backend/src/dispatcher/coding-agent-session/router.ts:30-50` (`GET /coding/sessions`)
- Test: `apps/backend/src/services/coding-agent-session/coding-agent-session-service.test.ts` (create)

**Interfaces:**

- Consumes: `CodingAgentStore.listAllSessionMetadata()` (Task 2)
- Produces: `codingAgentSessionService.listSessions(): Promise<{sessions: SessionMetadata[]}>` (no args, no `total`)

- [ ] **Step 1: Write the failing test**

Create `apps/backend/src/services/coding-agent-session/coding-agent-session-service.test.ts`:

```ts
import crypto from 'node:crypto';
import {mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {afterEach, beforeEach, describe, expect, it} from 'vitest';

import {CodingAgentStore} from '@/models/agent-store/index.js';

import {codingAgentSessionService} from './coding-agent-session-service.js';

describe('codingAgentSessionService.listSessions', () => {
  let sessionsDir: string;

  beforeEach(async () => {
    CodingAgentStore.resetInstance();
    sessionsDir = await mkdtemp(path.join(os.tmpdir(), 'coding-svc-test-'));
    CodingAgentStore.create(sessionsDir);
  });

  afterEach(async () => {
    CodingAgentStore.resetInstance();
    await rm(sessionsDir, {recursive: true, force: true});
  });

  it('returns all sessions and no total field', async () => {
    const id = crypto.randomUUID();
    const dir = path.join(sessionsDir, id);
    await mkdir(dir, {recursive: true});
    await writeFile(
      path.join(dir, 'snapshot.json'),
      JSON.stringify({id, title: 'Task'}),
    );

    const result = await codingAgentSessionService.listSessions();

    expect(result).toEqual({sessions: [{id, title: 'Task'}]});
    expect(result).not.toHaveProperty('total');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/backend test coding-agent-session-service.test.ts`
Expected: FAIL — `listSessions` still requires `offset`/`limit` and returns `total`.

- [ ] **Step 3: Update the service**

In `coding-agent-session-service.ts`, replace the `listSessions` method:

```ts
  /** Lists all persisted sessions (no pagination). */
  async listSessions(): Promise<{sessions: SessionMetadata[]}> {
    const sessions = await CodingAgentStore.getInstance().listAllSessionMetadata();
    return {sessions};
  },
```

- [ ] **Step 4: Update the route**

In `apps/backend/src/dispatcher/coding-agent-session/router.ts`, replace the `GET SESSIONS` handler and drop the now-unused `listSessionsQuerySchema` import:

```ts
/** GET /coding/sessions — lists all persisted sessions (no pagination). */
router.get(SESSIONS, async (ctx) => {
  ctx.response.status = StatusCodes.OK;
  ctx.response.body = await codingAgentSessionService.listSessions();
});
```

Remove `listSessionsQuerySchema` from the `@omnicraft/api-schema` import at the top of the file (the chat router still imports it — leave that one alone).

- [ ] **Step 5: Run test + typecheck**

Run: `bun run --filter @omnicraft/backend test coding-agent-session-service.test.ts`
Expected: PASS
Run: `bun run typecheck:all`
Expected: no errors (confirms the dropped import has no other use in this file).

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts apps/backend/src/services/coding-agent-session/coding-agent-session-service.test.ts apps/backend/src/dispatcher/coding-agent-session/router.ts
git commit -m "feat(backend): return all coding sessions without pagination

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 4: Frontend coding API `listAllSessions` + optional context `listSessions`

**Files:**

- Modify: `apps/frontend/src/api/coding/coding.ts:130-150` (replace `listSessions` with `listAllSessions`)
- Modify: `apps/frontend/src/api/coding/index.ts` (export `listAllSessions`, drop `listSessions`)
- Modify: `apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts:29-32` (make `listSessions` optional)
- Modify: `apps/frontend/src/modules/chat-session/components/SessionList/hooks/useSessionList.ts:38-41` (guard optional `listSessions`)
- Test: `apps/frontend/src/api/coding/coding.test.ts` (add `listAllSessions` cases)

**Interfaces:**

- Consumes: `listCodingSessionsResponseSchema` (Task 1)
- Produces: `listAllSessions(): Promise<ListCodingSessionsResponse>` from `@/api/coding`. `ChatSessionApi.listSessions?` is now optional.

- [ ] **Step 1: Write the failing test**

Append to `apps/frontend/src/api/coding/coding.test.ts`:

```ts
import {listAllSessions} from './coding.js';

describe('listAllSessions', () => {
  it('GETs /api/coding/sessions and returns the parsed sessions', async () => {
    const id = '123e4567-e89b-12d3-a456-426614174000';
    const fetchMock = vi.fn(() =>
      Promise.resolve(
        createMockResponse(
          JSON.stringify({
            sessions: [{id, title: 'Task', workingDirectory: '/ws'}],
          }),
          {status: 200, headers: {'Content-Type': 'application/json'}},
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await listAllSessions();

    expect(fetchMock).toHaveBeenCalledWith('/api/coding/sessions');
    expect(result.sessions).toEqual([
      {id, title: 'Task', workingDirectory: '/ws'},
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test coding.test.ts`
Expected: FAIL — `listAllSessions` is not exported.

- [ ] **Step 3: Replace `listSessions` with `listAllSessions`**

In `apps/frontend/src/api/coding/coding.ts`: update the api-schema import (drop `ListSessionsResponse`/`listSessionsResponseSchema`, add the coding ones) and replace the `listSessions` function:

```ts
import {
  createSessionResponseSchema,
  type ListCodingSessionsResponse,
  listCodingSessionsResponseSchema,
} from '@omnicraft/api-schema';
```

```ts
/** Fetches all coding sessions (no pagination). */
export async function listAllSessions(): Promise<ListCodingSessionsResponse> {
  const res = await fetch(`${BASE}/sessions`);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Failed to list sessions (${res.status.toString()}): ${body}`,
    );
  }

  const json: unknown = await res.json();
  return listCodingSessionsResponseSchema.parse(json);
}
```

In `apps/frontend/src/api/coding/index.ts`, replace `listSessions` with `listAllSessions` in the export list (keep the rest).

- [ ] **Step 4: Make context `listSessions` optional + guard the chat consumer**

In `ChatSessionApiContext.ts`, change the `listSessions` member to optional:

```ts
  listSessions?: (
    offset: number,
    limit: number,
  ) => Promise<ListSessionsResponse>;
```

In `useSessionList.ts`, guard inside the fetcher (keeps hooks unconditional):

```ts
    fetcher: async (offset: number, limit: number) => {
      if (!listSessions) {
        throw new Error('listSessions API is unavailable');
      }
      const result = await listSessions(offset, limit);
      return {items: result.sessions, total: result.total};
    },
```

- [ ] **Step 5: Run test + typecheck**

Run: `bun run --filter @omnicraft/frontend test coding.test.ts`
Expected: PASS
Run: `bun run typecheck:all`
Expected: no errors (the coding page passes `codingApi` which now omits `listSessions`; optional satisfies it).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/api/coding/coding.ts apps/frontend/src/api/coding/index.ts apps/frontend/src/api/coding/coding.test.ts apps/frontend/src/modules/chat-session/contexts/ChatSessionApiContext/ChatSessionApiContext.ts apps/frontend/src/modules/chat-session/components/SessionList/hooks/useSessionList.ts
git commit -m "feat(frontend): add coding listAllSessions; make context listSessions optional

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 2 — Re-nest workspace settings under a "Coding" group

### Task 5: Move "Coding Agent" + "Workspaces" into a new "Coding" settings group

Pure navigation/route reorganization. Settings keys and section components are unchanged — only their route paths, nav grouping, lazy-import paths, and on-disk folders move. The default settings redirect (`ROUTES.settings.llm.chat()`) stays valid.

**Files:**

- Modify: `apps/frontend/src/routes.ts`
- Move: `apps/frontend/src/pages/settings/sections/llm/coding/` → `apps/frontend/src/pages/settings/sections/coding/agent/`
- Move: `apps/frontend/src/pages/settings/sections/file-access/workspaces/` → `apps/frontend/src/pages/settings/sections/coding/workspaces/`
- Modify: `apps/frontend/src/pages/settings/SettingsPage.tsx:13-59` (`SETTINGS_NAV_ITEMS`)
- Modify: `apps/frontend/src/router/router.tsx:56,68` (route paths)
- Modify: `apps/frontend/src/router/lazy-pages.tsx:30-34,48-52` (import paths)
- Modify: `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCardView.tsx:185` (stale link; this file is deleted in Task 13 but must compile until then)
- Test: `apps/frontend/src/routes.test.ts` (create)

**Interfaces:**

- Produces: `ROUTES.settings.coding.agent()` → `/settings/coding/agent`; `ROUTES.settings.coding.workspaces()` → `/settings/coding/workspaces`. (`ROUTES.settings.llm.coding` and `ROUTES.settings['file-access']` are removed.)

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/routes.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {ROUTES} from './routes.js';

describe('settings routes', () => {
  it('nests Coding Agent and Workspaces under /settings/coding', () => {
    expect(ROUTES.settings.coding.agent()).toBe('/settings/coding/agent');
    expect(ROUTES.settings.coding.workspaces()).toBe(
      '/settings/coding/workspaces',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test routes.test.ts`
Expected: FAIL — `ROUTES.settings.coding` is undefined.

- [ ] **Step 3: Update the route tree**

Replace the `settings` block in `apps/frontend/src/routes.ts`:

```ts
  settings: {
    llm: {chat: {}},
    coding: {agent: {}, workspaces: {}},
    agent: {runtime: {}},
    tools: {search: {}},
  },
```

- [ ] **Step 4: Move the section folders**

```bash
cd apps/frontend/src/pages/settings/sections
mkdir -p coding
git mv llm/coding coding/agent
git mv file-access/workspaces coding/workspaces
rmdir file-access 2>/dev/null || true
```

(Component export names stay `CodingLlmSection` and `WorkspacesSection`; only the folder location changes. Relative imports inside the folders are unaffected.)

- [ ] **Step 5: Update the settings nav items**

Replace `SETTINGS_NAV_ITEMS` in `apps/frontend/src/pages/settings/SettingsPage.tsx`:

```ts
const SETTINGS_NAV_ITEMS: readonly SettingsNavItem[] = [
  {
    id: 'llm',
    label: 'LLM',
    children: [
      {id: 'llm.chat', label: 'Chat Agent', path: ROUTES.settings.llm.chat()},
    ],
  },
  {
    id: 'coding',
    label: 'Coding',
    children: [
      {
        id: 'coding.agent',
        label: 'Coding Agent',
        path: ROUTES.settings.coding.agent(),
      },
      {
        id: 'coding.workspaces',
        label: 'Workspaces',
        path: ROUTES.settings.coding.workspaces(),
      },
    ],
  },
  {
    id: 'agent',
    label: 'Agent',
    children: [
      {
        id: 'agent.runtime',
        label: 'Runtime',
        path: ROUTES.settings.agent.runtime(),
      },
    ],
  },
  {
    id: 'tools',
    label: 'Tools',
    children: [
      {
        id: 'tools.search',
        label: 'Search',
        path: ROUTES.settings.tools.search(),
      },
    ],
  },
];
```

- [ ] **Step 6: Update the router and lazy imports**

In `apps/frontend/src/router/router.tsx`, change the two child route paths (leave the `element` and imported component names as-is):

```tsx
          {
            path: ROUTES.settings.coding.agent(),
            element: <CodingLlmSection />,
          },
          {
            path: ROUTES.settings.coding.workspaces(),
            element: <WorkspacesSection />,
          },
```

In `apps/frontend/src/router/lazy-pages.tsx`, update the two dynamic import paths:

```tsx
export const CodingLlmSection = lazy(async () => {
  const {CodingLlmSection} =
    await import('@/pages/settings/sections/coding/agent/index.js');
  return {default: CodingLlmSection};
});
```

```tsx
export const WorkspacesSection = lazy(async () => {
  const {WorkspacesSection} =
    await import('@/pages/settings/sections/coding/workspaces/index.js');
  return {default: WorkspacesSection};
});
```

Then update the one remaining reference to the old workspaces route, in `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCardView.tsx` (~line 185). `TaskDispatchCard` is deleted in Task 13, but it must keep compiling until then:

```tsx
                            to={ROUTES.settings.coding.workspaces()}
```

- [ ] **Step 7: Run test + typecheck**

Run: `bun run --filter @omnicraft/frontend test routes.test.ts`
Expected: PASS
Run: `bun run typecheck:all`
Expected: no errors (confirms no dangling references to the old route paths or folders).

- [ ] **Step 8: Commit**

```bash
git add -A apps/frontend/src
git commit -m "refactor(frontend): nest Coding Agent and Workspaces under a Coding settings group

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 3 — Grouping logic (pure helpers + load-all hook)

All files live under the new component folder `apps/frontend/src/pages/coding/components/WorkspaceSessionList/`.

### Task 6: `normalizeWorkspacePath` helper

**Files:**

- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/helpers/normalize-workspace-path.ts`
- Test: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/helpers/normalize-workspace-path.test.ts`

**Interfaces:**

- Produces: `normalizeWorkspacePath(path: string): string`

- [ ] **Step 1: Write the failing test**

```ts
import {describe, expect, it} from 'vitest';

import {normalizeWorkspacePath} from './normalize-workspace-path.js';

describe('normalizeWorkspacePath', () => {
  it('strips a single trailing slash', () => {
    expect(normalizeWorkspacePath('/a/b/')).toBe('/a/b');
  });

  it('leaves a path without a trailing slash unchanged', () => {
    expect(normalizeWorkspacePath('/a/b')).toBe('/a/b');
  });

  it('keeps the root slash', () => {
    expect(normalizeWorkspacePath('/')).toBe('/');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test normalize-workspace-path.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
/**
 * Normalizes a workspace path for bucket-key comparison: strips a single
 * trailing slash while preserving the root path ("/").
 */
export function normalizeWorkspacePath(path: string): string {
  if (path.length > 1 && path.endsWith('/')) {
    return path.slice(0, -1);
  }
  return path;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test normalize-workspace-path.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/helpers
git commit -m "feat(frontend): add normalizeWorkspacePath helper

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 7: `useWorkspaceGroups` (pure grouping)

**Files:**

- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useWorkspaceGroups.ts`
- Test: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useWorkspaceGroups.test.ts`

**Interfaces:**

- Consumes: `normalizeWorkspacePath` (Task 6)
- Produces:
  - `interface WorkspaceGroup { workspace?: Workspace; sessions: readonly SessionMetadata[] }`
  - `groupSessionsByWorkspace(workspaces, sessions): WorkspaceGroup[]` (pure)
  - `useWorkspaceGroups(workspaces, sessions): readonly WorkspaceGroup[]` (memoized wrapper)

- [ ] **Step 1: Write the failing test**

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {describe, expect, it} from 'vitest';

import {groupSessionsByWorkspace} from './useWorkspaceGroups.js';

const ws = (path: string): Workspace => ({path});
const session = (id: string, workingDirectory?: string): SessionMetadata => ({
  id,
  title: id,
  workingDirectory,
});

describe('groupSessionsByWorkspace', () => {
  it('returns one group per workspace in config order, each with its sessions', () => {
    const groups = groupSessionsByWorkspace(
      [ws('/a'), ws('/b')],
      [session('s1', '/a'), session('s2', '/b'), session('s3', '/a')],
    );
    expect(groups.map((g) => g.workspace?.path)).toEqual(['/a', '/b']);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['s1', 's3']);
    expect(groups[1].sessions.map((s) => s.id)).toEqual(['s2']);
  });

  it('keeps configured workspaces with no sessions (no orphan group)', () => {
    const groups = groupSessionsByWorkspace([ws('/a')], []);
    expect(groups).toEqual([{workspace: {path: '/a'}, sessions: []}]);
  });

  it('normalizes trailing slashes when bucketing', () => {
    const groups = groupSessionsByWorkspace([ws('/a/')], [session('s1', '/a')]);
    expect(groups[0].sessions.map((s) => s.id)).toEqual(['s1']);
  });

  it('puts unconfigured and missing-workspace sessions in a trailing Ungrouped group', () => {
    const groups = groupSessionsByWorkspace(
      [ws('/a')],
      [session('s1', '/a'), session('s2', '/gone'), session('s3')],
    );
    expect(groups).toHaveLength(2);
    const last = groups[1];
    expect(last.workspace).toBeUndefined();
    expect(last.sessions.map((s) => s.id)).toEqual(['s2', 's3']);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test useWorkspaceGroups.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {useMemo} from 'react';

import {normalizeWorkspacePath} from '../helpers/normalize-workspace-path.js';

export interface WorkspaceGroup {
  /** undefined ⇒ the orphan "Ungrouped" group (rendered without a `+`). */
  readonly workspace?: Workspace;
  readonly sessions: readonly SessionMetadata[];
}

/**
 * Buckets sessions under their configured workspace (matched by normalized
 * workingDirectory). Sessions whose workspace is not configured — or that have
 * no workingDirectory — collect into a single trailing "Ungrouped" group, which
 * is omitted when empty.
 */
export function groupSessionsByWorkspace(
  workspaces: readonly Workspace[],
  sessions: readonly SessionMetadata[],
): WorkspaceGroup[] {
  const byPath = new Map<string, SessionMetadata[]>();
  for (const workspace of workspaces) {
    byPath.set(normalizeWorkspacePath(workspace.path), []);
  }

  const orphans: SessionMetadata[] = [];
  for (const session of sessions) {
    const key =
      session.workingDirectory === undefined
        ? undefined
        : normalizeWorkspacePath(session.workingDirectory);
    const bucket = key === undefined ? undefined : byPath.get(key);
    if (bucket) {
      bucket.push(session);
      continue;
    }
    orphans.push(session);
  }

  const groups: WorkspaceGroup[] = workspaces.map((workspace) => ({
    workspace,
    sessions: byPath.get(normalizeWorkspacePath(workspace.path)) ?? [],
  }));

  if (orphans.length > 0) {
    groups.push({sessions: orphans});
  }

  return groups;
}

/** Memoized hook wrapper around {@link groupSessionsByWorkspace}. */
export function useWorkspaceGroups(
  workspaces: readonly Workspace[],
  sessions: readonly SessionMetadata[],
): readonly WorkspaceGroup[] {
  return useMemo(
    () => groupSessionsByWorkspace(workspaces, sessions),
    [workspaces, sessions],
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test useWorkspaceGroups.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useWorkspaceGroups.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useWorkspaceGroups.test.ts
git commit -m "feat(frontend): add useWorkspaceGroups bucketing hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 8: `useAllCodingSessions` (load-all + event refresh + delete)

**Files:**

- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.ts`
- Test: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.test.tsx`

**Interfaces:**

- Consumes: `listAllSessions`, `deleteSession` from `@/api/coding` (Task 4); `useChatEventBus`, `ChatEventBusProvider` from `@/modules/chat-session`.
- Produces: `useAllCodingSessions(): { sessions, isLoading, error, removeSession }`

- [ ] **Step 1: Write the failing test**

```tsx
import type {ReactNode} from 'react';
import {renderHook, waitFor} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

vi.mock('@/api/coding/index.js', () => ({
  listAllSessions: vi.fn(),
  deleteSession: vi.fn(),
}));

import {deleteSession, listAllSessions} from '@/api/coding/index.js';
import {ChatEventBusProvider} from '@/modules/chat-session/index.js';

import {useAllCodingSessions} from './useAllCodingSessions.js';

function wrapper({children}: {children: ReactNode}) {
  return <ChatEventBusProvider>{children}</ChatEventBusProvider>;
}

afterEach(() => {
  vi.clearAllMocks();
});

describe('useAllCodingSessions', () => {
  it('loads all sessions on mount', async () => {
    vi.mocked(listAllSessions).mockResolvedValue({
      sessions: [{id: 's1', title: 'One'}],
    });

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });
    expect(result.current.sessions).toHaveLength(1);
    expect(result.current.error).toBeNull();
  });

  it('removeSession deletes then reloads', async () => {
    vi.mocked(listAllSessions).mockResolvedValue({sessions: []});
    vi.mocked(deleteSession).mockResolvedValue();

    const {result} = renderHook(() => useAllCodingSessions(), {wrapper});
    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.removeSession('s1');

    expect(deleteSession).toHaveBeenCalledWith('s1');
    expect(listAllSessions).toHaveBeenCalledTimes(2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test useAllCodingSessions.test.tsx`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import type {SessionMetadata} from '@omnicraft/api-schema';
import {useCallback, useEffect, useState} from 'react';

import {deleteSession, listAllSessions} from '@/api/coding/index.js';
import {useChatEventBus} from '@/modules/chat-session/index.js';

interface UseAllCodingSessionsResult {
  readonly sessions: readonly SessionMetadata[];
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly removeSession: (id: string) => Promise<void>;
}

/**
 * Loads every coding session (no pagination) and keeps it fresh: re-fetches on
 * session-created / session-title events from the chat event bus.
 */
export function useAllCodingSessions(): UseAllCodingSessionsResult {
  const eventBus = useChatEventBus();
  const [sessions, setSessions] = useState<readonly SessionMetadata[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      const result = await listAllSessions();
      setSessions(result.sessions);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load sessions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    const onRefresh = () => {
      void reload();
    };
    eventBus.on('session-created', onRefresh);
    eventBus.on('session-title', onRefresh);
    return () => {
      eventBus.off('session-created', onRefresh);
      eventBus.off('session-title', onRefresh);
    };
  }, [eventBus, reload]);

  const removeSession = useCallback(
    async (id: string) => {
      await deleteSession(id);
      await reload();
    },
    [reload],
  );

  return {sessions, isLoading, error, removeSession};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test useAllCodingSessions.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/hooks/useAllCodingSessions.test.tsx
git commit -m "feat(frontend): add useAllCodingSessions load-all hook

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 4 — Sidebar UI (`WorkspaceSessionList`)

### Task 9: `WorkspaceGroup` view + export `SessionItem`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/index.ts` (export `SessionItem`)
- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/helpers/workspace-basename.ts`
- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/helpers/workspace-basename.test.ts`
- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/components/WorkspaceGroup/WorkspaceGroupView.tsx`
- Create: `.../WorkspaceGroup/index.ts`
- Create: `.../WorkspaceGroup/styles.module.css`
- Create: `.../WorkspaceGroup/WorkspaceGroupView.test.tsx`

**Interfaces:**

- Consumes: `SessionItem` from `@/modules/chat-session`; HeroUI `Disclosure`, `ListBox`, `Button`, `Tooltip`.
- Produces: `WorkspaceGroupView` (stateless). Props:

  ```ts
  interface WorkspaceGroupViewProps {
    workspace?: Workspace; // undefined ⇒ Ungrouped (no "+")
    sessions: readonly SessionMetadata[];
    isExpanded: boolean;
    onExpandedChange: (expanded: boolean) => void;
    currentSessionId: string | null;
    onSelectSession: (id: string) => void;
    onDeleteSession: (id: string) => Promise<void>;
    onNewSession?: (workspacePath: string) => void;
  }
  ```

- [ ] **Step 1: Export `SessionItem` from the chat-session module**

In `apps/frontend/src/modules/chat-session/index.ts`, add under the `// Components` block:

```ts
export {SessionItem} from './components/SessionList/components/SessionItem/index.js';
```

- [ ] **Step 2: Write the failing helper test**

Create `helpers/workspace-basename.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {workspaceBasename} from './workspace-basename.js';

describe('workspaceBasename', () => {
  it('returns the last path segment', () => {
    expect(workspaceBasename('/a/b')).toBe('b');
  });

  it('ignores a trailing slash', () => {
    expect(workspaceBasename('/a/b/')).toBe('b');
  });

  it('falls back to the full path when there is no segment', () => {
    expect(workspaceBasename('/')).toBe('/');
  });
});
```

- [ ] **Step 3: Run helper test (fails), then implement**

Run: `bun run --filter @omnicraft/frontend test workspace-basename.test.ts` → FAIL.

Create `helpers/workspace-basename.ts`:

```ts
/** Returns the last path segment (directory name) of a workspace path. */
export function workspaceBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return base.length > 0 ? base : path;
}
```

Run again → PASS.

- [ ] **Step 4: Write the failing view test**

Create `components/WorkspaceGroup/WorkspaceGroupView.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {WorkspaceGroupView} from './WorkspaceGroupView.js';

const noop = () => undefined;
const asyncNoop = async () => undefined;

describe('WorkspaceGroupView', () => {
  it('shows the basename, count, and a New task button for a workspace', () => {
    render(
      <WorkspaceGroupView
        workspace={{path: '/home/me/proj'}}
        sessions={[{id: 's1', title: 'One'}]}
        isExpanded
        onExpandedChange={noop}
        currentSessionId={null}
        onSelectSession={noop}
        onDeleteSession={asyncNoop}
        onNewSession={vi.fn()}
      />,
    );
    expect(screen.getByText('proj')).toBeInTheDocument();
    expect(screen.getByText('·1')).toBeInTheDocument();
    expect(screen.getByRole('button', {name: 'New task'})).toBeInTheDocument();
  });

  it('renders the Ungrouped label with no New task button and an empty hint', () => {
    render(
      <WorkspaceGroupView
        sessions={[]}
        isExpanded
        onExpandedChange={noop}
        currentSessionId={null}
        onSelectSession={noop}
        onDeleteSession={asyncNoop}
      />,
    );
    expect(screen.getByText('Ungrouped')).toBeInTheDocument();
    expect(screen.getByText('No sessions yet')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', {name: 'New task'}),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 5: Run view test (fails), then implement the view + styles + index**

Run: `bun run --filter @omnicraft/frontend test WorkspaceGroupView.test.tsx` → FAIL (module not found).

Create `components/WorkspaceGroup/WorkspaceGroupView.tsx`:

```tsx
import type {Selection} from '@heroui/react';
import {Button, Disclosure, ListBox, Tooltip} from '@heroui/react';
import type {SessionMetadata} from '@omnicraft/api-schema';
import type {Workspace} from '@omnicraft/settings-schema';
import {Plus} from 'lucide-react';
import {useMemo} from 'react';

import {SessionItem} from '@/modules/chat-session/index.js';

import {workspaceBasename} from '../../helpers/workspace-basename.js';
import styles from './styles.module.css';

interface WorkspaceGroupViewProps {
  readonly workspace?: Workspace;
  readonly sessions: readonly SessionMetadata[];
  readonly isExpanded: boolean;
  readonly onExpandedChange: (expanded: boolean) => void;
  readonly currentSessionId: string | null;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => Promise<void>;
  readonly onNewSession?: (workspacePath: string) => void;
}

export function WorkspaceGroupView({
  workspace,
  sessions,
  isExpanded,
  onExpandedChange,
  currentSessionId,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}: WorkspaceGroupViewProps) {
  const label = workspace ? workspaceBasename(workspace.path) : 'Ungrouped';

  const selectedKeys = useMemo(
    () =>
      currentSessionId !== null
        ? new Set([currentSessionId])
        : new Set<string>(),
    [currentSessionId],
  );

  return (
    <Disclosure
      className={styles.group}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    >
      <Disclosure.Heading className={styles.heading}>
        <Button slot='trigger' variant='ghost' className={styles.trigger}>
          <Disclosure.Indicator className={styles.indicator} />
          <span className={styles.label} title={workspace?.path}>
            {label}
          </span>
          <span className={styles.count}>·{sessions.length}</span>
        </Button>
        {!!onNewSession && !!workspace && (
          <Tooltip delay={0}>
            <Tooltip.Trigger>
              <Button
                isIconOnly
                size='sm'
                variant='ghost'
                aria-label='New task'
                className={styles.plus}
                onPress={() => {
                  onNewSession(workspace.path);
                }}
              >
                <Plus size={15} />
              </Button>
            </Tooltip.Trigger>
            <Tooltip.Content>
              <p>New task</p>
            </Tooltip.Content>
          </Tooltip>
        )}
      </Disclosure.Heading>
      <Disclosure.Content>
        <Disclosure.Body className={styles.body}>
          {sessions.length === 0 ? (
            <p className={styles.empty}>No sessions yet</p>
          ) : (
            <ListBox
              aria-label={`${label} sessions`}
              className={styles.listBox}
              items={sessions}
              selectedKeys={selectedKeys}
              selectionMode='single'
              onSelectionChange={(keys: Selection) => {
                if (keys === 'all') {
                  return;
                }
                const selected = [...keys][0];
                if (typeof selected === 'string') {
                  onSelectSession(selected);
                }
              }}
            >
              {(session) => (
                <ListBox.Item
                  key={session.id}
                  id={session.id}
                  textValue={session.title}
                >
                  <SessionItem
                    title={session.title}
                    onDelete={async () => onDeleteSession(session.id)}
                  />
                </ListBox.Item>
              )}
            </ListBox>
          )}
        </Disclosure.Body>
      </Disclosure.Content>
    </Disclosure>
  );
}
```

Create `components/WorkspaceGroup/index.ts`:

```ts
export {WorkspaceGroupView} from './WorkspaceGroupView.js';
```

Create `components/WorkspaceGroup/styles.module.css` (Aurora Glass; active row reuses the nav active tokens):

```css
.group {
  display: block;
}

.heading {
  display: flex;
  align-items: center;
  gap: 2px;
  padding: 1px 2px;
}

.trigger {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  justify-content: flex-start;
  gap: 8px;
  padding: 7px 8px;
  height: auto;
  font: inherit;
  color: var(--foreground);
}

.indicator {
  flex: 0 0 auto;
  color: var(--muted);
}

.label {
  font-weight: 600;
  font-size: 0.875rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.count {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.72rem;
}

.plus {
  flex: 0 0 auto;
  color: var(--muted);
}

.body {
  padding: 0 0 4px;
}

.empty {
  margin: 0;
  padding: 4px 8px 8px 30px;
  color: var(--muted);
  font-size: 0.8rem;
}

.listBox {
  padding-left: 14px;
}

.listBox :global(.list-box-item[data-selected='true']) {
  background: var(--aurora-active-fill);
  box-shadow: inset 0 1px 0 var(--aurora-glass-highlight);
  border-radius: 9px;
}
```

- [ ] **Step 6: Run view test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test WorkspaceGroupView.test.tsx`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/modules/chat-session/index.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/helpers apps/frontend/src/pages/coding/components/WorkspaceSessionList/components
git commit -m "feat(frontend): add WorkspaceGroup view; export SessionItem

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 10: `WorkspaceSessionList` container + view

**Files:**

- Create: `apps/frontend/src/pages/coding/components/WorkspaceSessionList/WorkspaceSessionList.tsx`
- Create: `.../WorkspaceSessionListView.tsx`
- Create: `.../index.ts`
- Create: `.../styles.module.css`
- Create: `.../WorkspaceSessionListView.test.tsx`

**Interfaces:**

- Consumes: `useSessionConfig`, `useSessionId` (`@/modules/chat-session`); `useAllCodingSessions`, `useWorkspaceGroups`, `normalizeWorkspacePath`, `WorkspaceGroupView`; `ROUTES.settings.coding.workspaces()` (Task 5).
- Produces: `WorkspaceSessionList` component. Props: `{ onNewSession: (workspacePath: string) => void }`.

- [ ] **Step 1: Write the failing view test**

Create `WorkspaceSessionListView.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {MemoryRouter} from 'react-router';
import {describe, expect, it} from 'vitest';

import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

const noop = () => undefined;
const asyncNoop = async () => undefined;

describe('WorkspaceSessionListView', () => {
  it('renders one group per entry and a Manage workspaces link', () => {
    render(
      <MemoryRouter>
        <WorkspaceSessionListView
          entries={[
            {key: '/a', group: {workspace: {path: '/a'}, sessions: []}},
            {key: '/b', group: {workspace: {path: '/b'}, sessions: []}},
          ]}
          expanded={new Set()}
          isLoading={false}
          error={null}
          currentSessionId={null}
          onToggle={noop}
          onSelectSession={noop}
          onDeleteSession={asyncNoop}
          onNewSession={noop}
        />
      </MemoryRouter>,
    );
    expect(screen.getByText('a')).toBeInTheDocument();
    expect(screen.getByText('b')).toBeInTheDocument();
    expect(
      screen.getByRole('link', {name: /manage workspaces/i}),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test WorkspaceSessionListView.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the view**

Create `WorkspaceSessionListView.tsx`:

```tsx
import {Spinner} from '@heroui/react';
import {Settings2} from 'lucide-react';
import {Link} from 'react-router';

import {ROUTES} from '@/routes.js';

import {WorkspaceGroupView} from './components/WorkspaceGroup/index.js';
import type {WorkspaceGroup} from './hooks/useWorkspaceGroups.js';
import styles from './styles.module.css';

export interface WorkspaceGroupEntry {
  readonly key: string;
  readonly group: WorkspaceGroup;
}

interface WorkspaceSessionListViewProps {
  readonly entries: readonly WorkspaceGroupEntry[];
  readonly expanded: ReadonlySet<string>;
  readonly isLoading: boolean;
  readonly error: string | null;
  readonly currentSessionId: string | null;
  readonly onToggle: (key: string, isExpanded: boolean) => void;
  readonly onSelectSession: (id: string) => void;
  readonly onDeleteSession: (id: string) => Promise<void>;
  readonly onNewSession: (workspacePath: string) => void;
}

export function WorkspaceSessionListView({
  entries,
  expanded,
  isLoading,
  error,
  currentSessionId,
  onToggle,
  onSelectSession,
  onDeleteSession,
  onNewSession,
}: WorkspaceSessionListViewProps) {
  return (
    <div className={styles.wrapper}>
      <div className={styles.scroll}>
        {isLoading && (
          <div className={styles.centered}>
            <Spinner size='sm' />
          </div>
        )}
        {!isLoading && error !== null && (
          <p className={styles.errorText}>Failed to load sessions</p>
        )}
        {!isLoading && error === null && entries.length === 0 && (
          <p className={styles.emptyText}>No workspaces configured</p>
        )}
        {!isLoading &&
          error === null &&
          entries.map(({key, group}) => (
            <WorkspaceGroupView
              key={key}
              workspace={group.workspace}
              sessions={group.sessions}
              isExpanded={expanded.has(key)}
              onExpandedChange={(isExpanded) => {
                onToggle(key, isExpanded);
              }}
              currentSessionId={currentSessionId}
              onSelectSession={onSelectSession}
              onDeleteSession={onDeleteSession}
              onNewSession={group.workspace ? onNewSession : undefined}
            />
          ))}
      </div>
      <Link
        className={styles.manageLink}
        to={ROUTES.settings.coding.workspaces()}
      >
        <Settings2 size={14} />
        Manage workspaces…
      </Link>
    </div>
  );
}
```

- [ ] **Step 4: Implement the container**

Create `WorkspaceSessionList.tsx`:

```tsx
import {toast} from '@heroui/react';
import {useCallback, useEffect, useMemo, useState} from 'react';
import {useNavigate} from 'react-router';

import {useSessionConfig, useSessionId} from '@/modules/chat-session/index.js';

import {normalizeWorkspacePath} from './helpers/normalize-workspace-path.js';
import {useAllCodingSessions} from './hooks/useAllCodingSessions.js';
import {useWorkspaceGroups} from './hooks/useWorkspaceGroups.js';
import type {WorkspaceGroupEntry} from './WorkspaceSessionListView.js';
import {WorkspaceSessionListView} from './WorkspaceSessionListView.js';

const UNGROUPED_KEY = ' ungrouped';

interface WorkspaceSessionListProps {
  readonly onNewSession: (workspacePath: string) => void;
}

export function WorkspaceSessionList({
  onNewSession,
}: WorkspaceSessionListProps) {
  const {workspaces} = useSessionConfig();
  const {sessions, isLoading, error, removeSession} = useAllCodingSessions();
  const {sessionId, buildSessionRoute, baseRoute} = useSessionId();
  const navigate = useNavigate();

  const groups = useWorkspaceGroups(workspaces, sessions);

  const entries = useMemo<readonly WorkspaceGroupEntry[]>(
    () =>
      groups.map((group) => ({
        key: group.workspace
          ? normalizeWorkspacePath(group.workspace.path)
          : UNGROUPED_KEY,
        group,
      })),
    [groups],
  );

  // The group holding the active session, used to seed the expanded set once.
  const activeKey = useMemo(() => {
    const active = sessions.find((s) => s.id === sessionId);
    return active?.workingDirectory
      ? normalizeWorkspacePath(active.workingDirectory)
      : null;
  }, [sessions, sessionId]);

  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );
  const [seeded, setSeeded] = useState(false);
  useEffect(() => {
    if (seeded || activeKey === null) {
      return;
    }
    setExpanded(new Set([activeKey]));
    setSeeded(true);
  }, [seeded, activeKey]);

  const handleToggle = useCallback((key: string, isExpanded: boolean) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (isExpanded) {
        next.add(key);
      } else {
        next.delete(key);
      }
      return next;
    });
  }, []);

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id !== sessionId) {
        void navigate(buildSessionRoute(id));
      }
    },
    [navigate, sessionId, buildSessionRoute],
  );

  const handleDeleteSession = useCallback(
    async (id: string) => {
      try {
        await removeSession(id);
      } catch (e: unknown) {
        console.error('Failed to delete session:', e);
        toast.danger('Failed to delete session');
        return;
      }
      toast.success('Session deleted');
      if (id === sessionId) {
        void navigate(baseRoute, {replace: true});
      }
    },
    [removeSession, sessionId, navigate, baseRoute],
  );

  return (
    <WorkspaceSessionListView
      entries={entries}
      expanded={expanded}
      isLoading={isLoading}
      error={error}
      currentSessionId={sessionId}
      onToggle={handleToggle}
      onSelectSession={handleSelectSession}
      onDeleteSession={handleDeleteSession}
      onNewSession={onNewSession}
    />
  );
}
```

Create `index.ts`:

```ts
export {WorkspaceSessionList} from './WorkspaceSessionList.js';
```

Create `styles.module.css`:

```css
.wrapper {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
}

.scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 0 4px;
}

.centered {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.errorText,
.emptyText {
  margin: 0;
  padding: 16px 8px;
  text-align: center;
  color: var(--muted);
  font-size: 0.85rem;
}

.manageLink {
  flex: 0 0 auto;
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 4px;
  padding: 9px 10px;
  border-top: 1px solid var(--border);
  color: var(--muted);
  font-size: 0.8rem;
  text-decoration: none;
}

.manageLink:hover {
  color: var(--foreground);
}
```

- [ ] **Step 5: Run the view test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test WorkspaceSessionListView.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/coding/components/WorkspaceSessionList/WorkspaceSessionList.tsx apps/frontend/src/pages/coding/components/WorkspaceSessionList/WorkspaceSessionListView.tsx apps/frontend/src/pages/coding/components/WorkspaceSessionList/index.ts apps/frontend/src/pages/coding/components/WorkspaceSessionList/styles.module.css apps/frontend/src/pages/coding/components/WorkspaceSessionList/WorkspaceSessionListView.test.tsx
git commit -m "feat(frontend): add WorkspaceSessionList grouped sidebar

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Phase 5 — New-session modal + page wiring

### Task 11: `NewSessionModal` (read-only workspace + task)

**Files:**

- Create: `apps/frontend/src/pages/coding/components/NewSessionModal/NewSessionModal.tsx`
- Create: `.../NewSessionModalView.tsx`
- Create: `.../hooks/useNewTaskForm.ts`
- Create: `.../helpers/workspace-basename.ts` (decoupled copy — keeps this component independent of `WorkspaceSessionList`)
- Create: `.../index.ts`
- Create: `.../styles.module.css`
- Create: `.../NewSessionModal.test.tsx`

**Interfaces:**

- Produces: `NewSessionModal` component. Props: `{ workspace: string | null; onClose: () => void; onSubmit: (task: string) => Promise<void> }`. Open iff `workspace !== null`.

- [ ] **Step 1: Write the failing test**

Create `NewSessionModal.test.tsx`:

```tsx
import {fireEvent, render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import {NewSessionModal} from './NewSessionModal.js';

describe('NewSessionModal', () => {
  it('submits the typed task for the target workspace', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(
      <NewSessionModal
        workspace='/home/me/proj'
        onClose={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByText('New task in proj')).toBeInTheDocument();
    const startButton = screen.getByRole('button', {name: 'Start task'});
    expect(startButton).toBeDisabled();

    fireEvent.change(screen.getByRole('textbox', {name: 'Task'}), {
      target: {value: 'Refactor the sidebar'},
    });
    expect(startButton).not.toBeDisabled();
    fireEvent.click(startButton);

    expect(onSubmit).toHaveBeenCalledWith('Refactor the sidebar');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test NewSessionModal.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the form hook**

Create `hooks/useNewTaskForm.ts`:

```ts
import {useCallback, useEffect, useState} from 'react';

interface UseNewTaskFormOptions {
  readonly isOpen: boolean;
  readonly onSubmit: (task: string) => Promise<void>;
}

export function useNewTaskForm({isOpen, onSubmit}: UseNewTaskFormOptions) {
  const [task, setTask] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Reset the draft whenever the modal closes.
  useEffect(() => {
    if (isOpen) {
      return;
    }
    setTask('');
    setError(undefined);
    setSubmitError(null);
  }, [isOpen]);

  const trimmed = task.trim();
  const canSubmit = !isSubmitting && trimmed.length > 0;

  const handleTaskChange = useCallback((value: string) => {
    setTask(value);
    setError(undefined);
    setSubmitError(null);
  }, []);

  const submit = useCallback(async () => {
    if (isSubmitting) {
      return;
    }
    if (trimmed.length === 0) {
      setError('Describe the coding task before starting.');
      return;
    }
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(trimmed);
    } catch (e: unknown) {
      setSubmitError(e instanceof Error ? e.message : 'Failed to start task.');
    } finally {
      setIsSubmitting(false);
    }
  }, [isSubmitting, trimmed, onSubmit]);

  return {
    task,
    error,
    submitError,
    isSubmitting,
    canSubmit,
    handleTaskChange,
    submit,
  };
}
```

Create `helpers/workspace-basename.ts` (identical to Task 9's; duplicated to keep the modal decoupled from `WorkspaceSessionList`):

```ts
/** Returns the last path segment (directory name) of a workspace path. */
export function workspaceBasename(path: string): string {
  const trimmed = path.replace(/\/+$/, '');
  const idx = trimmed.lastIndexOf('/');
  const base = idx >= 0 ? trimmed.slice(idx + 1) : trimmed;
  return base.length > 0 ? base : path;
}
```

- [ ] **Step 4: Implement the view, container, styles, index**

Create `NewSessionModalView.tsx`:

```tsx
import {
  Alert,
  Button,
  FieldError,
  Label,
  Modal,
  Spinner,
  TextArea,
  TextField,
} from '@heroui/react';
import {FolderCode} from 'lucide-react';

import {workspaceBasename} from './helpers/workspace-basename.js';
import styles from './styles.module.css';

interface NewSessionModalViewProps {
  readonly isOpen: boolean;
  readonly workspace: string | null;
  readonly task: string;
  readonly error: string | undefined;
  readonly submitError: string | null;
  readonly isSubmitting: boolean;
  readonly canSubmit: boolean;
  readonly onTaskChange: (task: string) => void;
  readonly onSubmit: () => void;
  readonly onClose: () => void;
}

export function NewSessionModalView({
  isOpen,
  workspace,
  task,
  error,
  submitError,
  isSubmitting,
  canSubmit,
  onTaskChange,
  onSubmit,
  onClose,
}: NewSessionModalViewProps) {
  const label = workspace ? workspaceBasename(workspace) : '';

  return (
    <Modal.Backdrop
      isOpen={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <Modal.Container>
        <Modal.Dialog className={styles.dialog}>
          <Modal.CloseTrigger />
          <Modal.Header>
            <Modal.Heading>New task in {label}</Modal.Heading>
          </Modal.Header>
          <Modal.Body>
            <div className={styles.body}>
              <div className={styles.wsCard}>
                <FolderCode size={16} className={styles.wsIcon} />
                <div className={styles.wsText}>
                  <span className={styles.wsName}>{label}</span>
                  <span className={styles.wsPath}>{workspace}</span>
                </div>
              </div>

              <TextField
                className={styles.field}
                isRequired
                isInvalid={error !== undefined}
                isDisabled={isSubmitting}
                value={task}
                onChange={onTaskChange}
              >
                <Label>Task</Label>
                <TextArea
                  aria-label='Task'
                  className={styles.taskInput}
                  placeholder='Describe the coding task: files, expected behavior, constraints, and how to verify.'
                  rows={8}
                />
                {!!error && (
                  <FieldError className={styles.fieldError}>{error}</FieldError>
                )}
              </TextField>

              {submitError !== null && (
                <Alert status='danger'>
                  <Alert.Indicator />
                  <Alert.Content>
                    <Alert.Description>{submitError}</Alert.Description>
                  </Alert.Content>
                </Alert>
              )}
            </div>
          </Modal.Body>
          <Modal.Footer>
            <Button slot='close' variant='ghost'>
              Cancel
            </Button>
            <Button
              variant='primary'
              isDisabled={!canSubmit}
              onPress={onSubmit}
            >
              {isSubmitting ? <Spinner size='sm' /> : 'Start task'}
            </Button>
          </Modal.Footer>
        </Modal.Dialog>
      </Modal.Container>
    </Modal.Backdrop>
  );
}
```

Create `NewSessionModal.tsx`:

```tsx
import {useNewTaskForm} from './hooks/useNewTaskForm.js';
import {NewSessionModalView} from './NewSessionModalView.js';

interface NewSessionModalProps {
  readonly workspace: string | null;
  readonly onClose: () => void;
  readonly onSubmit: (task: string) => Promise<void>;
}

export function NewSessionModal({
  workspace,
  onClose,
  onSubmit,
}: NewSessionModalProps) {
  const isOpen = workspace !== null;
  const form = useNewTaskForm({isOpen, onSubmit});

  return (
    <NewSessionModalView
      isOpen={isOpen}
      workspace={workspace}
      task={form.task}
      error={form.error}
      submitError={form.submitError}
      isSubmitting={form.isSubmitting}
      canSubmit={form.canSubmit}
      onTaskChange={form.handleTaskChange}
      onSubmit={() => {
        void form.submit();
      }}
      onClose={onClose}
    />
  );
}
```

Create `index.ts`:

```ts
export {NewSessionModal} from './NewSessionModal.js';
```

Create `styles.module.css`:

```css
.dialog {
  width: min(420px, 100%);
}

.body {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.wsCard {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 11px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--surface);
}

.wsIcon {
  flex: 0 0 auto;
  color: var(--accent);
}

.wsText {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.wsName {
  font-weight: 600;
  font-size: 0.875rem;
}

.wsPath {
  font-size: 0.72rem;
  color: var(--muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.taskInput {
  resize: vertical;
}

.fieldError {
  margin: 0;
  color: var(--danger);
  font-size: 0.8125rem;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test NewSessionModal.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/coding/components/NewSessionModal
git commit -m "feat(frontend): add NewSessionModal for workspace-scoped task creation

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 12: Make the TitleBar new-session button optional

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/TitleBar/TitleBarView.tsx`
- Test: `apps/frontend/src/modules/chat-session/components/TitleBar/TitleBarView.test.tsx` (create)

**Interfaces:**

- Produces: `TitleBarViewProps` with `onNewSession?: () => void` and `newSessionDisabled?: boolean` (both optional). The new-session button renders only when `onNewSession` is provided. Chat keeps passing both (unchanged behavior).

- [ ] **Step 1: Write the failing test**

Create `TitleBarView.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {TitleBarView} from './TitleBarView.js';

describe('TitleBarView', () => {
  it('hides the new-session button when onNewSession is omitted', () => {
    render(<TitleBarView title='Hello' />);
    expect(
      screen.queryByRole('button', {name: 'New session'}),
    ).not.toBeInTheDocument();
  });

  it('shows the new-session button when onNewSession is provided', () => {
    render(<TitleBarView title='Hello' onNewSession={() => undefined} />);
    expect(
      screen.getByRole('button', {name: 'New session'}),
    ).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter @omnicraft/frontend test TitleBarView.test.tsx`
Expected: FAIL — the button renders unconditionally / props are required.

- [ ] **Step 3: Make the props optional and gate the button**

In `TitleBarView.tsx`, update the props and wrap the new-session `Tooltip` block:

```tsx
interface TitleBarViewProps {
  title: string | null;
  onNewSession?: () => void;
  newSessionDisabled?: boolean;
  vscodeUrl?: string | null;
}
```

Replace the new-session `<Tooltip>…</Tooltip>` block (the one containing the `MessageSquarePlus` button) with a guarded version:

```tsx
{
  !!onNewSession && (
    <Tooltip delay={0}>
      <Tooltip.Trigger>
        <Button
          isIconOnly
          size='sm'
          variant='ghost'
          aria-label='New session'
          isDisabled={newSessionDisabled}
          onPress={onNewSession}
        >
          <MessageSquarePlus size={16} />
        </Button>
      </Tooltip.Trigger>
      <Tooltip.Content>
        <p>New session</p>
      </Tooltip.Content>
    </Tooltip>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun run --filter @omnicraft/frontend test TitleBarView.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/TitleBar/TitleBarView.tsx apps/frontend/src/modules/chat-session/components/TitleBar/TitleBarView.test.tsx
git commit -m "refactor(frontend): make TitleBar new-session button optional

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

### Task 13: Wire the Coding page; delete `TaskDispatchCard`

**Files:**

- Modify: `apps/frontend/src/pages/coding/CodingPage.tsx`
- Modify: `apps/frontend/src/pages/coding/CodingPageView.tsx`
- Modify: `apps/frontend/src/pages/coding/styles.module.css` (add `.emptyHint`)
- Delete: `apps/frontend/src/pages/coding/components/TaskDispatchCard/` (whole folder, incl. `useTaskDispatchForm.test.ts`)

**Interfaces:**

- Consumes: `WorkspaceSessionList` (Task 10), `NewSessionModal` (Task 11), `TitleBarView` optional props (Task 12), `sendMessageToNewSession` + `setSelectedWorkspace` (existing).

- [ ] **Step 1: Replace `CodingPageView`**

Replace the whole body of `apps/frontend/src/pages/coding/CodingPageView.tsx` with:

```tsx
import {ScrollShadow} from '@heroui/react';
import type {RefObject} from 'react';

import {CollapsibleSidebar} from '@/components/CollapsibleSidebar/index.js';
import type {
  AskUserSubmitHandler,
  ChatEventBus,
  ChatMessage,
} from '@/modules/chat-events/index.js';
import {
  BottomBar,
  ChatAlert,
  ChatInput,
  TitleBarView,
} from '@/modules/chat-session/index.js';
import {StreamingMessageDisplay} from '@/modules/chat-stream/index.js';

import {NewSessionModal} from './components/NewSessionModal/index.js';
import {WorkspaceSessionList} from './components/WorkspaceSessionList/index.js';
import styles from './styles.module.css';

interface CodingPageViewProps {
  title: string | null;
  eventBus: ChatEventBus;
  isStreaming: boolean;
  isReconnecting: boolean;
  error: string | null;
  maxRoundsReached: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string | null;
  onAskUserSubmit: AskUserSubmitHandler | null;
  onMessagesChange: (messages: readonly ChatMessage[]) => void;
  onSend: (content: string) => Promise<void>;
  onStop: () => void;
  onRequestNewSession: (workspacePath: string) => void;
  newSessionWorkspace: string | null;
  onCloseNewSession: () => void;
  onSubmitNewSession: (task: string) => Promise<void>;
  vscodeUrl: string | null;
  onDismissError: () => void;
  onDismissMaxRoundsReached: () => void;
}

export function CodingPageView({
  title,
  eventBus,
  isStreaming,
  isReconnecting,
  error,
  maxRoundsReached,
  scrollRef,
  sessionId,
  onAskUserSubmit,
  onMessagesChange,
  onSend,
  onStop,
  onRequestNewSession,
  newSessionWorkspace,
  onCloseNewSession,
  onSubmitNewSession,
  vscodeUrl,
  onDismissError,
  onDismissMaxRoundsReached,
}: CodingPageViewProps) {
  return (
    <div className={styles.wrapper}>
      <CollapsibleSidebar title='Workspaces'>
        <WorkspaceSessionList onNewSession={onRequestNewSession} />
      </CollapsibleSidebar>
      <div className={styles.main}>
        <div className={styles.page}>
          {isReconnecting && (
            <ChatAlert
              status='warning'
              title='Reconnecting'
              message='Connection lost. Attempting to reconnect...'
            />
          )}
          {error && (
            <ChatAlert
              status='danger'
              title='Error'
              message={error}
              onDismiss={onDismissError}
            />
          )}
          {maxRoundsReached && (
            <ChatAlert
              status='warning'
              title='Tool limit reached'
              message='The assistant reached the maximum number of tool execution rounds. You can increase this limit in Settings > Agent.'
              onDismiss={onDismissMaxRoundsReached}
            />
          )}
          <TitleBarView title={title} vscodeUrl={vscodeUrl} />
          <ScrollShadow className={styles.messageListWrapper} ref={scrollRef}>
            {!sessionId && (
              <div className={styles.emptyState}>
                <p className={styles.emptyHint}>
                  Select a session, or click + on a workspace to start a new
                  task.
                </p>
              </div>
            )}
            <StreamingMessageDisplay
              eventBus={eventBus}
              onAskUserSubmit={onAskUserSubmit}
              onMessagesChange={onMessagesChange}
            />
          </ScrollShadow>
          {sessionId && <BottomBar />}
          {sessionId && (
            <ChatInput
              isStreaming={isStreaming}
              onSend={(content) => {
                void onSend(content);
              }}
              onStop={onStop}
            />
          )}
        </div>
      </div>
      <NewSessionModal
        workspace={newSessionWorkspace}
        onClose={onCloseNewSession}
        onSubmit={onSubmitNewSession}
      />
    </div>
  );
}
```

- [ ] **Step 2: Replace `CodingPageContent` in `CodingPage.tsx`**

Replace the `CodingPageContent` function (keep the `CodingPage` wrapper above it unchanged) with:

```tsx
/** Inner content that uses contexts. */
function CodingPageContent() {
  const eventBus = useChatEventBus();

  const {
    sessionId,
    createNewSessionIdError,
    createNewSessionId,
    clearCreateNewSessionIdError,
  } = useSessionId();

  const handleAskUserSubmit = useAskUserSubmit();

  const {onMessagesChange} = useMessageCount();
  const {title} = useSessionTitle();

  const {selectedWorkspace, setSelectedWorkspace} = useSessionConfig();

  const [newSessionWorkspace, setNewSessionWorkspace] = useState<string | null>(
    null,
  );

  const {
    available: vscodeAvailable,
    port: vscodePort,
    connectionToken: vscodeToken,
  } = useVscodeStatus();

  const vscodeUrl = useMemo(() => {
    if (
      sessionId === null ||
      !vscodeAvailable ||
      selectedWorkspace === undefined
    ) {
      return null;
    }
    return getVscodeUrl(vscodePort, vscodeToken, selectedWorkspace);
  }, [sessionId, vscodeAvailable, vscodePort, vscodeToken, selectedWorkspace]);

  const {
    isStreaming,
    isReconnecting,
    streamError,
    maxRoundsReached,
    sendMessage,
    sendMessageToNewSession,
    stopGeneration,
    clearStreamError,
    clearMaxRoundsReached,
  } = useStreamChat({sessionId, createNewSessionId});

  const {containerRef: scrollRef, scrollToBottom} = useAutoScroll();

  const handleRequestNewSession = useCallback(
    (workspacePath: string) => {
      setSelectedWorkspace(workspacePath);
      setNewSessionWorkspace(workspacePath);
    },
    [setSelectedWorkspace],
  );

  const handleCloseNewSession = useCallback(() => {
    setNewSessionWorkspace(null);
  }, []);

  const handleSubmitNewSession = useCallback(
    async (task: string) => {
      if (newSessionWorkspace === null) {
        return;
      }
      setNewSessionWorkspace(null);
      await sendMessageToNewSession(task, {workspace: newSessionWorkspace});
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    },
    [newSessionWorkspace, sendMessageToNewSession, scrollToBottom],
  );

  const handleSend = useCallback(
    async (content: string) => {
      await sendMessage(content);
      requestAnimationFrame(() => {
        scrollToBottom();
      });
    },
    [sendMessage, scrollToBottom],
  );

  const displayError = createNewSessionIdError ?? streamError;

  const dismissError = useCallback(() => {
    clearCreateNewSessionIdError();
    clearStreamError();
  }, [clearCreateNewSessionIdError, clearStreamError]);

  return (
    <CodingPageView
      title={title}
      eventBus={eventBus}
      isStreaming={isStreaming}
      isReconnecting={isReconnecting}
      error={displayError}
      maxRoundsReached={maxRoundsReached}
      scrollRef={scrollRef}
      sessionId={sessionId}
      onAskUserSubmit={handleAskUserSubmit}
      onMessagesChange={onMessagesChange}
      onSend={handleSend}
      onStop={stopGeneration}
      onRequestNewSession={handleRequestNewSession}
      newSessionWorkspace={newSessionWorkspace}
      onCloseNewSession={handleCloseNewSession}
      onSubmitNewSession={handleSubmitNewSession}
      vscodeUrl={vscodeUrl}
      onDismissError={dismissError}
      onDismissMaxRoundsReached={clearMaxRoundsReached}
    />
  );
}
```

Update the imports at the top of `CodingPage.tsx`: ensure `useCallback`, `useMemo`, and `useState` are imported from `react` (add `useState`). The `@/modules/chat-session` named imports stay the same (they already include `useSessionConfig`, `useMessageCount`, etc.).

- [ ] **Step 3: Add the empty-hint style**

Append to `apps/frontend/src/pages/coding/styles.module.css`:

```css
.emptyHint {
  margin: 0;
  max-width: 32rem;
  text-align: center;
  color: var(--muted);
  font-size: 0.9rem;
}
```

- [ ] **Step 4: Delete `TaskDispatchCard`**

```bash
git rm -r apps/frontend/src/pages/coding/components/TaskDispatchCard
```

- [ ] **Step 5: Typecheck, lint, and run the full frontend test suite**

Run: `bun run typecheck:all`
Expected: no errors (no remaining references to `TaskDispatchCard`, `onStartTask`, `newSessionDisabled`, or the old session list).
Run: `bun run lint:all`
Expected: no errors.
Run: `bun run --filter '*' --if-present test`
Expected: all suites PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/coding
git commit -m "feat(frontend): switch Coding page to workspace-grouped sidebar + modal

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Final verification

- [ ] Run `bun run lint:all`, `bun run typecheck:all`, and `bun run --filter '*' --if-present test` — all green.
- [ ] Run `bun dev` from the repo root; in the browser verify in **both** light and dark themes:
  - Coding sidebar shows one collapsible group per configured workspace; the active session's group is expanded and highlighted.
  - The `+` on a workspace opens the modal; submitting starts a session in that workspace and navigates to it; the new session appears under its group.
  - An empty workspace shows "No sessions yet"; an orphan session (remove a workspace in Settings → Coding → Workspaces that has a session) appears under "Ungrouped" with no `+`.
  - The TitleBar has no new-session button on Coding; the empty main pane shows the placeholder.
  - "Manage workspaces…" navigates to Settings → Coding → Workspaces.
  - Settings shows a "Coding" group containing "Coding Agent" and "Workspaces"; the Chat page session list is unchanged.
- [ ] Capture screenshots of the Coding sidebar (both themes) and the modal for the PR description.

---
