# Context Compaction Frontend UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface backend compaction in the UI by adding three SSE events (`context-compaction-start` / `-end` / `-error`), threading them through the existing `AgentSseLog`, and rendering a collapsible `ContextCompactionBlock` card in the message list.

**Architecture:** Backend changes are minimal and additive. `LlmSession.compactIfNeeded` is converted from `Promise<boolean>` to an async generator that yields the three new events. Both call sites in `Agent` (`compactBeforeModelCall`, `compactAfterTurn`) consume the generator with a small loop and forward each event to the existing `Agent.appendSseEvent` pipeline. Frontend mirrors the existing `ThinkingBlock` pattern: SSE events flow through `useStreamChat` → `ChatEventBus` → `useMessages` (which builds a discriminated-union `MessageContent`) → `useMessageList` → `RenderItem` → new `ContextCompactionBlock` (HeroUI `Disclosure` + `Spinner`).

**Tech Stack:** Bun (package manager + runtime), TypeScript, Zod (SSE schema validation), Vitest (tests), React, HeroUI v3 (`Disclosure`, `Spinner`), `lucide-react` (icons), CSS Modules.

**Reference spec:** `docs/superpowers/specs/2026-05-05-context-compaction-frontend-ui-design.md`.

**Note on `reason` literal:** The existing backend code uses `'before-llm-call' | 'after-turn'` (`apps/backend/src/agent-core/llm-session/types.ts:47`). The spec uses `'before-model-call' | 'after-turn'` for narrative clarity. **This plan keeps `'before-llm-call'`** to avoid an unrelated rename. The SSE events also use `'before-llm-call' | 'after-turn'` so backend and wire formats agree.

---

## File Structure

**Created (backend):**

- (none — all backend changes go into existing files)

**Modified (backend):**

- `packages/sse-events/src/schema.ts` — add three event schemas; add them to `sseBaseEventSchema` and `sseEventSchema`
- `packages/sse-events/src/index.ts` — re-export the new schemas and types
- `apps/backend/src/agent-core/llm-session/llm-session.ts` — convert `compactIfNeeded` and `compactIfNeededUnlocked` to async generators; remove the `boolean` return; update `compactBeforeModelCall` to drain the generator
- `apps/backend/src/agent-core/llm-session/llm-session.test.ts` — update existing call sites; add tests for the new generator events
- `apps/backend/src/agent-core/agent/agent.ts` — replace the `await llmSession.compactIfNeeded(...)` call in `compactAfterTurn` with a `for await` loop that forwards events via `appendSseEvent`
- `apps/backend/src/agent-core/agent/agent.test.ts` — update the spy in the existing test; add wire-ordering tests

**Created (backend tests):**

- (no new files — extend existing test files)

**Created (frontend):**

- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/index.ts`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/ContextCompactionBlock.tsx`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/ContextCompactionBlockView.tsx`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/styles.module.css`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/hooks/useContextCompactionBlock.ts`

**Modified (frontend):**

- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts` — add three `ChatEventMap` entries; add `ContextCompactionMessageContent` discriminated union to `MessageContent`
- `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.ts` — add three new `case` arms
- `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts` — add the three event types to the existing pass-through `case` block
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts` — add three handlers (start/end/error); add a fallback handler in `useMessages.test.tsx`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts` — add a `ContextCompactionRenderItem` and a passthrough case in `transformMessages`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx` — add `case 'context-compaction'`
- `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts` — add tests for the new transitions (file may not exist yet — see Task 11)

---

## Task 1: SSE event schema

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `packages/sse-events/src/index.ts`
- Create: `packages/sse-events/src/schema.test.ts` (only if it doesn't exist; otherwise extend)

- [ ] **Step 1: Check whether a schema test file exists**

Run: `find packages/sse-events -name "*.test.ts"`

If a test file exists, extend it. If not, create `packages/sse-events/src/schema.test.ts` with this scaffold:

```ts
import {describe, expect, it} from 'vitest';

import {
  sseBaseEventSchema,
  sseContextCompactionEndEventSchema,
  sseContextCompactionErrorEventSchema,
  sseContextCompactionStartEventSchema,
  sseEventSchema,
} from './schema.js';

describe('context-compaction-start schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-start',
      compactionId: 'abc',
      reason: 'before-llm-call',
      beforeTokens: 1000,
      messageCount: 12,
    };
    expect(sseContextCompactionStartEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });

  it('rejects missing compactionId', () => {
    expect(() =>
      sseContextCompactionStartEventSchema.parse({
        type: 'context-compaction-start',
        reason: 'before-llm-call',
        beforeTokens: 1000,
        messageCount: 12,
      }),
    ).toThrow();
  });

  it('rejects an unknown reason', () => {
    expect(() =>
      sseContextCompactionStartEventSchema.parse({
        type: 'context-compaction-start',
        compactionId: 'abc',
        reason: 'unknown',
        beforeTokens: 1000,
        messageCount: 12,
      }),
    ).toThrow();
  });
});

describe('context-compaction-end schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-end',
      compactionId: 'abc',
      summary: 'A short summary.',
      beforeTokens: 1000,
      afterTokens: 200,
      messageCount: 12,
      durationMs: 4321,
    };
    expect(sseContextCompactionEndEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });
});

describe('context-compaction-error schema', () => {
  it('parses a valid event', () => {
    const event = {
      type: 'context-compaction-error',
      compactionId: 'abc',
      reason: 'after-turn',
      message: 'Aborted',
      beforeTokens: 1000,
      messageCount: 12,
    };
    expect(sseContextCompactionErrorEventSchema.parse(event)).toEqual(event);
    expect(sseBaseEventSchema.parse(event)).toEqual(event);
    expect(sseEventSchema.parse(event)).toEqual(event);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail (schemas don't exist yet)**

Run: `bun --cwd packages/sse-events run test`
Expected: FAIL with "sseContextCompactionStartEventSchema is not exported" or similar.

- [ ] **Step 3: Add the three schemas in `packages/sse-events/src/schema.ts`**

Insert immediately before `// Base event union (all events except error and subagent events).` (around line 137):

```ts
// ---------------------------------------------------------------------------
// Context compaction events
// ---------------------------------------------------------------------------

const compactionReasonSchema = z.enum(['before-llm-call', 'after-turn']);

/** Context compaction has started. */
export const sseContextCompactionStartEventSchema = z.object({
  type: z.literal('context-compaction-start'),
  compactionId: z.string(),
  reason: compactionReasonSchema,
  beforeTokens: z.number(),
  messageCount: z.number(),
});
export type SseContextCompactionStartEvent = z.infer<
  typeof sseContextCompactionStartEventSchema
>;

/** Context compaction completed successfully. */
export const sseContextCompactionEndEventSchema = z.object({
  type: z.literal('context-compaction-end'),
  compactionId: z.string(),
  summary: z.string(),
  beforeTokens: z.number(),
  afterTokens: z.number(),
  messageCount: z.number(),
  durationMs: z.number(),
});
export type SseContextCompactionEndEvent = z.infer<
  typeof sseContextCompactionEndEventSchema
>;

/** Context compaction failed (or was aborted). */
export const sseContextCompactionErrorEventSchema = z.object({
  type: z.literal('context-compaction-error'),
  compactionId: z.string(),
  reason: compactionReasonSchema,
  message: z.string(),
  beforeTokens: z.number(),
  messageCount: z.number(),
});
export type SseContextCompactionErrorEvent = z.infer<
  typeof sseContextCompactionErrorEventSchema
>;
```

- [ ] **Step 4: Add the three schemas to `sseBaseEventSchema`**

In `sseBaseEventSchema`'s array (currently lines 143-153), append:

```ts
sseContextCompactionStartEventSchema,
sseContextCompactionEndEventSchema,
sseContextCompactionErrorEventSchema,
```

- [ ] **Step 5: Add the three schemas to `sseEventSchema`**

In `sseEventSchema`'s array (currently lines 204-220), append the same three schema names so the full union accepts them too.

- [ ] **Step 6: Re-export from `packages/sse-events/src/index.ts`**

Add to the `export type {...} from './schema.js'` block (alphabetically):

```ts
SseContextCompactionEndEvent,
SseContextCompactionErrorEvent,
SseContextCompactionStartEvent,
```

Add to the `export {...} from './schema.js'` block (alphabetically):

```ts
sseContextCompactionEndEventSchema,
sseContextCompactionErrorEventSchema,
sseContextCompactionStartEventSchema,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `bun --cwd packages/sse-events run test`
Expected: PASS for all the new context-compaction tests.

- [ ] **Step 8: Run typecheck across the monorepo**

Run: `bun run typecheck` (from the repo root, or the equivalent command listed in root `package.json`)
Expected: PASS. Type errors here usually mean a re-export was missed.

- [ ] **Step 9: Commit**

```bash
git add packages/sse-events/src/schema.ts packages/sse-events/src/index.ts packages/sse-events/src/schema.test.ts
git commit -m "$(cat <<'EOF'
feat(sse-events): add context compaction events

Adds context-compaction-start / -end / -error schemas to the SSE event
union (and the base subset used inside subagent-output). Each event carries
a backend-generated compactionId so the start can be paired with its
matching terminal event in the persisted log.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Convert `compactIfNeeded` into an async generator (test first)

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`

- [ ] **Step 1: Read the existing compaction tests to understand the helpers**

Read `apps/backend/src/agent-core/llm-session/llm-session.test.ts` lines 280-440 to see how `largeOldMessages`, `summaryStream`, `failingStream`, `emptySummaryStream`, and `abortingSummaryStream` are wired. The new tests will reuse them.

- [ ] **Step 2: Update the two existing `compactIfNeeded` calls in the test file to drain the generator**

In `llm-session.test.ts`, lines 392-399 (current "fails compaction when the generated summary is empty" test), replace:

```ts
await expect(
  session.compactIfNeeded({
    reason: 'after-turn',
    tools: [],
    systemPrompt: '',
    thinkingLevel: 'none',
  }),
).rejects.toThrow('Compaction summary is empty');
```

with:

```ts
async function drainCompaction() {
  const events: unknown[] = [];
  for await (const event of session.compactIfNeeded({
    reason: 'after-turn',
    tools: [],
    systemPrompt: '',
    thinkingLevel: 'none',
  })) {
    events.push(event);
  }
  return events;
}

await expect(drainCompaction()).rejects.toThrow('Compaction summary is empty');
```

Apply the same shape to lines 421-428 (the "keeps history unchanged when turn-end compaction fails" test). Keep the `drainCompaction` helper local to each test.

- [ ] **Step 3: Add a new test asserting the success path yields start + end**

Append to the existing `describe('LlmSession compaction', ...)` block (or create one if it has been split):

```ts
it('yields start and end events on a successful compaction', async () => {
  vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(summaryStream());
  const messages = largeOldMessages(12);
  const session = new LlmSession(() => Promise.resolve(CONFIG), {
    id: 'session-1',
    compactions: [],
    usageBaselineMessageCount: null,
    messages,
    usage: emptyUsage(),
  });

  const events: unknown[] = [];
  for await (const event of session.compactIfNeeded({
    reason: 'after-turn',
    tools: [],
    systemPrompt: '',
    thinkingLevel: 'none',
  })) {
    events.push(event);
  }

  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({
    type: 'context-compaction-start',
    reason: 'after-turn',
    messageCount: 12,
  });
  expect(events[1]).toMatchObject({
    type: 'context-compaction-end',
    summary: expect.any(String),
    messageCount: 12,
  });
  expect((events[0] as {compactionId: string}).compactionId).toBe(
    (events[1] as {compactionId: string}).compactionId,
  );
});

it('yields nothing when the threshold is not met', async () => {
  const session = new LlmSession(() => Promise.resolve(CONFIG), {
    id: 'session-1',
    compactions: [],
    usageBaselineMessageCount: null,
    messages: [],
    usage: emptyUsage(),
  });

  const events: unknown[] = [];
  for await (const event of session.compactIfNeeded({
    reason: 'after-turn',
    tools: [],
    systemPrompt: '',
    thinkingLevel: 'none',
  })) {
    events.push(event);
  }

  expect(events).toEqual([]);
});

it('yields start + error then re-throws on failure', async () => {
  vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(failingStream());
  const messages = largeOldMessages(12);
  const session = new LlmSession(() => Promise.resolve(CONFIG), {
    id: 'session-1',
    compactions: [],
    usageBaselineMessageCount: null,
    messages,
    usage: emptyUsage(),
  });

  const events: unknown[] = [];
  let thrown: unknown;
  try {
    for await (const event of session.compactIfNeeded({
      reason: 'after-turn',
      tools: [],
      systemPrompt: '',
      thinkingLevel: 'none',
    })) {
      events.push(event);
    }
  } catch (err: unknown) {
    thrown = err;
  }

  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).message).toContain('provider failed');
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({type: 'context-compaction-start'});
  expect(events[1]).toMatchObject({
    type: 'context-compaction-error',
    reason: 'after-turn',
    message: expect.stringContaining('provider failed'),
  });
});

it('yields error with message "Aborted" when the signal trips mid-compaction', async () => {
  const controller = new AbortController();
  vi.spyOn(llmApi, 'streamCompletion').mockReturnValue(
    abortingSummaryStream(controller),
  );
  const messages = largeOldMessages(12);
  const session = new LlmSession(() => Promise.resolve(CONFIG), {
    id: 'session-1',
    compactions: [],
    usageBaselineMessageCount: null,
    messages,
    usage: emptyUsage(),
  });

  const events: unknown[] = [];
  let thrown: unknown;
  try {
    for await (const event of session.compactIfNeeded({
      reason: 'after-turn',
      tools: [],
      systemPrompt: '',
      thinkingLevel: 'none',
      signal: controller.signal,
    })) {
      events.push(event);
    }
  } catch (err: unknown) {
    thrown = err;
  }

  expect(thrown).toBeDefined();
  expect(events).toHaveLength(2);
  expect(events[0]).toMatchObject({type: 'context-compaction-start'});
  expect(events[1]).toMatchObject({
    type: 'context-compaction-error',
    message: 'Aborted',
  });
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `bun --cwd apps/backend run test -- llm-session.test.ts`
Expected: FAIL — `compactIfNeeded` is currently `Promise<boolean>`, not an iterable, so `for await (const event of session.compactIfNeeded(...))` will throw a TypeScript / runtime error.

- [ ] **Step 5: Convert `compactIfNeededUnlocked` to an async generator**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, replace the existing `compactIfNeededUnlocked` method (currently lines 252-307) with:

```ts
private async *compactIfNeededUnlocked(
  options: LlmCompactionOptions,
): AsyncGenerator<
  | SseContextCompactionStartEvent
  | SseContextCompactionEndEvent
  | SseContextCompactionErrorEvent,
  void,
  void
> {
  const config = await this.getConfig();
  const maxInputTokens = await modelCapacity.getMaxInputTokens(config);
  const currentTokens = this.estimatePromptTokensForCompaction(options);

  if (currentTokens < maxInputTokens * COMPACTION_TRIGGER_INPUT_TOKEN_RATIO) {
    return;
  }
  if (this.messages.length === 0) return;

  const compactionId = crypto.randomUUID();
  const beforeTokens = currentTokens;
  const coveredMessageCount = this.messages.length;
  const startedAt = Date.now();

  yield {
    type: 'context-compaction-start',
    compactionId,
    reason: options.reason,
    beforeTokens,
    messageCount: coveredMessageCount,
  };

  const beforeCharCount = JSON.stringify(this.messages).length;

  try {
    const summary = await generateCompactionSummary({
      config,
      messages: this.messages,
      tools: options.tools,
      ...(options.signal ? {signal: options.signal} : {}),
    });
    if (!summary) {
      throw new Error('Compaction summary is empty');
    }

    const recentContext = buildRecentContext(this.messages, options.tools);
    const summaryMessage: LlmMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user',
      content: buildCompactedMessageContent({
        summary,
        recentContext: recentContext.content,
      }),
    };

    this.messages.length = 0;
    this.messages.push(summaryMessage);
    this.usageBaselineMessageCount = null;
    const afterTokens = this.estimatePromptTokensFromMessages(options);
    this.usage = {
      ...this.usage,
      currentContextInputTokens: afterTokens,
      latestCallOutputTokens: 0,
    };
    this.compactions.push({
      id: crypto.randomUUID(),
      compactedAt: Date.now(),
      coveredMessageCount,
      recentContextMessageCount: recentContext.sourceMessageCount,
      beforeCharCount,
      afterCharCount: JSON.stringify(this.messages).length,
    });

    yield {
      type: 'context-compaction-end',
      compactionId,
      summary,
      beforeTokens,
      afterTokens,
      messageCount: coveredMessageCount,
      durationMs: Date.now() - startedAt,
    };
  } catch (err: unknown) {
    const message =
      err instanceof Error
        ? err.message
        : typeof err === 'string'
          ? err
          : 'Unknown error';
    yield {
      type: 'context-compaction-error',
      compactionId,
      reason: options.reason,
      message: options.signal?.aborted ? 'Aborted' : message,
      beforeTokens,
      messageCount: coveredMessageCount,
    };
    throw err;
  }
}
```

Notes:

- `afterTokens` is captured **before** building the end event payload because reading it requires `this.messages` to already hold the summary message.
- The `Aborted` message is forced when `signal.aborted` is set, in case the underlying error has a different message text. This matches how tool calls render abort.

- [ ] **Step 6: Convert public `compactIfNeeded` to delegate to the generator**

Replace the existing public method (currently lines 166-173) with:

```ts
async *compactIfNeeded(
  options: LlmCompactionOptions,
): AsyncGenerator<
  | SseContextCompactionStartEvent
  | SseContextCompactionEndEvent
  | SseContextCompactionErrorEvent,
  void,
  void
> {
  const release = await this.mutex.acquire();
  try {
    yield* this.compactIfNeededUnlocked(options);
  } finally {
    release();
  }
}
```

- [ ] **Step 7: Update `compactBeforeModelCall` to drain the generator**

Replace the existing private method body (currently lines 224-250) with:

```ts
private async compactBeforeModelCall(
  tools: readonly ToolDefinition[],
  systemPrompt: string,
  thinkingLevel: ThinkingLevel,
  signal?: AbortSignal,
): Promise<void> {
  try {
    throwIfAborted(signal);
    for await (const event of this.compactIfNeededUnlocked({
      reason: 'before-llm-call',
      tools,
      systemPrompt,
      thinkingLevel,
      ...(signal ? {signal} : {}),
    })) {
      this.emitSseEvent(event);
    }
    throwIfAborted(signal);
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw error instanceof Error ? error : new Error('Aborted');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to compact LLM session before model call: ${message}`,
      {cause: error},
    );
  }
}
```

`emitSseEvent` does not exist yet on `LlmSession` and would be the wrong direction (the session should not own SSE plumbing). Instead, use the event-bus pattern below.

**Revised Step 7: thread events through a callback**

Add a private field and constructor parameter for an optional event sink, OR — preferred — leave `compactBeforeModelCall` _not_ emitting events directly and rely on the call-site loop.

The cleanest split: only the **public** `compactIfNeeded` (consumed by `Agent`) yields events. The private `compactBeforeModelCall` calls the **private** `compactIfNeededUnlocked` and consumes its events, forwarding them to a callback supplied by the constructor or method options.

Since `LlmSession` already takes options through `LlmCompactionOptions`, the simplest extension is to add an optional event sink there:

In `apps/backend/src/agent-core/llm-session/types.ts`, add to `LlmCompactionOptions`:

```ts
readonly onSseEvent?: (
  event:
    | SseContextCompactionStartEvent
    | SseContextCompactionEndEvent
    | SseContextCompactionErrorEvent,
) => void;
```

Add the corresponding imports at the top of `types.ts`:

```ts
import type {
  SseContextCompactionEndEvent,
  SseContextCompactionErrorEvent,
  SseContextCompactionStartEvent,
} from '@omnicraft/sse-events';
```

Then in `compactBeforeModelCall` (replacing lines 224-250):

```ts
private async compactBeforeModelCall(
  tools: readonly ToolDefinition[],
  systemPrompt: string,
  thinkingLevel: ThinkingLevel,
  onSseEvent:
    | ((
        event:
          | SseContextCompactionStartEvent
          | SseContextCompactionEndEvent
          | SseContextCompactionErrorEvent,
      ) => void)
    | undefined,
  signal?: AbortSignal,
): Promise<void> {
  try {
    throwIfAborted(signal);
    for await (const event of this.compactIfNeededUnlocked({
      reason: 'before-llm-call',
      tools,
      systemPrompt,
      thinkingLevel,
      ...(signal ? {signal} : {}),
    })) {
      onSseEvent?.(event);
    }
    throwIfAborted(signal);
  } catch (error: unknown) {
    if (signal?.aborted) {
      throw error instanceof Error ? error : new Error('Aborted');
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to compact LLM session before model call: ${message}`,
      {cause: error},
    );
  }
}
```

Update the call site at `sendMessages` (lines 202-207) to thread an `onSseEvent` callback that pushes into the session event stream. Since `sendMessages` returns `LlmSessionEventStream`, it cannot easily yield SSE events (those have a different shape from `LlmSessionEvent`). Use a buffer:

In `sendMessages`, just before the call to `compactBeforeModelCall`:

```ts
const compactionEvents: Array<
  | SseContextCompactionStartEvent
  | SseContextCompactionEndEvent
  | SseContextCompactionErrorEvent
> = [];
```

Change the call to:

```ts
await this.compactBeforeModelCall(
  tools,
  systemPrompt,
  thinkingLevel,
  (event) => compactionEvents.push(event),
  signal,
);
```

After `compactBeforeModelCall` returns (still inside the `try` block, before `streamCompletion`), yield the buffered events as a new `LlmSessionEvent` variant:

Add to `LlmSessionEvent` union in `types.ts`:

```ts
/** A context compaction SSE event surfaced from inside sendMessages. */
export interface LlmSessionCompactionSseEvent {
  type: 'compaction-sse';
  event:
    | SseContextCompactionStartEvent
    | SseContextCompactionEndEvent
    | SseContextCompactionErrorEvent;
}
```

…and add `LlmSessionCompactionSseEvent` to the `LlmSessionEvent` union.

Then in `sendMessages` after `compactBeforeModelCall` returns:

```ts
for (const event of compactionEvents) {
  yield {type: 'compaction-sse', event};
}
```

This keeps `LlmSession` SSE-shape-aware only at the boundary; the agent then handles `'compaction-sse'` in its event pump and routes to `appendSseEvent`. This is consistent with how `Agent` already handles other `LlmSessionEvent` variants.

**Apply the imports** at the top of `llm-session.ts`:

```ts
import type {
  SseContextCompactionEndEvent,
  SseContextCompactionErrorEvent,
  SseContextCompactionStartEvent,
} from '@omnicraft/sse-events';
```

- [ ] **Step 8: Run the LlmSession tests to verify they pass**

Run: `bun --cwd apps/backend run test -- llm-session.test.ts`
Expected: PASS for all the new context-compaction tests, plus the two updated drain tests.

- [ ] **Step 9: Run typecheck**

Run: `bun --cwd apps/backend run typecheck`
Expected: PASS. If `Agent` fails to typecheck because it now sees a new `'compaction-sse'` variant in `LlmSessionEvent`, that's expected — Task 3 handles it.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/types.ts apps/backend/src/agent-core/llm-session/llm-session.test.ts
git commit -m "$(cat <<'EOF'
feat(llm-session): emit compaction SSE events as a generator

compactIfNeeded becomes an async generator that yields context-compaction
start/end/error events. The caller drains the generator instead of
checking a boolean return. compactBeforeModelCall threads events through
an onSseEvent callback so sendMessages can buffer and yield them as a
new 'compaction-sse' LlmSessionEvent variant.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Forward compaction events to the SSE log in `Agent`

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`

- [ ] **Step 1: Add a wire-ordering test for after-turn success**

In `agent.test.ts`, locate the existing test that spies on `compactIfNeeded` (line 279). Add a sibling test that triggers compaction and asserts the wire ordering:

```ts
it('emits start → end → done in that order on after-turn success', async () => {
  // Use a real LlmSession with mocked llmApi to keep the generator behavior intact.
  // Construct an Agent that produces an assistant turn followed by an
  // after-turn compaction. Assert appendSseEvent receives:
  //   message-start (assistant) → text-delta(s) → context-compaction-start
  //     → context-compaction-end → done
  // Use a spy on Agent.appendSseEvent (or capture via the SSE log reader).
});
```

Implementation: spy on `LlmSession.prototype.compactIfNeeded` and have the spy yield a fake start + fake end. Capture `appendSseEvent` calls (via `vi.spyOn(agent as any, 'appendSseEvent')`) and assert the order.

A concrete shape (adapt to the existing test helpers):

```ts
it('emits compaction events in order around the after-turn boundary', async () => {
  const compactionStart = {
    type: 'context-compaction-start',
    compactionId: 'cid-1',
    reason: 'after-turn',
    beforeTokens: 1000,
    messageCount: 5,
  } as const;
  const compactionEnd = {
    type: 'context-compaction-end',
    compactionId: 'cid-1',
    summary: 'summary',
    beforeTokens: 1000,
    afterTokens: 200,
    messageCount: 5,
    durationMs: 100,
  } as const;

  vi.spyOn(LlmSession.prototype, 'compactIfNeeded').mockImplementation(
    // eslint-disable-next-line @typescript-eslint/require-await
    async function* () {
      yield compactionStart;
      yield compactionEnd;
    },
  );

  // ... build the agent and run a turn that ends with done ...

  const eventTypes = appendSseEventSpy.mock.calls.map(
    (call: unknown[]) => (call[0] as {type: string}).type,
  );
  const startIdx = eventTypes.indexOf('context-compaction-start');
  const endIdx = eventTypes.indexOf('context-compaction-end');
  const doneIdx = eventTypes.lastIndexOf('done');
  expect(startIdx).toBeGreaterThan(-1);
  expect(endIdx).toBe(startIdx + 1);
  expect(doneIdx).toBe(endIdx + 1);
});
```

- [ ] **Step 2: Add a wire-ordering test for after-turn failure**

Same shape, but the spy yields `start` then `error` then throws. Assert `appendSseEventSpy` saw `start → error → done` (no top-level `error` event because `compactAfterTurn` swallows the throw).

- [ ] **Step 3: Add a wire-ordering test for before-llm-call failure**

The spy implementation needs to yield events into the LlmSession-side path, so this test is best written using the **`'compaction-sse'` `LlmSessionEvent`** the agent now consumes. Use the same agent loop with a mocked LlmSession that yields the `'compaction-sse'` events from `sendMessages`. Assert wire order is `context-compaction-start → context-compaction-error → error` (top-level).

- [ ] **Step 4: Run the agent tests to verify the new tests fail**

Run: `bun --cwd apps/backend run test -- agent.test.ts`
Expected: FAIL — `appendSseEvent` is not called with compaction events yet.

- [ ] **Step 5: Update `compactAfterTurn` to forward events**

In `apps/backend/src/agent-core/agent/agent.ts`, replace the body of `compactAfterTurn` (currently lines 329-346) with:

```ts
private async compactAfterTurn(
  tools: readonly ToolDefinition[],
  systemPrompt: string,
  thinkingLevel: ThinkingLevel,
): Promise<void> {
  try {
    for await (const event of this.llmSession.compactIfNeeded({
      reason: 'after-turn',
      tools,
      systemPrompt,
      thinkingLevel,
    })) {
      await this.appendSseEvent(event);
    }
  } catch (err: unknown) {
    // Turn-end compaction is best-effort cleanup after user-visible work is done.
    // Keep the completed turn successful and retry compaction before the next LLM call.
    logger.error({err}, 'Failed to compact LLM session after turn');
  }
}
```

- [ ] **Step 6: Handle the new `'compaction-sse'` event in the agent's pump**

In `Agent`'s event pump (the loop that consumes `LlmSessionEvent`s and forwards them to SSE; review `apps/backend/src/agent-core/agent/agent.ts` around the existing event-routing switch — likely in `runAgentLoop` or `consumeStream`), add a case:

```ts
case 'compaction-sse':
  await this.appendSseEvent(event.event);
  break;
```

If the existing switch is exhaustive (`satisfies never` or similar), TypeScript will tell you exactly where this case must go.

- [ ] **Step 7: Run the agent tests to verify they pass**

Run: `bun --cwd apps/backend run test -- agent.test.ts`
Expected: PASS for all wire-ordering tests.

- [ ] **Step 8: Run the full backend test suite**

Run: `bun --cwd apps/backend run test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts
git commit -m "$(cat <<'EOF'
feat(agent): forward compaction SSE events to the persisted log

compactAfterTurn now drains the new compactIfNeeded generator and
forwards each event via appendSseEvent. The agent's event pump also
forwards the new 'compaction-sse' LlmSessionEvent variant emitted by
sendMessages on the before-llm-call path. Wire ordering is:
…assistant text → start → end → done (success)
…assistant text → start → error → done (after-turn failure)
            start → error → top-level error (before-llm-call failure)

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Verify backend works end-to-end against a running session

**Files:** none

- [ ] **Step 1: Lower the trigger ratio in dev**

In `apps/backend/src/agent-core/llm-session/compaction/constants.ts`, temporarily change `COMPACTION_TRIGGER_INPUT_TOKEN_RATIO` from `0.8` to `0.05`. Do **not** commit this.

- [ ] **Step 2: Start the backend**

Run: `bun --cwd apps/backend run dev`

- [ ] **Step 3: Send a message via curl or the existing frontend, then inspect the SSE log**

Trigger a turn. Tail the session's persisted SSE log file (under `<sessions-dir>/<session-id>/`) and verify the three events appear in order with matching `compactionId`s.

- [ ] **Step 4: Restore the constant and confirm normal behavior**

Revert the change to `COMPACTION_TRIGGER_INPUT_TOKEN_RATIO`.

- [ ] **Step 5: Stop the backend**

No commit — this is verification only.

---

## Task 5: Frontend bus contract — extend `ChatEventMap` and `MessageContent`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts`

- [ ] **Step 1: Add the imports**

In `types.ts`, extend the `import type` block from `@omnicraft/sse-events` to include:

```ts
SseContextCompactionEndEvent,
SseContextCompactionErrorEvent,
SseContextCompactionStartEvent,
```

- [ ] **Step 2: Add the discriminated union for compaction message content**

After the `SubagentContent` interface (around line 41), add:

```ts
/** Compaction history entry — discriminated by status. */
export type ContextCompactionMessageContent =
  | {
      type: 'context-compaction';
      status: 'in-progress';
      compactionId: string;
      reason: 'before-llm-call' | 'after-turn';
      beforeTokens: number;
      messageCount: number;
    }
  | {
      type: 'context-compaction';
      status: 'done';
      compactionId: string;
      reason: 'before-llm-call' | 'after-turn';
      beforeTokens: number;
      messageCount: number;
      summary: string;
      afterTokens: number;
      durationMs: number;
    }
  | {
      type: 'context-compaction';
      status: 'failed';
      compactionId: string;
      reason: 'before-llm-call' | 'after-turn';
      beforeTokens: number;
      messageCount: number;
      errorMessage: string;
    };
```

- [ ] **Step 3: Add the variant to `MessageContent`**

Modify the `MessageContent` union (currently lines 44-49) to include `ContextCompactionMessageContent`:

```ts
export type MessageContent =
  | TextContent
  | ThinkingContent
  | SseToolExecuteStartEvent
  | SseToolExecuteEndEvent
  | SubagentContent
  | ContextCompactionMessageContent;
```

- [ ] **Step 4: Add three entries to `ChatEventMap`**

Inside `ChatEventMap` (lines 64-109), add:

```ts
/** Context compaction has started. */
'context-compaction-start': SseContextCompactionStartEvent;
/** Context compaction completed successfully. */
'context-compaction-end': SseContextCompactionEndEvent;
/** Context compaction failed (or was aborted). */
'context-compaction-error': SseContextCompactionErrorEvent;
```

- [ ] **Step 5: Run the frontend typecheck**

Run: `bun --cwd apps/frontend run typecheck`
Expected: PASS for `types.ts`. The dependent files (`useStreamChat`, `useMessages`, `RenderItem`) will report errors — those are addressed in Tasks 6-9.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/types.ts
git commit -m "$(cat <<'EOF'
feat(chat): add compaction events and content type to chat bus

Extends ChatEventMap with the three context-compaction events (reusing
the SSE event types directly, matching the existing pattern) and adds a
discriminated-union ContextCompactionMessageContent variant to
MessageContent so each status's required fields are typed precisely.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Route compaction events through `useStreamChat` and `route-base-event-to-bus`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts`
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.ts`

- [ ] **Step 1: Add the three cases to `route-base-event-to-bus.ts`**

Add to the `switch` (after the `done` case at line 38):

```ts
case 'context-compaction-start':
  bus.emit(event.type, event);
  break;
case 'context-compaction-end':
  bus.emit(event.type, event);
  break;
case 'context-compaction-error':
  bus.emit(event.type, event);
  break;
```

- [ ] **Step 2: Add the three cases to the `useStreamChat.ts` event switch**

In `useStreamChat.ts`, the existing pass-through case block at lines 94-102 currently handles `text-delta`, `tool-execute-start`, etc. Add the three new event types to the same fall-through:

```ts
case 'text-delta':
case 'tool-execute-start':
case 'tool-execute-end':
case 'tool-execute-delta':
case 'thinking-start':
case 'thinking-delta':
case 'thinking-end':
case 'context-compaction-start':
case 'context-compaction-end':
case 'context-compaction-error':
  routeBaseEventToBus(event, eventBus);
  break;
```

- [ ] **Step 3: Run the frontend typecheck**

Run: `bun --cwd apps/frontend run typecheck`
Expected: PASS for both files. `useMessages` and `RenderItem` will still complain about the new `MessageContent` variant — handled in Tasks 7-9.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-session/hooks/useStreamChat.ts apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.ts
git commit -m "$(cat <<'EOF'
feat(chat): route compaction SSE events to the chat bus

Adds the three context-compaction events to useStreamChat's pass-through
switch and to route-base-event-to-bus so they are also forwarded inside
subagent-output wrappers.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Build up compaction `MessageContent` in `useMessages`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts`

- [ ] **Step 1: Add the imports**

At the top of `useMessages.ts`, extend the `@omnicraft/sse-events` import to include:

```ts
SseContextCompactionEndEvent,
SseContextCompactionErrorEvent,
SseContextCompactionStartEvent,
```

- [ ] **Step 2: Add three reducer helpers**

After `updateSubagentStatus` (around line 278), add:

```ts
function pushCompactionStart(
  prev: ChatMessage[],
  event: SseContextCompactionStartEvent,
): ChatMessage[] {
  const base = removeTrailingAssistantMessageIfEmpty(prev);
  return [
    ...base,
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {
        type: 'context-compaction' as const,
        status: 'in-progress' as const,
        compactionId: event.compactionId,
        reason: event.reason,
        beforeTokens: event.beforeTokens,
        messageCount: event.messageCount,
      },
    },
    {
      id: null,
      createdAt: null,
      role: 'assistant' as const,
      content: {type: 'text' as const, content: ''},
    },
  ];
}

function applyCompactionEnd(
  prev: ChatMessage[],
  event: SseContextCompactionEndEvent,
): ChatMessage[] {
  return prev.map((msg) => {
    if (
      msg.content.type === 'context-compaction' &&
      msg.content.compactionId === event.compactionId
    ) {
      return {
        ...msg,
        content: {
          type: 'context-compaction' as const,
          status: 'done' as const,
          compactionId: msg.content.compactionId,
          reason: msg.content.reason,
          beforeTokens: msg.content.beforeTokens,
          messageCount: msg.content.messageCount,
          summary: event.summary,
          afterTokens: event.afterTokens,
          durationMs: event.durationMs,
        },
      };
    }
    return msg;
  });
}

function applyCompactionError(
  prev: ChatMessage[],
  event: SseContextCompactionErrorEvent,
): ChatMessage[] {
  return prev.map((msg) => {
    if (
      msg.content.type === 'context-compaction' &&
      msg.content.compactionId === event.compactionId
    ) {
      return {
        ...msg,
        content: {
          type: 'context-compaction' as const,
          status: 'failed' as const,
          compactionId: msg.content.compactionId,
          reason: msg.content.reason,
          beforeTokens: msg.content.beforeTokens,
          messageCount: msg.content.messageCount,
          errorMessage: event.message,
        },
      };
    }
    return msg;
  });
}
```

Each helper **replaces** the entire `content` object (rather than spreading) so the discriminated-union narrowing remains honest in TypeScript.

- [ ] **Step 3: Subscribe to the three events**

Inside the `useEffect` in `useMessages` (currently lines 285-366), declare three handlers:

```ts
const onCompactionStart = (data: SseContextCompactionStartEvent) => {
  setMessages((prev) => pushCompactionStart(prev, data));
};
const onCompactionEnd = (data: SseContextCompactionEndEvent) => {
  setMessages((prev) => applyCompactionEnd(prev, data));
};
const onCompactionError = (data: SseContextCompactionErrorEvent) => {
  setMessages((prev) => applyCompactionError(prev, data));
};
```

Subscribe them in the same block where the other handlers register:

```ts
eventBus.on('context-compaction-start', onCompactionStart);
eventBus.on('context-compaction-end', onCompactionEnd);
eventBus.on('context-compaction-error', onCompactionError);
```

…and unsubscribe in the cleanup return:

```ts
eventBus.off('context-compaction-start', onCompactionStart);
eventBus.off('context-compaction-end', onCompactionEnd);
eventBus.off('context-compaction-error', onCompactionError);
```

- [ ] **Step 4: Run the frontend typecheck**

Run: `bun --cwd apps/frontend run typecheck`
Expected: PASS for `useMessages.ts`. `useMessageList` and `RenderItem` will still complain — handled in Tasks 8-9.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts
git commit -m "$(cat <<'EOF'
feat(chat): build compaction MessageContent from bus events

Adds three pure reducers (pushCompactionStart, applyCompactionEnd,
applyCompactionError) and wires them into useMessages so the discriminated
union is fully populated by the time it reaches the render layer.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Add a render-item type and `transformMessages` case for compaction

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts`

- [ ] **Step 1: Add the discriminated render-item type**

After `SubagentRenderItem` (around line 79), add:

```ts
export type ContextCompactionRenderItem =
  | {
      type: 'context-compaction';
      status: 'in-progress';
      compactionId: string;
      reason: 'before-llm-call' | 'after-turn';
      beforeTokens: number;
      messageCount: number;
    }
  | {
      type: 'context-compaction';
      status: 'done';
      compactionId: string;
      reason: 'before-llm-call' | 'after-turn';
      beforeTokens: number;
      messageCount: number;
      summary: string;
      afterTokens: number;
      durationMs: number;
    }
  | {
      type: 'context-compaction';
      status: 'failed';
      compactionId: string;
      reason: 'before-llm-call' | 'after-turn';
      beforeTokens: number;
      messageCount: number;
      errorMessage: string;
    };
```

- [ ] **Step 2: Add it to the `MessageRenderItem` union**

```ts
export type MessageRenderItem =
  | UserTextRenderItem
  | AssistantTextRenderItem
  | ToolExecutionRenderItem
  | ThinkingRenderItem
  | SubagentRenderItem
  | ContextCompactionRenderItem;
```

- [ ] **Step 3: Add a passthrough case in `transformMessages`**

Inside the `switch (content.type)` (currently lines 116-193), add before the closing brace:

```ts
case 'context-compaction': {
  // The MessageContent and RenderItem unions are structurally identical,
  // so passthrough is type-safe.
  items.push(content);
  break;
}
```

- [ ] **Step 4: Run the frontend typecheck**

Run: `bun --cwd apps/frontend run typecheck`
Expected: PASS for `useMessageList.ts`. `RenderItem` will still complain — handled in Task 9.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/hooks/useMessageList.ts
git commit -m "$(cat <<'EOF'
feat(chat): add ContextCompactionRenderItem and transform passthrough

Makes the compaction content available as a render item with the same
discriminated-union shape, ready for the RenderItem switch.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Build the `ContextCompactionBlock` component

**Files:**

- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/index.ts`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/ContextCompactionBlock.tsx`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/ContextCompactionBlockView.tsx`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/styles.module.css`
- Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/hooks/useContextCompactionBlock.ts`

- [ ] **Step 1: Verify the parent directory exists**

Run: `ls apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/`
Expected: lists `AskUserCard`, `MessageBubble`, `RenderItem`, `SubagentDisclosure`, `ThinkingBlock`, `ToolExecutionCard`.

- [ ] **Step 2: Create the expand/collapse hook**

Create `ContextCompactionBlock/hooks/useContextCompactionBlock.ts`:

```ts
import {useEffect, useState} from 'react';

interface UseContextCompactionBlockOptions {
  status: 'in-progress' | 'done' | 'failed';
}

/** Default expansion: failed = expanded, others = collapsed. */
export function useContextCompactionBlock({
  status,
}: UseContextCompactionBlockOptions) {
  const [isExpanded, setIsExpanded] = useState(status === 'failed');

  // When transitioning into 'failed', expand. When into 'done', collapse.
  useEffect(() => {
    if (status === 'failed') setIsExpanded(true);
    else if (status === 'done') setIsExpanded(false);
  }, [status]);

  return {isExpanded, onExpandedChange: setIsExpanded};
}
```

- [ ] **Step 3: Create the view**

Create `ContextCompactionBlock/ContextCompactionBlockView.tsx`:

```tsx
import {Disclosure, Spinner} from '@heroui/react';
import clsx from 'clsx';
import {Archive, TriangleAlert} from 'lucide-react';

import {MarkdownRenderer} from '@/components/MarkdownRenderer/index.js';
import {formatTokenCount} from '@/modules/chat-session/components/UsageInfo/helpers/format-token-count.js';

import styles from './styles.module.css';

interface InProgressProps {
  status: 'in-progress';
}
interface DoneProps {
  status: 'done';
  beforeTokens: number;
  afterTokens: number;
  summary: string;
}
interface FailedProps {
  status: 'failed';
  errorMessage: string;
}

type ContextCompactionBlockViewProps = (
  | InProgressProps
  | DoneProps
  | FailedProps
) & {
  isExpanded: boolean;
  onExpandedChange: (isExpanded: boolean) => void;
};

const ICON_SIZE = 16;

export function ContextCompactionBlockView(
  props: ContextCompactionBlockViewProps,
) {
  const {isExpanded, onExpandedChange} = props;
  const isInProgress = props.status === 'in-progress';

  return (
    <div
      className={clsx(
        styles.card,
        isInProgress && styles.inProgress,
        props.status === 'done' && styles.done,
        props.status === 'failed' && styles.failed,
      )}
    >
      <Disclosure
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
        isDisabled={isInProgress}
      >
        <Disclosure.Heading>
          <Disclosure.Trigger className={styles.trigger}>
            {isInProgress && <Spinner size='sm' />}
            {props.status === 'done' && (
              <Archive size={ICON_SIZE} className={styles.iconDone} />
            )}
            {props.status === 'failed' && (
              <TriangleAlert size={ICON_SIZE} className={styles.iconFailed} />
            )}
            <span className={styles.label}>
              {isInProgress && 'Compacting context…'}
              {props.status === 'done' &&
                `Context compacted (${formatTokenCount(
                  props.beforeTokens,
                )} → ${formatTokenCount(props.afterTokens)} tokens)`}
              {props.status === 'failed' && 'Compaction failed'}
            </span>
            {!isInProgress && <Disclosure.Indicator />}
          </Disclosure.Trigger>
        </Disclosure.Heading>
        {!isInProgress && (
          <Disclosure.Content>
            <Disclosure.Body className={styles.body}>
              <div className={styles.content}>
                {props.status === 'done' && (
                  <MarkdownRenderer content={props.summary} />
                )}
                {props.status === 'failed' && (
                  <MarkdownRenderer content={props.errorMessage} />
                )}
              </div>
            </Disclosure.Body>
          </Disclosure.Content>
        )}
      </Disclosure>
    </div>
  );
}
```

- [ ] **Step 4: Create the container**

Create `ContextCompactionBlock/ContextCompactionBlock.tsx`:

```tsx
import {ContextCompactionBlockView} from './ContextCompactionBlockView.js';
import {useContextCompactionBlock} from './hooks/useContextCompactionBlock.js';

interface ContextCompactionBlockInProgressProps {
  status: 'in-progress';
}
interface ContextCompactionBlockDoneProps {
  status: 'done';
  beforeTokens: number;
  afterTokens: number;
  summary: string;
}
interface ContextCompactionBlockFailedProps {
  status: 'failed';
  errorMessage: string;
}

type ContextCompactionBlockProps =
  | ContextCompactionBlockInProgressProps
  | ContextCompactionBlockDoneProps
  | ContextCompactionBlockFailedProps;

export function ContextCompactionBlock(props: ContextCompactionBlockProps) {
  const {isExpanded, onExpandedChange} = useContextCompactionBlock({
    status: props.status,
  });

  if (props.status === 'in-progress') {
    return (
      <ContextCompactionBlockView
        status='in-progress'
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
      />
    );
  }
  if (props.status === 'done') {
    return (
      <ContextCompactionBlockView
        status='done'
        beforeTokens={props.beforeTokens}
        afterTokens={props.afterTokens}
        summary={props.summary}
        isExpanded={isExpanded}
        onExpandedChange={onExpandedChange}
      />
    );
  }
  return (
    <ContextCompactionBlockView
      status='failed'
      errorMessage={props.errorMessage}
      isExpanded={isExpanded}
      onExpandedChange={onExpandedChange}
    />
  );
}
```

- [ ] **Step 5: Create the styles**

Create `ContextCompactionBlock/styles.module.css`:

```css
.card {
  border-radius: 12px;
  overflow: hidden;
  width: 100%;
  max-width: 100%;
  background: var(--surface);
}

.inProgress {
  border: 1px dashed color-mix(in oklch, var(--accent) 50%, transparent);
}

.done {
  border: 1px solid var(--border);
}

.failed {
  border: 1px solid color-mix(in oklch, var(--danger) 60%, transparent);
  background: color-mix(in oklch, var(--danger) 6%, var(--surface));
}

.trigger {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 10px 12px;
  cursor: pointer;
  background: none;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
}

.iconDone {
  color: var(--muted);
}

.iconFailed {
  color: var(--danger);
}

.label {
  flex: 1;
  font-weight: 600;
  font-size: 0.875rem;
  color: var(--muted);
}

.failed .label {
  color: var(--danger);
}

.body {
  padding: 0 12px 12px;
}

.content {
  font-size: 0.8125rem;
  line-height: 1.6;
  color: var(--muted);
}

.failed .content {
  color: var(--text);
}
```

If `--danger` is not defined in the project's theme, fall back to a literal color (e.g. `#dc2626`) or use the closest existing token. Check `apps/frontend/src/styles/` for available custom properties.

- [ ] **Step 6: Create the barrel export**

Create `ContextCompactionBlock/index.ts`:

```ts
export {ContextCompactionBlock} from './ContextCompactionBlock.js';
```

- [ ] **Step 7: Run the frontend typecheck**

Run: `bun --cwd apps/frontend run typecheck`
Expected: PASS for the new files. `RenderItem` still complains — handled in Task 10.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/ContextCompactionBlock/
git commit -m "$(cat <<'EOF'
feat(chat): add ContextCompactionBlock component

Renders the three compaction states (in-progress, done, failed) using
HeroUI's Disclosure + Spinner. The in-progress card is non-interactive
(isDisabled, no Disclosure.Indicator) since there is no body to reveal.
Failed cards default to expanded so the error is visible immediately.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire `ContextCompactionBlock` into `RenderItem`

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx`

- [ ] **Step 1: Add the import**

Add near the other component imports (after `ToolExecutionCard`):

```ts
import {ContextCompactionBlock} from '../ContextCompactionBlock/index.js';
```

- [ ] **Step 2: Add the case to the switch**

Add to the `switch (item.type)` block (after the `subagent` case at line 108-120):

```tsx
case 'context-compaction': {
  if (item.status === 'in-progress') {
    return (
      <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
        <ContextCompactionBlock status='in-progress' />
      </div>
    );
  }
  if (item.status === 'done') {
    return (
      <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
        <ContextCompactionBlock
          status='done'
          beforeTokens={item.beforeTokens}
          afterTokens={item.afterTokens}
          summary={item.summary}
        />
      </div>
    );
  }
  return (
    <div className={clsx(styles.assistantMessage, styles.fullWidthMessage)}>
      <ContextCompactionBlock
        status='failed'
        errorMessage={item.errorMessage}
      />
    </div>
  );
}
```

The `fullWidthMessage` wrapper matches what `ThinkingBlock` uses (line 104), since the compaction card is also full-width in the message list rather than a chat bubble.

- [ ] **Step 3: Run the frontend typecheck**

Run: `bun --cwd apps/frontend run typecheck`
Expected: PASS for the entire frontend.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/components/MessageList/components/RenderItem/RenderItem.tsx
git commit -m "$(cat <<'EOF'
feat(chat): render ContextCompactionBlock in the message list

RenderItem dispatches the new context-compaction render item to the
ContextCompactionBlock component, threading the discriminated-union
status to pick the right view variant.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Frontend reducer tests

**Files:**

- Modify or Create: `apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts`

- [ ] **Step 1: Check if a test file exists for `useMessages`**

Run: `find apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks -name "useMessages.test.*"`

If a file exists, extend it. If not, create `useMessages.test.ts`. Either way the tests below cover the three reducer functions directly. Since `pushCompactionStart`, `applyCompactionEnd`, and `applyCompactionError` are currently file-private, **export them** from `useMessages.ts` (they remain pure functions with no React dependency).

- [ ] **Step 2: Export the reducers from `useMessages.ts`**

Change the three function declarations from `function pushCompactionStart(...)` etc. to `export function pushCompactionStart(...)` etc. (Step 2 from Task 7 added them as plain functions; this just adds `export`.)

- [ ] **Step 3: Add the unit tests**

Append to `useMessages.test.ts` (or create the file with this scaffold):

```ts
import {describe, expect, it} from 'vitest';

import type {ChatMessage} from '../types.js';
import {
  applyCompactionEnd,
  applyCompactionError,
  pushCompactionStart,
} from './useMessages.js';

const startEvent = {
  type: 'context-compaction-start' as const,
  compactionId: 'cid-1',
  reason: 'after-turn' as const,
  beforeTokens: 1000,
  messageCount: 5,
};

describe('compaction reducers', () => {
  it('pushCompactionStart appends an in-progress card and an empty placeholder', () => {
    const result = pushCompactionStart([], startEvent);
    expect(result).toHaveLength(2);
    expect(result[0].content).toMatchObject({
      type: 'context-compaction',
      status: 'in-progress',
      compactionId: 'cid-1',
    });
    expect(result[1].content).toEqual({type: 'text', content: ''});
  });

  it('applyCompactionEnd replaces the matching card with the done variant', () => {
    const initial = pushCompactionStart([], startEvent);
    const next = applyCompactionEnd(initial, {
      type: 'context-compaction-end',
      compactionId: 'cid-1',
      summary: 'a summary',
      beforeTokens: 1000,
      afterTokens: 200,
      messageCount: 5,
      durationMs: 50,
    });
    expect(next[0].content).toEqual({
      type: 'context-compaction',
      status: 'done',
      compactionId: 'cid-1',
      reason: 'after-turn',
      beforeTokens: 1000,
      messageCount: 5,
      summary: 'a summary',
      afterTokens: 200,
      durationMs: 50,
    });
  });

  it('applyCompactionError replaces the matching card with the failed variant', () => {
    const initial = pushCompactionStart([], startEvent);
    const next = applyCompactionError(initial, {
      type: 'context-compaction-error',
      compactionId: 'cid-1',
      reason: 'after-turn',
      message: 'Aborted',
      beforeTokens: 1000,
      messageCount: 5,
    });
    expect(next[0].content).toEqual({
      type: 'context-compaction',
      status: 'failed',
      compactionId: 'cid-1',
      reason: 'after-turn',
      beforeTokens: 1000,
      messageCount: 5,
      errorMessage: 'Aborted',
    });
  });

  it('end with no matching compactionId is a no-op', () => {
    const initial: ChatMessage[] = [
      {
        id: null,
        createdAt: null,
        role: 'assistant',
        content: {type: 'text', content: 'hi'},
      },
    ];
    const next = applyCompactionEnd(initial, {
      type: 'context-compaction-end',
      compactionId: 'no-such-id',
      summary: 's',
      beforeTokens: 0,
      afterTokens: 0,
      messageCount: 0,
      durationMs: 0,
    });
    expect(next).toEqual(initial);
  });
});
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `bun --cwd apps/frontend run test -- useMessages.test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.ts apps/frontend/src/modules/chat-session/components/StreamingMessageDisplay/hooks/useMessages.test.ts
git commit -m "$(cat <<'EOF'
test(chat): cover compaction message-state reducers

Exercises pushCompactionStart, applyCompactionEnd, and applyCompactionError
directly: ID-pairing replacement, no-match no-op, and full-state assertions
covering both done and failed transitions.

Co-Authored-By: Claude Opus 4 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Manual UI verification

**Files:** none

- [ ] **Step 1: Lower the compaction trigger ratio for dev**

In `apps/backend/src/agent-core/llm-session/compaction/constants.ts`, temporarily set `COMPACTION_TRIGGER_INPUT_TOKEN_RATIO` to `0.05`. Do NOT commit this.

- [ ] **Step 2: Start the dev server**

Use the `dev-server` skill if available, or run the dev commands directly:

Run: `bun --cwd apps/backend run dev` (in one terminal)
Run: `bun --cwd apps/frontend run dev` (in another terminal)

- [ ] **Step 3: Verify the in-progress state**

Send a message that triggers compaction. Watch for the spinner card. Confirm:

- The card has no chevron.
- Clicking the card does nothing (cursor doesn't change to pointer; no expand).
- Border has the dashed/animated treatment.

- [ ] **Step 4: Verify the done state**

After compaction completes, the card should:

- Show the archive icon.
- Display "Context compacted (Xk → Yk tokens)" in the trigger.
- Be collapsed by default.
- Expand to reveal the summary in markdown when clicked.
- Collapse cleanly when clicked again.

- [ ] **Step 5: Verify the failed state**

Force a compaction failure (e.g. temporarily make `generateCompactionSummary` throw, or set an invalid model so the LLM call errors). Confirm:

- Triangle-alert icon appears.
- Trigger reads "Compaction failed".
- The card is **expanded by default**.
- Body shows the error message.
- The chat-level error UI also surfaces a stream error when the failure was on the `before-llm-call` path.

- [ ] **Step 6: Verify the abort state**

Trigger compaction, then click stop while it's in flight. Confirm:

- Card flips to `failed` with body text "Aborted".
- Card is expanded by default.

- [ ] **Step 7: Verify replay**

Refresh the page. Confirm the compaction cards in the existing session render correctly from the persisted SSE log (start + terminal events both present).

- [ ] **Step 8: Restore the trigger ratio**

Revert the change to `COMPACTION_TRIGGER_INPUT_TOKEN_RATIO`.

- [ ] **Step 9: Stop the dev servers**

No commit — verification only.

---

## Self-Review

After writing the plan, I checked it against the spec:

**Spec coverage:**

- SSE event schema → Task 1 ✓
- `compactIfNeeded` generator + abort handling → Task 2 ✓
- Backend emission via `Agent.appendSseEvent` → Task 3 ✓
- ChatEventMap reuse of SSE types → Task 5 ✓
- Discriminated-union `MessageContent` → Task 5 ✓
- Routing through `useStreamChat` and `route-base-event-to-bus` → Task 6 ✓
- `useMessages` reducers (start/end/error, ID-pairing, "log and ignore" no-match) → Task 7, Task 11 ✓
- `useMessageList` passthrough + render-item type → Task 8 ✓
- `ContextCompactionBlock` (HeroUI Disclosure + Spinner, three states, in-progress non-interactive via `isDisabled` + omitted Indicator, failed expanded by default) → Task 9 ✓
- `RenderItem` dispatch → Task 10 ✓
- Manual UI verification → Task 12 ✓

**Naming consistency:**

- Backend uses `'before-llm-call' | 'after-turn'` (existing). Plan, schema, and frontend types all use these literals consistently.
- Compaction events use the same prefix everywhere: `context-compaction-{start,end,error}`.
- New `LlmSessionEvent` variant introduced in Task 2 is `'compaction-sse'`; consumed in Task 3.
- HeroUI components: `Disclosure`, `Spinner`, `Disclosure.Heading`, `Disclosure.Trigger`, `Disclosure.Indicator`, `Disclosure.Content`, `Disclosure.Body` — all match the API doc and the existing `ThinkingBlock` usage.

**Placeholder scan:** none.

**One known judgment call:** the `useMessages` reducers are made `export` (Task 11) so they can be unit-tested directly without rendering React. The alternative — rendering `useMessages` via `@testing-library/react` and dispatching events on a mock `eventBus` — has more moving parts and is unnecessary here.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-05-context-compaction-frontend-ui.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
