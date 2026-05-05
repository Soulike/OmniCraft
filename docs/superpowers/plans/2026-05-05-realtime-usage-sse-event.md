# Real-time Usage SSE Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the `usage` field on the `done` SSE event with a standalone `usage-update` SSE event, so the frontend usage display updates in real-time during long multi-round agent turns instead of only after the entire turn (and post-turn compaction) finishes.

**Architecture:** Backend `Agent.runAgentLoop` already calls `await this.buildSseUsage()` once at the end of each turn. Move that call into the loop so it fires after every `consumeStream` round (each LLM call), and once more after `compactAfterTurn` runs. Strip `usage` off `SseDoneEvent` entirely — `done` becomes a pure terminal signal. Frontend `useUsage` hook subscribes to `usage-update` instead of `done`.

**Tech Stack:** Bun monorepo. Backend: Koa + Anthropic SDK + zod schemas in `packages/sse-events`. Frontend: React + Vite + Vitest. SSE event union is a zod `discriminatedUnion`, so adding a variant updates both backend emit-side and frontend parse-side type-safely.

---

## File Structure

**Schema package (`packages/sse-events/src/`):**

- `schema.ts` — drop `usage` from `sseDoneEventSchema`; add `sseUsageUpdateEventSchema`; register in `sseEventSchema` and `sseBaseEventSchema` discriminated unions
- `index.ts` — re-export new type and schema

**Backend (`apps/backend/src/agent-core/agent/`):**

- `agent.ts` — emit `usage-update` after each LLM round in `runAgentLoop`; emit a final one in `emitDoneAfterTurn` after compaction; remove `usage` from the `done` payload
- `agent.test.ts` — update existing usage-reporting tests to assert on `usage-update` events instead of the `done` payload
- `events/agent-sse-log.test.ts` — update `done()` test helper (drop `usage`)

**Frontend (`apps/frontend/src/modules/chat-session/`):**

- `components/StreamingMessageDisplay/types.ts` — change `done` ChatEventMap entry payload (drop usage), add `'usage-update'` entry
- `helpers/route-base-event-to-bus.ts` — add `case 'usage-update'`
- `hooks/useStreamChat.ts` — add `case 'usage-update'` to the SSE event switch
- `components/UsageInfo/hooks/useUsage.ts` — listen on `'usage-update'` instead of `'done'`

**Note on the SSE replay log:** We deliberately do NOT add a compressor merge rule for `usage-update`. Per design discussion, consecutive `usage-update` events are rare (only the final post-LLM + post-compaction pair), so the model stays simple.

**Note on backward compatibility:** This is a breaking SSE schema change. There is no version negotiation — the assumption is the frontend ships with the backend in this monorepo. Old persisted session logs (`agent-sse-log` files on disk) that contain `done.usage` payloads will fail `sseEventSchema` validation on replay. We're accepting that — old sessions just lose their final usage count. Document this in the commit body.

---

## Task 1: Add `usage-update` SSE event schema

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `packages/sse-events/src/index.ts`

- [ ] **Step 1: Drop `usage` from `sseDoneEventSchema` and add `sseUsageUpdateEventSchema`**

In `packages/sse-events/src/schema.ts`, replace the `sseDoneEventSchema` block (current lines 68-74) with:

```typescript
/** Stream completed. Reason indicates whether it finished normally or was capped. */
export const sseDoneEventSchema = z.object({
  type: z.literal('done'),
  reason: z.enum(['complete', 'max_rounds_reached', 'aborted']),
});
export type SseDoneEvent = z.infer<typeof sseDoneEventSchema>;

/** Real-time token usage update. Emitted after each LLM call and after
 *  post-turn compaction. The latest event always carries the current totals. */
export const sseUsageUpdateEventSchema = z.object({
  type: z.literal('usage-update'),
  usage: sseUsageSchema,
});
export type SseUsageUpdateEvent = z.infer<typeof sseUsageUpdateEventSchema>;
```

- [ ] **Step 2: Register the new event in both discriminated unions**

In the same file, find `sseBaseEventSchema` (currently around line 143) and add `sseUsageUpdateEventSchema` to its array. Then find `sseEventSchema` (currently around line 204) and add `sseUsageUpdateEventSchema` to its array too. Final shape of each:

```typescript
export const sseBaseEventSchema = z.discriminatedUnion('type', [
  sseMessageStartEventSchema,
  sseTextDeltaEventSchema,
  sseThinkingStartEventSchema,
  sseThinkingDeltaEventSchema,
  sseThinkingEndEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteDeltaEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
  sseUsageUpdateEventSchema,
]);
```

```typescript
export const sseEventSchema = z.discriminatedUnion('type', [
  sseMessageStartEventSchema,
  sseTextDeltaEventSchema,
  sseThinkingStartEventSchema,
  sseThinkingDeltaEventSchema,
  sseThinkingEndEventSchema,
  sseToolExecuteStartEventSchema,
  sseToolExecuteDeltaEventSchema,
  sseToolExecuteEndEventSchema,
  sseDoneEventSchema,
  sseUsageUpdateEventSchema,
  sseErrorEventSchema,
  sseSessionTitleEventSchema,
  sseSubagentDispatchEventSchema,
  sseSubagentOutputEventSchema,
  sseSubagentCompleteEventSchema,
  sseTodoUpdateEventSchema,
]);
```

- [ ] **Step 3: Re-export type and schema from package index**

In `packages/sse-events/src/index.ts`, add `SseUsageUpdateEvent` to the type exports (alphabetical — between `SseTodoUpdateEvent` and `SseToolExecuteDeltaEvent`) and `sseUsageUpdateEventSchema` to the schema exports (between `sseTodoUpdateEventSchema` and `sseToolExecuteDeltaEventSchema`).

- [ ] **Step 4: Typecheck the schema package**

Run: `bun run --filter '@omnicraft/sse-events' typecheck`
Expected: PASS, no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/sse-events/
git commit -m "feat(sse-events): add usage-update event, drop usage from done"
```

---

## Task 2: Update agent to emit `usage-update` events

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`

- [ ] **Step 1: Import `SseUsageUpdateEvent`**

In `apps/backend/src/agent-core/agent/agent.ts`, add `SseUsageUpdateEvent` to the import from `@omnicraft/sse-events` (alphabetically between `SseToolExecuteStartEvent` and `SseUsage`):

```typescript
import type {
  SseDoneEvent,
  SseEvent,
  SseEventCursorEntry,
  SseMessageStartEvent,
  SseSessionTitleEvent,
  SseSubAgentEvent,
  SseTextDeltaEvent,
  SseThinkingDeltaEvent,
  SseThinkingEndEvent,
  SseThinkingStartEvent,
  SseTodoUpdateEvent,
  SseToolExecuteDeltaEvent,
  SseToolExecuteEndEvent,
  SseToolExecuteStartEvent,
  SseUsage,
  SseUsageUpdateEvent,
} from '@omnicraft/sse-events';
```

- [ ] **Step 2: Add a private helper to build a `usage-update` event**

In `apps/backend/src/agent-core/agent/agent.ts`, just below the existing `buildSseUsage()` method (around line 540-550), add:

```typescript
  /** Builds a real-time `usage-update` SSE event with the latest token totals. */
  private async buildUsageUpdateEvent(): Promise<SseUsageUpdateEvent> {
    return {
      type: 'usage-update',
      usage: await this.buildSseUsage(),
    };
  }
```

- [ ] **Step 3: Drop `usage` from the `done` event payload**

In the same file, replace the `emitDoneAfterTurn` method body. Find:

```typescript
  private async *emitDoneAfterTurn(
    reason: SseDoneEvent['reason'],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
  ): AgentEventStream {
    await this.compactAfterTurn(tools, systemPrompt, thinkingLevel);
    yield {
      type: 'done',
      reason,
      usage: await this.buildSseUsage(),
    } satisfies SseDoneEvent;
  }
```

Replace with:

```typescript
  private async *emitDoneAfterTurn(
    reason: SseDoneEvent['reason'],
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
  ): AgentEventStream {
    await this.compactAfterTurn(tools, systemPrompt, thinkingLevel);
    yield await this.buildUsageUpdateEvent();
    yield {type: 'done', reason} satisfies SseDoneEvent;
  }
```

- [ ] **Step 4: Emit `usage-update` after each LLM round inside `runAgentLoop`**

Two emit points in `runAgentLoop`:

(a) After the initial `consumeStream(userStream)` (currently line 388), add a usage-update emit. Find:

```typescript
    let toolCalls = yield* this.consumeStream(userStream);

    let round = 0;
    while (toolCalls.length > 0) {
```

Replace with:

```typescript
    let toolCalls = yield* this.consumeStream(userStream);
    yield await this.buildUsageUpdateEvent();

    let round = 0;
    while (toolCalls.length > 0) {
```

(b) After the `consumeStream(this.llmSession.submitToolResults(...))` at the end of each loop iteration (currently lines 517-525), add a usage-update emit. Find:

```typescript
      toolCalls = yield* this.consumeStream(
        this.llmSession.submitToolResults(
          orderedResults,
          toolDefs,
          systemPrompt,
          thinkingLevel,
          signal,
        ),
      );
    }

    yield* this.emitDoneAfterTurn(
```

Replace with:

```typescript
      toolCalls = yield* this.consumeStream(
        this.llmSession.submitToolResults(
          orderedResults,
          toolDefs,
          systemPrompt,
          thinkingLevel,
          signal,
        ),
      );
      yield await this.buildUsageUpdateEvent();
    }

    yield* this.emitDoneAfterTurn(
```

- [ ] **Step 5: Typecheck the backend**

Run: `bun run --filter '@omnicraft/backend' typecheck`
Expected: PASS. (The `done.usage` removal will surface in `agent.test.ts` and `agent-sse-log.test.ts` only as test failures, not type errors, because the test fixtures construct extra fields they don't need.) If the typecheck flags `usage` on object literals as excess properties, that's the actual error to fix in the next task.

Do NOT commit yet — tests are still expecting the old shape and will fail.

---

## Task 3: Update agent test fixtures and assertions

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
- Modify: `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts`

- [ ] **Step 1: Update the `done` helper in `agent-sse-log.test.ts`**

In `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts`, replace the `done()` helper (currently lines 41-55) with:

```typescript
function done(): SseDoneEvent {
  return {
    type: 'done',
    reason: 'complete',
  };
}
```

Then remove the now-unused `SseUsage` import if it was being pulled in just for this helper (check the import block at the top — only remove names that are no longer referenced).

- [ ] **Step 2: Run the sse-log test file to confirm it still passes**

Run: `bun run --filter '@omnicraft/backend' test -- agent-sse-log`
Expected: PASS.

- [ ] **Step 3: Update `agent.test.ts` — first session-title test**

In `apps/backend/src/agent-core/agent/agent.test.ts`, the test "emits the first session title after the first user message starts" currently asserts on `events[doneIndex]` with `usage: {thinkingLevel: 'high'}`. Find (around lines 178-182):

```typescript
expect(events[doneIndex]).toMatchObject({
  type: 'done',
  usage: {thinkingLevel: 'high'},
});
```

Replace with:

```typescript
expect(events[doneIndex]).toMatchObject({
  type: 'done',
  reason: 'complete',
});
const lastUsageUpdate = events.findLast(
  (event) => event.type === 'usage-update',
);
expect(lastUsageUpdate).toBeDefined();
expect(lastUsageUpdate).toMatchObject({
  type: 'usage-update',
  usage: {thinkingLevel: 'high'},
});
```

(`Array.prototype.findLast` is supported in Bun and Node 20+; confirm by glancing at other test files for prior usage. If unavailable, use `[...events].reverse().find(...)` as a fallback.)

- [ ] **Step 4: Update `agent.test.ts` — "emits latest context input separately…" test**

Find the assertion (currently lines 220-228):

```typescript
expect(events.at(-1)).toMatchObject({
  type: 'done',
  usage: {
    currentContextInputTokens: 40,
    sessionInputTokens: 140,
    sessionOutputTokens: 18,
    sessionCacheReadInputTokens: 25,
  },
});
```

Replace with:

```typescript
expect(events.at(-1)).toMatchObject({type: 'done', reason: 'complete'});
const lastUsageUpdate = events.findLast(
  (event) => event.type === 'usage-update',
);
expect(lastUsageUpdate).toMatchObject({
  type: 'usage-update',
  usage: {
    currentContextInputTokens: 40,
    sessionInputTokens: 140,
    sessionOutputTokens: 18,
    sessionCacheReadInputTokens: 25,
  },
});
```

- [ ] **Step 5: Update `agent.test.ts` — "emits done usage with compacted context" test**

Find the assertions (currently lines 253-263):

```typescript
const doneEvent = events.at(-1);

expect(doneEvent?.type).toBe('done');
if (doneEvent?.type !== 'done') {
  throw new Error('Expected final event to be done');
}
expect(doneEvent.usage.currentContextInputTokens).toBeGreaterThan(0);
expect(doneEvent.usage.currentContextInputTokens).toBeLessThan(110_000);
expect(doneEvent.usage.sessionInputTokens).toBe(110_000);
expect(doneEvent.usage.sessionOutputTokens).toBe(7);
expect(doneEvent.usage.sessionCacheReadInputTokens).toBe(3);
```

Replace with:

```typescript
const doneEvent = events.at(-1);
expect(doneEvent?.type).toBe('done');

const lastUsageUpdate = events.findLast(
  (event) => event.type === 'usage-update',
);
if (lastUsageUpdate?.type !== 'usage-update') {
  throw new Error('Expected a usage-update event before done');
}
expect(lastUsageUpdate.usage.currentContextInputTokens).toBeGreaterThan(0);
expect(lastUsageUpdate.usage.currentContextInputTokens).toBeLessThan(110_000);
expect(lastUsageUpdate.usage.sessionInputTokens).toBe(110_000);
expect(lastUsageUpdate.usage.sessionOutputTokens).toBe(7);
expect(lastUsageUpdate.usage.sessionCacheReadInputTokens).toBe(3);
```

This test also implicitly checks the post-compaction emit ordering: the final `usage-update` is the one yielded _after_ `compactAfterTurn`, so `currentContextInputTokens` must reflect the slimmed context (less than 110_000).

- [ ] **Step 6: Add a new test for per-round usage-update emission**

In `apps/backend/src/agent-core/agent/agent.test.ts`, inside the existing `describe('Agent usage reporting', ...)` block, add a new test after the "compacted context" test (just before the closing `});` of the describe block):

```typescript
it('emits a usage-update event after each LLM round', async () => {
  vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
  vi.spyOn(llmApi, 'streamCompletion')
    .mockReturnValueOnce(
      usageCompletionStream({
        inputTokens: 100,
        outputTokens: 10,
        cacheReadInputTokens: 0,
      }),
    )
    .mockReturnValueOnce(
      usageCompletionStream({
        inputTokens: 50,
        outputTokens: 5,
        cacheReadInputTokens: 0,
      }),
    );
  const agent = new UsageTestAgent(
    () => Promise.resolve(MAIN_CONFIG),
    testAgentOptions(),
  );

  const events = await collectAll(agent.streamForTest('two rounds'));

  const usageUpdates = events.filter((event) => event.type === 'usage-update');
  // Expect at least: one after the user-message LLM call, plus one after
  // post-turn compaction. (UsageTestAgent in this file runs a single LLM
  // round per turn — adjust if its loop emits more.)
  expect(usageUpdates.length).toBeGreaterThanOrEqual(2);

  const doneIndex = events.findIndex((event) => event.type === 'done');
  expect(doneIndex).toBeGreaterThanOrEqual(0);
  const lastUsageBeforeDone = events
    .slice(0, doneIndex)
    .findLast((event) => event.type === 'usage-update');
  expect(lastUsageBeforeDone).toBeDefined();
});
```

Note: this test mocks two `streamCompletion` calls but `UsageTestAgent.streamForTest` likely only consumes one per turn. Before adding, open `agent.test.ts` and look at the existing `UsageTestAgent` class definition (search for `class UsageTestAgent`) to see what its loop does. If `streamForTest` runs only one LLM call (no tool-use loop), the second mock is unused — keep the test but lower the expectation to `toBeGreaterThanOrEqual(2)` (one after the LLM call, one after compaction). If it runs multiple, leave as-is.

- [ ] **Step 7: Run all backend tests**

Run: `bun run --filter '@omnicraft/backend' test`
Expected: PASS — all suites green.

- [ ] **Step 8: Run backend lint and typecheck**

Run in parallel:

- `bun run --filter '@omnicraft/backend' lint`
- `bun run --filter '@omnicraft/backend' typecheck`

Expected: both PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts
git commit -m "feat(backend): emit usage-update SSE events in real time"
```

---

## Task 4: Wire the new event through the frontend SSE pipeline

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.ts`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`

- [ ] **Step 1: Update the ChatEventMap**

In `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`:

(a) Add `SseUsageUpdateEvent` to the import from `@omnicraft/sse-events` (alphabetical, between `SseToolExecuteStartEvent` and the closing brace).

(b) Find the `done: SseDoneEvent;` line in `ChatEventMap` (currently line 84). Below it (or above, alphabetically by key), add the new entry. Final relevant block:

```typescript
  /** SSE done event pass-through. Universal for agent and subagent. */
  done: SseDoneEvent;
  /** Real-time token usage update from the backend. */
  'usage-update': SseUsageUpdateEvent;
```

- [ ] **Step 2: Route `usage-update` in `route-base-event-to-bus.ts`**

In `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.ts`, add a case to the switch (after the existing `case 'done':`):

```typescript
    case 'done':
      bus.emit(event.type, event);
      break;
    case 'usage-update':
      bus.emit(event.type, event);
      break;
```

- [ ] **Step 3: Add `usage-update` case in `useStreamChat.ts`**

In `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`, find the SSE event switch (around line 87). After the `case 'todo-update':` block (which ends around line 105), add a new case:

```typescript
              case 'usage-update':
                routeBaseEventToBus(event, eventBus);
                break;
```

This goes after `todo-update` and before `done`. The exhaustiveness of the switch is implicit (no `default: assertNever`), so TypeScript won't force you here, but the `ChatEventMap` change in Step 1 makes the bus emit type-safe.

- [ ] **Step 4: Frontend typecheck and lint**

Run in parallel:

- `bun run --filter '@omnicraft/frontend' build` (this runs `tsc -b` then `vite build`)
- `bun run --filter '@omnicraft/frontend' lint`

Expected: both PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts
git commit -m "feat(frontend): route usage-update SSE events to chat event bus"
```

---

## Task 5: Switch `useUsage` to subscribe to `usage-update`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/hooks/useUsage.ts`

- [ ] **Step 1: Replace the `done` subscription with `usage-update`**

Replace the entire body of `apps/frontend/src/modules/chat-session/components/UsageInfo/hooks/useUsage.ts` with:

```typescript
import type {SseUsage} from '@omnicraft/sse-events';
import {useEffect, useState} from 'react';

import type {ChatEventBus} from '../../StreamingMessageDisplay/index.js';

/** Tracks token usage from real-time usage-update events on the given event bus. */
export function useUsage(eventBus: ChatEventBus) {
  const [usage, setUsage] = useState<SseUsage | null>(null);

  useEffect(() => {
    const handler = (data: {usage: SseUsage}) => {
      setUsage(data.usage);
    };

    const onReset = () => {
      setUsage(null);
    };

    eventBus.on('usage-update', handler);
    eventBus.on('reset-session', onReset);
    return () => {
      eventBus.off('usage-update', handler);
      eventBus.off('reset-session', onReset);
    };
  }, [eventBus]);

  return {usage};
}
```

- [ ] **Step 2: Frontend tests**

Run: `bun run --filter '@omnicraft/frontend' test`
Expected: PASS. (The `UsageInfoView.test.tsx` file is a pure view test that takes `usage` as a prop, so it should be unaffected. If it fails, read the failure and report — do not adapt blindly.)

- [ ] **Step 3: Frontend lint + build**

Run in parallel:

- `bun run --filter '@omnicraft/frontend' lint`
- `bun run --filter '@omnicraft/frontend' build`

Expected: both PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/UsageInfo/hooks/useUsage.ts
git commit -m "feat(frontend): subscribe useUsage to usage-update event"
```

---

## Task 6: End-to-end verification in the browser

**Files:** none

- [ ] **Step 1: Start the dev server**

Run: `bun run dev`
Expected: backend and frontend both start. Check the terminal output for the frontend URL (typically `http://localhost:5173`).

- [ ] **Step 2: Open the chat page and trigger a multi-round agent turn**

In a browser, open the frontend URL. Send a message that requires the agent to make multiple tool calls (e.g., "list the files in this repo, then read `package.json` and summarize it"). Watch the usage indicator (bottom of the chat UI, rendered by `UsageInfo`).

Expected: the usage numbers update **during** the response, not just at the end. Specifically:

- `currentContextInputTokens` should change after the first LLM call completes (before any tool runs the second time)
- `sessionInputTokens` and `sessionOutputTokens` should grow with each round
- After the agent finishes, the final number should match what the old behavior would have shown on `done`

- [ ] **Step 3: Verify nothing regressed**

In the browser console (DevTools → Network → filter by "EventStream" or by the SSE endpoint), confirm:

- Each LLM round produces a `usage-update` SSE event
- The terminal `done` event no longer carries a `usage` field
- The usage display does not flicker to `null` on `done`
- Reset/new-session still clears the usage to `null`

If anything is off, debug before claiming complete. The skill `superpowers:verification-before-completion` applies — run the actual flows, don't just trust types.

- [ ] **Step 4: Stop the dev server**

Press Ctrl+C in the terminal where `bun run dev` is running.

- [ ] **Step 5: No commit**

This task only verifies — no code changes.

---

## Self-review checklist

- [x] Spec coverage: schema change (Task 1), backend emit (Task 2), backend tests updated (Task 3), frontend route + bus (Task 4), frontend hook (Task 5), e2e verification (Task 6).
- [x] No placeholders: every code step has the exact code; every command has expected output.
- [x] Type consistency: `SseUsageUpdateEvent` and `sseUsageUpdateEventSchema` names are stable across all tasks; `'usage-update'` literal is identical everywhere; `usage` field shape (`SseUsage`) is unchanged.
- [x] Replay-log decision documented (no compressor change) — see "File Structure" note.
- [x] Backward-compat decision documented (old persisted logs may fail validation) — see "File Structure" note. The implementer should put a one-line note in the final PR description, not in source comments.
