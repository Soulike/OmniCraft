# Server Restart Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When the backend restarts while a client tool (`ask_user`) is pending, recover cleanly — roll the interrupted turn back to the last completed-turn checkpoint and have the frontend reload from the start instead of hanging.

**Architecture:** Best-effort "heal backward." (1) Make `snapshot.json` a healthy-checkpoint invariant by removing the one mid-turn snapshot persist (title generation), so a loaded snapshot never contains a dangling `ask_user` `tool_use`. (2) Detect a resume cursor that outran the (rolled-back) SSE log — `from > agent.getSseEventCount()` — and answer the events request with **409** instead of opening a stream that blocks forever. (3) On 409 the shared frontend stream hook discards its view and replays from index 0.

**Design refinement vs. spec:** the spec placed the stale check inside `service.subscribe` as a discriminated result. To respect the repo's Dispatcher → Service layering (a service may not import from `dispatcher/`), the check instead lives in the **router**, using a new thin `service.getSseEventCount(id)` and a shared pure helper in `dispatcher/helpers/cursor.ts`. Behavior and the 409 contract are identical.

**Tech Stack:** Node.js + Koa (backend), React + Vite (frontend), Vitest (both), PNPM workspace.

## Global Constraints

- Package manager is PNPM. Backend package: `@omnicraft/backend`. Frontend package: `@omnicraft/frontend`.
- Backend: no default exports; relative imports use `.js` extension; `@/*` alias for cross-module imports; no `console` (use `logger`); kebab-case filenames; Conventional Commits.
- Backend layering is strict and downward-only: Dispatcher → Service → Model/API. Never import upward.
- Frontend: one React component per file; non-hook helpers live in a `helpers/` subfolder; no default exports; CSS Modules only (no Tailwind in our components).
- Do not hand-edit dependency versions; only `pnpm add`. (No new dependencies are needed for this plan.)
- After the pre-commit hook formats/lints, do not re-run compile/test solely because of formatting.

---

### Task 1: Snapshot is a healthy checkpoint — remove the mid-turn title persist

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts` (method `generateAndEmitTitle`, ~lines 349-361)
- Test: `apps/backend/src/agent-core/agent/agent.test.ts` (add a test + one import)

**Interfaces:**

- Consumes: existing `Agent`, `agentPersistence.persistSnapshot`, `llmApi.streamCompletion` mock harness already in `agent.test.ts`.
- Produces: no signature changes. Behavioral guarantee: `generateAndEmitTitle` emits `session-title` and updates `this.title` but performs **no** snapshot persist.

- [ ] **Step 1: Add the `agentPersistence` import to the test file**

In `apps/backend/src/agent-core/agent/agent.test.ts`, add this import alongside the other local imports (e.g., just after the `./agent.js` import line):

```ts
import {agentPersistence} from './persistence/agent-persistence.js';
```

- [ ] **Step 2: Write the failing test**

Add this test inside the existing `describe('Agent title generation', ...)` block in `apps/backend/src/agent-core/agent/agent.test.ts`:

```ts
it('does not persist a mid-turn snapshot during title generation', async () => {
  const tmpSessionsDir = mkdtempSync(path.join(os.tmpdir(), 'agent-sessions-'));
  tmpDirsToCleanup.add(tmpSessionsDir);

  let releaseMain!: () => void;
  const mainBlocker = new Promise<void>((resolve) => {
    releaseMain = resolve;
  });
  async function* blockingMainStream(): LlmEventStream {
    yield {type: 'message-start', messageId: 'assistant-message'};
    yield {type: 'text-delta', content: 'thinking'};
    await mainBlocker;
    yield {
      type: 'message-end',
      stopReason: 'end_turn',
      usage: {inputTokens: 1, outputTokens: 1, cacheReadInputTokens: 0},
    };
  }

  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion').mockImplementation((options) =>
    options.config.model === LIGHT_CONFIG.model
      ? titleCompletionStream()
      : blockingMainStream(),
  );

  const persistSpy = vi.spyOn(agentPersistence, 'persistSnapshot');

  const agent = new TestAgent(() => Promise.resolve(MAIN_CONFIG), {
    ...testAgentOptions(),
    sessionsDir: tmpSessionsDir,
  });
  // Ignore the synchronous construction persist; only mid-turn persists matter.
  persistSpy.mockClear();

  const controller = new AbortController();
  agent.enqueueUserTurn('Please help me rename a component');
  for await (const entry of agent.subscribe({signal: controller.signal})) {
    if (entry.event.type === 'session-title') {
      controller.abort();
      break;
    }
  }

  // The main turn is still blocked, so the only thing that could persist here
  // is the title path. Give any such persist time to settle, then assert none.
  await delay(20);
  expect(persistSpy).not.toHaveBeenCalled();

  // Releasing the main stream lets the turn reach its end, which DOES persist.
  releaseMain();
  while (agent.isRunning) {
    await delay(0);
  }
  expect(persistSpy).toHaveBeenCalled();
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts -t "does not persist a mid-turn snapshot"`
Expected: FAIL — `expected "persistSnapshot" to not be called, but it was called` (title generation still persists mid-turn).

- [ ] **Step 4: Remove the mid-turn persist**

In `apps/backend/src/agent-core/agent/agent.ts`, edit `generateAndEmitTitle` to delete the trailing persist. The method becomes exactly:

```ts
  private async generateAndEmitTitle(userMessage: string): Promise<void> {
    this.title = await generateTitle(userMessage, () =>
      this.resolveTierConfig('lightweight'),
    );
    if (!this.title) return;
    await this.appendSseEvent({
      type: 'session-title',
      title: this.title,
    } satisfies SseSessionTitleEvent);
  }
```

(Only the `await this.persistSnapshot().catch(...)` block is removed. `persistSnapshot` remains used by `runTurn`; `logger` remains used elsewhere.)

- [ ] **Step 5: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts -t "does not persist a mid-turn snapshot"`
Expected: PASS.

- [ ] **Step 6: Run the full agent test file to confirm no regressions**

Run: `pnpm --filter @omnicraft/backend test src/agent-core/agent/agent.test.ts`
Expected: PASS (including the existing "emits the first session title…" test — the `session-title` event is unchanged).

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "fix(agent): stop persisting mid-turn snapshot during title generation

Snapshot is now only persisted at construction or turn end, so a loaded
snapshot never carries a dangling ask_user tool_use — a prerequisite for
best-effort restart recovery."
```

---

### Task 2: `isCursorAheadOfLog` pure helper

**Files:**

- Modify: `apps/backend/src/dispatcher/helpers/cursor.ts`
- Test: `apps/backend/src/dispatcher/helpers/cursor.test.ts`

**Interfaces:**

- Produces: `isCursorAheadOfLog(startIndex: number, committedCount: number): boolean` — true iff `startIndex > committedCount`. Consumed by both events routers in Task 3.

- [ ] **Step 1: Write the failing test**

Append to `apps/backend/src/dispatcher/helpers/cursor.test.ts` (add `isCursorAheadOfLog` to the existing import from `./cursor.js`):

```ts
describe('isCursorAheadOfLog', () => {
  it('is false when the cursor is within the committed log', () => {
    expect(isCursorAheadOfLog(3, 5)).toBe(false);
  });

  it('is false when the cursor is exactly caught up', () => {
    expect(isCursorAheadOfLog(5, 5)).toBe(false);
  });

  it('is true when the cursor is beyond the committed log', () => {
    expect(isCursorAheadOfLog(6, 5)).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/backend test src/dispatcher/helpers/cursor.test.ts -t "isCursorAheadOfLog"`
Expected: FAIL with "isCursorAheadOfLog is not a function" / import error.

- [ ] **Step 3: Implement the helper**

Append to `apps/backend/src/dispatcher/helpers/cursor.ts`:

```ts
/**
 * Whether a resume cursor points beyond the committed event count.
 *
 * What it does: reports if `startIndex` is past the last event the log
 * actually contains.
 *
 * When to use it: at reconnect, to tell a client its cursor is stale — the
 * server rolled its log back beneath it (e.g. after a restart) — rather than
 * opening an SSE stream that would block forever on an idle agent.
 */
export function isCursorAheadOfLog(
  startIndex: number,
  committedCount: number,
): boolean {
  return startIndex > committedCount;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/backend test src/dispatcher/helpers/cursor.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/dispatcher/helpers/cursor.ts apps/backend/src/dispatcher/helpers/cursor.test.ts
git commit -m "feat(dispatcher): add isCursorAheadOfLog stale-cursor helper"
```

---

### Task 3: Backend wiring — expose event count and return 409 for a stale cursor

**Files:**

- Modify: `apps/backend/src/services/chat-agent-session/chat-agent-session-service.ts`
- Modify: `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts`
- Modify: `apps/backend/src/dispatcher/chat-agent-session/router.ts` (handler for `SESSION_EVENTS`, ~lines 109-148)
- Modify: `apps/backend/src/dispatcher/coding-agent-session/router.ts` (handler for `SESSION_EVENTS`, ~lines 110-150)

**Interfaces:**

- Consumes: `isCursorAheadOfLog` (Task 2); `agent.getSseEventCount(): number` (existing, `agent.ts:160`).
- Produces on each service: `getSseEventCount(agentId: string): Promise<number | undefined>` — the agent's committed SSE event count, or `undefined` if the session is not found.
- Behavior: `GET …/events?from=N` returns **409** with body `{error: 'cursor_ahead_of_log', committedCount}` when `N > committedCount`; unchanged otherwise.

This task has no unit-test harness (the services depend on a singleton store with disk I/O, and there is no HTTP integration harness in this repo). Its decision logic is already unit-tested in Task 2; the wiring is verified by typecheck, lint, and a concrete manual `curl` check in Step 6.

- [ ] **Step 1: Add `getSseEventCount` to the chat service**

In `apps/backend/src/services/chat-agent-session/chat-agent-session-service.ts`, add this method to the `chatAgentSessionService` object (place it directly after `subscribe`):

```ts
  /**
   * Returns the agent's committed SSE event count, or undefined if the session
   * does not exist. Used to detect a resume cursor that outran a rolled-back log.
   */
  async getSseEventCount(agentId: string): Promise<number | undefined> {
    const agent = await MainAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.getSseEventCount();
  },
```

- [ ] **Step 2: Add `getSseEventCount` to the coding service**

In `apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts`, add the same method to `codingAgentSessionService` (directly after `subscribe`), using `CodingAgentStore`:

```ts
  /**
   * Returns the agent's committed SSE event count, or undefined if the session
   * does not exist. Used to detect a resume cursor that outran a rolled-back log.
   */
  async getSseEventCount(agentId: string): Promise<number | undefined> {
    const agent = await CodingAgentStore.getInstance().get(agentId);
    if (!agent) return undefined;
    return agent.getSseEventCount();
  },
```

- [ ] **Step 3: Return 409 in the chat events route**

In `apps/backend/src/dispatcher/chat-agent-session/router.ts`, add to the imports:

```ts
import {parseSseResumeCursor, isCursorAheadOfLog} from '../helpers/cursor.js';
```

(Replace the existing `import {parseSseResumeCursor} from '../helpers/cursor.js';` line.)

Then, in the `router.get(SESSION_EVENTS, …)` handler, insert the stale-cursor check **after** the `from` is parsed and **before** the `abortController` is created. The handler body from the cursor parse onward becomes:

```ts
let from: number;
try {
  from = parseSseResumeCursor(ctx.query.from);
} catch (e) {
  ctx.response.status = StatusCodes.BAD_REQUEST;
  ctx.response.body = {
    error: e instanceof Error ? e.message : 'Invalid SSE resume cursor',
  };
  return;
}

const committedCount = await chatAgentSessionService.getSseEventCount(id);
if (committedCount === undefined) {
  ctx.response.status = StatusCodes.NOT_FOUND;
  ctx.response.body = {error: `Session not found: ${id}`};
  return;
}
if (isCursorAheadOfLog(from, committedCount)) {
  ctx.response.status = StatusCodes.CONFLICT;
  ctx.response.body = {error: 'cursor_ahead_of_log', committedCount};
  return;
}

const abortController = new AbortController();
const eventStream = await chatAgentSessionService.subscribe(id, {
  startIndex: from,
  signal: abortController.signal,
});
if (!eventStream) {
  ctx.response.status = StatusCodes.NOT_FOUND;
  ctx.response.body = {error: `Session not found: ${id}`};
  return;
}

ctx.response.type = 'text/event-stream';
ctx.response.set('Cache-Control', 'no-cache');
ctx.response.set('Connection', 'keep-alive');
ctx.response.set('X-Accel-Buffering', 'no');

const stream = new PassThrough();
ctx.body = stream;

void pumpSseEvents(stream, eventStream, ctx.req, abortController);
```

- [ ] **Step 4: Return 409 in the coding events route**

Apply the identical change to `apps/backend/src/dispatcher/coding-agent-session/router.ts`: update the cursor import to also import `isCursorAheadOfLog`, and insert the same `committedCount` / `isCursorAheadOfLog` block after the `from` parse and before `new AbortController()`, using `codingAgentSessionService.getSseEventCount(id)` and `codingAgentSessionService.subscribe(...)`.

- [ ] **Step 5: Typecheck and lint the backend**

Run: `pnpm --filter @omnicraft/backend typecheck && pnpm --filter @omnicraft/backend lint`
Expected: both pass (no type errors; `StatusCodes.CONFLICT` resolves; no upward imports).

- [ ] **Step 6: Manual verification of the 409 path**

Start the dev server from the repo root: `pnpm dev`. Then create a session and request its events with a far-future cursor:

```bash
# Create a chat session (returns {"sessionId": "..."})
SID=$(curl -s -X POST http://localhost:5173/api/chat/session \
  -H 'Content-Type: application/json' -d '{}' | sed -E 's/.*"sessionId":"([^"]+)".*/\1/')

# A cursor far beyond the log must yield HTTP 409 with committedCount.
curl -s -i "http://localhost:5173/api/chat/session/$SID/events?from=999999" | head -n 20

# A cursor within the log (0) must open the SSE stream (HTTP 200, text/event-stream).
curl -s -i "http://localhost:5173/api/chat/session/$SID/events?from=0" --max-time 2 | head -n 10
```

Expected: the `from=999999` request returns `HTTP/1.1 409 Conflict` with a JSON body containing `"error":"cursor_ahead_of_log"`; the `from=0` request returns `200` with `content-type: text/event-stream`. (Ports come from `pnpm dev`; adjust if it prints different ones.)

- [ ] **Step 7: Commit**

```bash
git add apps/backend/src/services/chat-agent-session/chat-agent-session-service.ts \
        apps/backend/src/services/coding-agent-session/coding-agent-session-service.ts \
        apps/backend/src/dispatcher/chat-agent-session/router.ts \
        apps/backend/src/dispatcher/coding-agent-session/router.ts
git commit -m "feat(dispatcher): return 409 when an SSE resume cursor outran the log"
```

---

### Task 4: Frontend — reload from index 0 on a 409 stale cursor

**Files:**

- Create: `apps/frontend/src/modules/chat-session/helpers/is-stale-cursor-error.ts`
- Test: `apps/frontend/src/modules/chat-session/helpers/is-stale-cursor-error.test.ts`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`

**Interfaces:**

- Consumes: `HttpError` (`@/api/helpers/http-error.js`, has `.status`); the shared `reset-session` event on the chat event bus (already clears messages, tool output, usage, title, and this hook's streaming flags).
- Produces: `isStaleCursorError(e: unknown): boolean` — true iff `e` is an `HttpError` with status 409.

- [ ] **Step 1: Write the failing helper test**

Create `apps/frontend/src/modules/chat-session/helpers/is-stale-cursor-error.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {HttpError} from '@/api/helpers/http-error.js';

import {isStaleCursorError} from './is-stale-cursor-error.js';

describe('isStaleCursorError', () => {
  it('is true for an HttpError with status 409', () => {
    expect(isStaleCursorError(new HttpError(409, 'cursor_ahead_of_log'))).toBe(
      true,
    );
  });

  it('is false for other HttpError statuses', () => {
    expect(isStaleCursorError(new HttpError(500, 'server error'))).toBe(false);
    expect(isStaleCursorError(new HttpError(404, 'not found'))).toBe(false);
  });

  it('is false for non-HttpError values', () => {
    expect(isStaleCursorError(new TypeError('network'))).toBe(false);
    expect(isStaleCursorError(undefined)).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/frontend test src/modules/chat-session/helpers/is-stale-cursor-error.test.ts`
Expected: FAIL — module `./is-stale-cursor-error.js` does not exist.

- [ ] **Step 3: Implement the helper**

Create `apps/frontend/src/modules/chat-session/helpers/is-stale-cursor-error.ts`:

```ts
import {HttpError} from '@/api/helpers/http-error.js';

/**
 * Whether an events-subscription error means the resume cursor is stale.
 *
 * The backend answers `GET …/events?from=N` with HTTP 409 when `N` is past the
 * end of its (rolled-back) log — e.g. after a restart interrupted a turn. The
 * client must then discard its view and replay from index 0.
 */
export function isStaleCursorError(e: unknown): boolean {
  return e instanceof HttpError && e.status === 409;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/frontend test src/modules/chat-session/helpers/is-stale-cursor-error.test.ts`
Expected: PASS.

- [ ] **Step 5: Add a `resetView` effect event to the stream hook**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, add the import (next to the other `../helpers/...` imports):

```ts
import {isStaleCursorError} from '../helpers/is-stale-cursor-error.js';
```

Then, immediately after the `dispatchStreamEvent` `useEffectEvent` definition (before the persistent-SSE `useEffect`), add:

```ts
// Clears all session-scoped view state via the shared reset broadcast.
// Read through useEffectEvent so it always targets the latest event bus.
const resetView = useEffectEvent(() => {
  eventBus.emit('reset-session');
});
```

- [ ] **Step 6: Handle the 409 in the consume loop**

In the same file, in the `consume()` function's `catch (e: unknown)` block, add the stale-cursor branch right after the `AbortError` guard. The catch block becomes:

```ts
        } catch (e: unknown) {
          if (e instanceof DOMException && e.name === 'AbortError') return;

          if (isStaleCursorError(e)) {
            // The server rolled its event log back beneath our cursor (e.g. it
            // restarted mid-turn). Discard the local view and replay from the
            // start. Not a failure — reconnect immediately without backoff.
            resetView();
            lastIndex = 0;
            consecutiveFailures = 0;
            setIsReconnecting(false);
            continue;
          }

          if (!isRetriableError(e)) {
            const message =
              e instanceof Error ? e.message : 'An unexpected error occurred';
            setIsReconnecting(false);
            setStreamError(message);
            return;
          }
          // Retriable (network error / 5xx) → fall through to retry.
        }
```

- [ ] **Step 7: Typecheck, lint, and run the frontend tests**

Run: `pnpm --filter @omnicraft/frontend typecheck && pnpm --filter @omnicraft/frontend lint && pnpm --filter @omnicraft/frontend test src/modules/chat-session`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/helpers/is-stale-cursor-error.ts \
        apps/frontend/src/modules/chat-session/helpers/is-stale-cursor-error.test.ts \
        apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts
git commit -m "feat(frontend): reload session from start on a 409 stale cursor"
```

---

### Task 5: End-to-end verification (restart during `ask_user`)

**Files:** none (verification only).

- [ ] **Step 1: Start the app**

From the repo root: `pnpm dev`. Open the app in a browser (use the port `pnpm dev` prints).

- [ ] **Step 2: Trigger an `ask_user` card**

Start a new chat session and send a deliberately ambiguous request that forces the model to ask for clarification (e.g., "Rename the thing in my project" with no other context). Wait until an **Ask User** question card renders and is awaiting input. Do not answer it.

- [ ] **Step 3: Restart the backend mid-question**

Stop and restart the backend (`pnpm dev` restarts on save; alternatively kill and relaunch the backend process). Watch the frontend.

- [ ] **Step 4: Confirm recovery**

Expected: the frontend briefly reconnects, then the view reloads to the session's last completed turn — the `ask_user` card is gone, there is **no** stuck/hanging card, and the message input is usable. Sending a new message works and the agent responds (no provider error from a dangling tool call).

- [ ] **Step 5: Confirm both themes**

Repeat Step 2–4 (or just re-open the recovered session) in both light and dark themes; confirm the recovered view renders correctly in each, per the frontend UI-validation requirement.

- [ ] **Step 6: Full test sweep and final commit (if any residual changes)**

Run: `pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/frontend test`
Expected: PASS. If verification surfaced no code changes, there is nothing to commit; otherwise commit fixes with a `fix(...)` message.

---

## Self-Review

**Spec coverage:**

- "Snapshot is a healthy checkpoint" / remove mid-turn title persist → Task 1. ✓
- Stale detection `from > getSseEventCount()` → Task 2 (helper) + Task 3 (wiring). ✓
- 409 from both events routes (chat + coding) → Task 3. ✓
- Frontend full reload from 0 via `reset-session` → Task 4. ✓
- Coding-agent parity → Task 3 (both services + routers), Task 4 (shared hook covers both), Task 1 (shared `agent-core`). ✓
- Non-goals (no resume; interrupted turn dropped) → respected; no resume machinery added. ✓
- Testing plan (backend stale unit, frontend 409 unit, manual both-theme e2e) → Tasks 2, 4, 5. ✓
- Edge case `submitToolResponse` 404 race → no code change per spec; card self-resets and is removed on reload. Documented in spec; no task required. ✓

**Placeholder scan:** No TBD/TODO; every code step contains complete code; every command has an expected result. ✓

**Type consistency:** `isCursorAheadOfLog(startIndex, committedCount)` defined in Task 2, consumed identically in Task 3. `getSseEventCount(agentId): Promise<number | undefined>` defined and consumed with matching `undefined`-means-404 handling. `isStaleCursorError(e: unknown): boolean` defined in Task 4 Step 3, consumed in Step 6. `agent.getSseEventCount(): number` is the existing method. ✓

**Layering note:** the stale check lives in the router (Dispatcher), not the service, so no Service → Dispatcher import is introduced. ✓
