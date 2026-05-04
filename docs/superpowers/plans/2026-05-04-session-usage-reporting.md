# Session Usage Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rename the ambiguous public usage fields first, then add the one missing current-context field and update backend/frontend behavior.

**Architecture:** This is a two-phase protocol change. Phase 1 is a mechanical public `SseUsage` rename that preserves current behavior: `maxInputTokens` becomes `contextWindowTokens`, and cumulative `input/output/cache` fields become `session*` fields. Phase 2 separates provider-call usage from session usage: `llm-api` emits `LlmCallUsage` for one API call, and `llm-session` folds that into `LlmSessionUsage` from `llm-session/types.ts`.

**Tech Stack:** TypeScript, Zod, Vitest, React Testing Library, Bun workspaces.

---

## File Structure

- Modify: `packages/sse-events/src/schema.ts` - rename existing public `SseUsage` fields, then add `currentContextInputTokens` in phase 2.
- Modify: `apps/backend/src/agent-core/llm-api/types.ts` - rename provider usage to `LlmCallUsage` and keep it scoped to one API call.
- Modify: `apps/backend/src/agent-core/llm-api/index.ts` - export `LlmCallUsage` instead of `LlmUsage`.
- Modify: `apps/backend/src/agent-core/llm-api/claude/stream.ts` - update the local provider-call usage type after the rename.
- Modify: `apps/backend/src/agent-core/llm-session/types.ts` - add `LlmSessionUsage` with session-scoped field names.
- Modify: `apps/backend/src/agent-core/llm-session/index.ts` - export `LlmSessionUsage`.
- Modify: `apps/backend/src/agent-core/agent/agent.ts` - map internal cumulative usage to public `session*` field names in phase 1, then spread `LlmSessionUsage` in phase 2.
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts` - keep one `usage: LlmSessionUsage` object and update it in the `message-end` case.
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts` - verify latest context input differs from cumulative input.
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts` - verify final `done.usage` shape after both phases.
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts` - rename public usage fields, then add `currentContextInputTokens`.
- Modify: `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts` - update `SseUsage` fixtures.
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx` - phase 1 field rename, phase 2 context/session UI split.
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx` - update usage fixture and add context/session rendering coverage.
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts` - update `done.usage` fixtures.
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` - update `done.usage` fixtures.

---

### Task 1: Rename Existing Public Usage Fields

This task does not fix the context-usage bug. It only changes public field names while preserving the existing behavior and internal backend accounting.

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`
- Modify: `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx`
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`

- [ ] **Step 1: Rename the shared `SseUsage` schema fields**

In `packages/sse-events/src/schema.ts`, replace the current usage schema with this phase-1 shape:

```typescript
/** Token usage statistics shared between backend and frontend. */
export const sseUsageSchema = z.object({
  model: z.string(),
  contextWindowTokens: z.number(),
  sessionInputTokens: z.number(),
  sessionOutputTokens: z.number(),
  sessionCacheReadInputTokens: z.number(),
  thinkingLevel: thinkingLevelSchema,
});
export type SseUsage = z.infer<typeof sseUsageSchema>;
```

- [ ] **Step 2: Rename fields in `Agent.buildSseUsage()` without changing semantics**

In `apps/backend/src/agent-core/agent/agent.ts`, replace `buildSseUsage()` with:

```typescript
/**
 * Builds the full SseUsage object by combining LLM session token counts
 * with model metadata from the config.
 */
private async buildSseUsage(): Promise<SseUsage> {
  const config = await this.getConfig();
  const contextWindowTokens = await modelCapacity.getMaxInputTokens(config);
  const usage = this.llmSession.getUsage();
  return {
    model: config.model,
    contextWindowTokens,
    sessionInputTokens: usage.inputTokens,
    sessionOutputTokens: usage.outputTokens,
    sessionCacheReadInputTokens: usage.cacheReadInputTokens,
    thinkingLevel: this.thinkingLevel,
  };
}
```

- [ ] **Step 3: Rename coding subagent public usage fields**

In `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`, update the initial `usage` object to:

```typescript
let usage: SseUsage = {
  model: 'claude-code',
  contextWindowTokens: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionCacheReadInputTokens: 0,
  thinkingLevel,
};
```

Update the SDK result assignment to:

```typescript
usage = {
  model,
  contextWindowTokens: modelUsage.contextWindow,
  sessionInputTokens: modelUsage.inputTokens,
  sessionOutputTokens: modelUsage.outputTokens,
  sessionCacheReadInputTokens: modelUsage.cacheReadInputTokens,
  thinkingLevel,
};
```

- [ ] **Step 4: Rename backend `SseUsage` fixtures**

Run:

```bash
rg -n "maxInputTokens:|inputTokens:|outputTokens:|cacheReadInputTokens:|usage: \{" packages/sse-events/src apps/backend/src/agent-core/agent apps/backend/src/agent/agents/coding-sub-agent
```

For every object that represents public `SseUsage`, use the phase-1 field names. Do not rename provider-call usage objects.

Example `SseUsage` fixture:

```typescript
usage: {
  model: 'test-model',
  contextWindowTokens: 100,
  sessionInputTokens: 10,
  sessionOutputTokens: 5,
  sessionCacheReadInputTokens: 0,
  thinkingLevel: 'none',
}
```

- [ ] **Step 5: Rename frontend usage field reads without changing the UI semantics**

In `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`, replace the current calculations with the renamed fields:

```typescript
const cacheRate =
  usage.sessionInputTokens > 0
    ? Math.round(
        (usage.sessionCacheReadInputTokens / usage.sessionInputTokens) * 100,
      )
    : 0;

const contextRatio =
  usage.contextWindowTokens > 0
    ? usage.sessionInputTokens / usage.contextWindowTokens
    : 0;
```

Then update the rendered fields to the renamed names while keeping the existing layout:

```tsx
<span className={`${styles.item} ${isContextHigh ? styles.warning : ''}`}>
  Input: {formatTokenCount(usage.sessionInputTokens)} /{' '}
  {formatTokenCount(usage.contextWindowTokens)}
  <span className={styles.rate}> ({contextPercent}%)</span>
</span>
<span className={styles.item}>
  Output: {formatTokenCount(usage.sessionOutputTokens)}
</span>
<span className={styles.item}>
  Cached: {formatTokenCount(usage.sessionCacheReadInputTokens)}
  <span className={styles.rate}> ({cacheRate}%)</span>
</span>
```

- [ ] **Step 6: Rename frontend `SseUsage` fixtures**

Run:

```bash
rg -n "maxInputTokens:|inputTokens:|outputTokens:|cacheReadInputTokens:|usage\(\)|usage: \{" apps/frontend/src/modules/chat-session
```

Update `SseUsage` fixtures to phase-1 names. For example, update `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` helper to:

```typescript
function usage() {
  return {
    model: 'test-model',
    contextWindowTokens: 100,
    sessionInputTokens: 10,
    sessionOutputTokens: 5,
    sessionCacheReadInputTokens: 0,
    thinkingLevel: 'none' as const,
  };
}
```

- [ ] **Step 7: Run phase-1 checks**

Run:

```bash
bun run --cwd packages/sse-events typecheck
bun run --cwd apps/backend typecheck
bun run --cwd apps/backend test src/agent-core/agent/events/agent-sse-log.test.ts
bun run --cwd apps/frontend build
bun run --cwd apps/frontend test src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx src/modules/chat-session/helpers/route-base-event-to-bus.test.ts src/modules/chat-session/hooks/useStreamChat.test.tsx
```

Expected: PASS. The context percentage is still based on cumulative session input in this phase.

- [ ] **Step 8: Commit phase-1 rename**

Run:

```bash
git add packages/sse-events/src/schema.ts apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx
git commit -m "refactor: rename public usage token fields"
```

---

### Task 2: Add Current Context Usage And Fix UI Semantics

This task adds the single missing metric: `currentContextInputTokens`. Backend also splits usage types by layer: provider `message-end` events use `LlmCallUsage`, and `LlmSession` exposes `LlmSessionUsage` from `llm-session/types.ts`.

**Files:**

- Modify: `packages/sse-events/src/schema.ts`
- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/index.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/stream.ts`
- Modify: `apps/backend/src/agent-core/llm-session/types.ts`
- Modify: `apps/backend/src/agent-core/llm-session/index.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`
- Modify: `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx`
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts`
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx`

- [ ] **Step 1: Add `currentContextInputTokens` to the shared schema**

In `packages/sse-events/src/schema.ts`, update `sseUsageSchema` to:

```typescript
/** Token usage statistics shared between backend and frontend. */
export const sseUsageSchema = z.object({
  model: z.string(),
  contextWindowTokens: z.number(),
  currentContextInputTokens: z.number(),
  sessionInputTokens: z.number(),
  sessionOutputTokens: z.number(),
  sessionCacheReadInputTokens: z.number(),
  thinkingLevel: thinkingLevelSchema,
});
export type SseUsage = z.infer<typeof sseUsageSchema>;
```

- [ ] **Step 2: Write the failing LlmSession usage test**

In `apps/backend/src/agent-core/llm-session/llm-session.test.ts`, add this helper near existing stream helpers:

```typescript
function usageStream(usage: {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}): LlmEventStream {
  return (async function* () {
    yield {type: 'message-start' as const, messageId: 'assistant'};
    await Promise.resolve();
    yield {type: 'text-delta' as const, content: 'reply'};
    yield {
      type: 'message-end' as const,
      stopReason: 'end_turn',
      usage,
    };
  })();
}
```

Add this test before `describe('LlmSession compaction', ...)`:

```typescript
describe('LlmSession usage', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('tracks latest context input separately from cumulative usage', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(
        usageStream({
          inputTokens: 100,
          outputTokens: 10,
          cacheReadInputTokens: 20,
        }),
      )
      .mockReturnValueOnce(
        usageStream({
          inputTokens: 40,
          outputTokens: 8,
          cacheReadInputTokens: 5,
        }),
      );
    const session = new LlmSession(() => Promise.resolve(CONFIG));

    await drain(session.sendUserMessage('first', [], '', 'none').stream);
    await drain(session.sendUserMessage('second', [], '', 'none').stream);

    expect(session.getUsage()).toEqual({
      currentContextInputTokens: 40,
      sessionInputTokens: 140,
      sessionOutputTokens: 18,
      sessionCacheReadInputTokens: 25,
    });
  });
});
```

- [ ] **Step 3: Run the focused LlmSession test and verify it fails**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/llm-session/llm-session.test.ts -t "tracks latest context input separately"
```

Expected: FAIL because `session.getUsage()` does not return `currentContextInputTokens` yet.

- [ ] **Step 4: Rename provider usage to `LlmCallUsage`**

In `apps/backend/src/agent-core/llm-api/types.ts`, replace the current `LlmUsage` interface and `LlmMessageEndEvent` usage property with:

```typescript
/** Token usage statistics for one completed provider call. */
export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}

/** The LLM response has ended. */
export interface LlmMessageEndEvent {
  type: 'message-end';
  stopReason: string;
  usage: LlmCallUsage;
}
```

In `apps/backend/src/agent-core/llm-api/index.ts`, export `LlmCallUsage` instead of `LlmUsage`:

```typescript
export type {
  LlmAssistantMessage,
  LlmCallUsage,
  LlmCompletionOptions,
  LlmConfig,
  LlmEvent,
  LlmEventStream,
  LlmMessage,
  LlmMessageEndEvent,
  LlmMessageStartEvent,
  LlmTextDeltaEvent,
  LlmThinkingBlock,
  LlmThinkingDeltaEvent,
  LlmThinkingEndEvent,
  LlmThinkingStartEvent,
  LlmTokenCountOptions,
  LlmToolCall,
  LlmToolCallDeltaEvent,
  LlmToolCallEndEvent,
  LlmToolCallStartEvent,
  LlmToolResultMessage,
  LlmUserMessage,
} from './types.js';
```

In `apps/backend/src/agent-core/llm-api/claude/stream.ts`, update the type import from:

```typescript
import type {LlmCompletionOptions, LlmEventStream, LlmUsage} from '../types.js';
```

to:

```typescript
import type {
  LlmCallUsage,
  LlmCompletionOptions,
  LlmEventStream,
} from '../types.js';
```

Then update the local usage declaration to:

```typescript
let usage: LlmCallUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
};
```

- [ ] **Step 5: Add `LlmSessionUsage` to `llm-session/types.ts`**

In `apps/backend/src/agent-core/llm-session/types.ts`, add this interface near the other session-level types:

```typescript
/** Token usage statistics exposed for a full LLM session. */
export interface LlmSessionUsage {
  currentContextInputTokens: number;
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionCacheReadInputTokens: number;
}
```

In `apps/backend/src/agent-core/llm-session/index.ts`, export the new type:

```typescript
export type {
  LlmCompactionMetadata,
  LlmCompactionOptions,
  LlmCompactionReason,
  LlmSessionEvent,
  LlmSessionEventStream,
  LlmSessionMessageStartEvent,
  LlmSessionSnapshot,
  LlmSessionTextDeltaEvent,
  LlmSessionThinkingDeltaEvent,
  LlmSessionThinkingEndEvent,
  LlmSessionThinkingStartEvent,
  LlmSessionToolCallEvent,
  LlmSessionUsage,
  SendUserMessageResult,
  ToolResult,
} from './types.js';
```

- [ ] **Step 6: Store session usage in `LlmSession.usage`**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, remove `LlmUsage` from the `../llm-api/index.js` type import and add `LlmSessionUsage` to the `./types.js` import. Then update the existing usage field to:

```typescript
private usage: LlmSessionUsage = {
  currentContextInputTokens: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionCacheReadInputTokens: 0,
};
```

Replace `getUsage()` with:

```typescript
/** Returns latest context input usage plus cumulative session token usage. */
getUsage(): LlmSessionUsage {
  return {...this.usage};
}
```

Update `clear()` to reset the session usage object:

```typescript
this.usage = {
  currentContextInputTokens: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionCacheReadInputTokens: 0,
};
```

In the existing `message-end` case, fold the provider-call usage into session usage:

```typescript
case 'message-end':
  this.usage = {
    currentContextInputTokens: event.usage.inputTokens,
    sessionInputTokens:
      this.usage.sessionInputTokens + event.usage.inputTokens,
    sessionOutputTokens:
      this.usage.sessionOutputTokens + event.usage.outputTokens,
    sessionCacheReadInputTokens:
      this.usage.sessionCacheReadInputTokens +
      event.usage.cacheReadInputTokens,
  };
  break;
```

- [ ] **Step 7: Spread `LlmSessionUsage` in `Agent.buildSseUsage()`**

In `apps/backend/src/agent-core/agent/agent.ts`, update `buildSseUsage()` to:

```typescript
/**
 * Builds the full SseUsage object by combining LLM session token counts
 * with model metadata from the config.
 */
private async buildSseUsage(): Promise<SseUsage> {
  const config = await this.getConfig();
  const contextWindowTokens = await modelCapacity.getMaxInputTokens(config);
  return {
    model: config.model,
    contextWindowTokens,
    thinkingLevel: this.thinkingLevel,
    ...this.llmSession.getUsage(),
  };
}
```

- [ ] **Step 8: Add an Agent-level behavior test**

In `apps/backend/src/agent-core/agent/agent.test.ts`, update the existing `collectUntilDone` helper signature so the new multi-turn test can subscribe after the first turn's raw events:

```typescript
async function collectUntilDone(
  agent: Agent,
  startIndex = 0,
): Promise<SseEvent[]> {
  const controller = new AbortController();
  const events: SseEvent[] = [];

  for await (const entry of agent.subscribe({
    startIndex,
    signal: controller.signal,
  })) {
    const {event} = entry;
    events.push(event);
    if (event.type === 'done') {
      controller.abort();
      break;
    }
  }

  return events;
}
```

Add this helper after `titleCompletionStream()`:

```typescript
async function* usageCompletionStream(
  content: string,
  usage: {
    inputTokens: number;
    outputTokens: number;
    cacheReadInputTokens: number;
  },
): LlmEventStream {
  yield {type: 'message-start', messageId: `message-${content}`};
  await Promise.resolve();
  yield {type: 'text-delta', content};
  yield {
    type: 'message-end',
    stopReason: 'end_turn',
    usage,
  };
}
```

Add this test in a new `describe('Agent usage reporting', ...)` block before `describe('Agent title generation', ...)`:

```typescript
describe('Agent usage reporting', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits latest context input and cumulative token totals in done usage', async () => {
    vi.spyOn(llmApi, 'countToken').mockResolvedValue(1);
    vi.spyOn(llmApi, 'streamCompletion')
      .mockReturnValueOnce(
        usageCompletionStream('First response', {
          inputTokens: 100,
          outputTokens: 10,
          cacheReadInputTokens: 20,
        }),
      )
      .mockReturnValueOnce(
        usageCompletionStream('Second response', {
          inputTokens: 40,
          outputTokens: 8,
          cacheReadInputTokens: 5,
        }),
      );
    const agent = new TestAgent(
      () => Promise.resolve(MAIN_CONFIG),
      testAgentOptions(),
      {
        id: 'agent-usage',
        title: 'Existing Title',
        sseEventCount: 0,
        llmSession: {id: 'llm-usage', messages: [], compactions: []},
        options: {thinkingLevel: 'high'},
      },
    );

    const firstEventsPromise = collectUntilDone(agent);
    agent.handleUserMessage('First');
    const firstEvents = await firstEventsPromise;

    const secondEventsPromise = collectUntilDone(agent, firstEvents.length);
    agent.handleUserMessage('Second');
    const secondEvents = await secondEventsPromise;
    const done = secondEvents.findLast((event) => event.type === 'done');

    expect(done).toMatchObject({
      type: 'done',
      usage: {
        contextWindowTokens: 128000,
        currentContextInputTokens: 40,
        sessionInputTokens: 140,
        sessionOutputTokens: 18,
        sessionCacheReadInputTokens: 25,
      },
    });
  });
});
```

- [ ] **Step 9: Add `currentContextInputTokens` to coding subagent usage**

In `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`, add the new field to the initial object:

```typescript
let usage: SseUsage = {
  model: 'claude-code',
  contextWindowTokens: 0,
  currentContextInputTokens: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionCacheReadInputTokens: 0,
  thinkingLevel,
};
```

Add the new field to the SDK result assignment:

```typescript
usage = {
  model,
  contextWindowTokens: modelUsage.contextWindow,
  currentContextInputTokens: modelUsage.inputTokens,
  sessionInputTokens: modelUsage.inputTokens,
  sessionOutputTokens: modelUsage.outputTokens,
  sessionCacheReadInputTokens: modelUsage.cacheReadInputTokens,
  thinkingLevel,
};
```

- [ ] **Step 10: Add `currentContextInputTokens` to backend and frontend fixtures**

Run:

```bash
rg -n "contextWindowTokens:" apps/backend/src/agent-core/agent apps/backend/src/agent/agents/coding-sub-agent apps/frontend/src/modules/chat-session
```

For each public `SseUsage` object, add `currentContextInputTokens`. For fixtures that are not testing the context/session distinction, use the same value as `sessionInputTokens`:

```typescript
usage: {
  model: 'test-model',
  contextWindowTokens: 100,
  currentContextInputTokens: 10,
  sessionInputTokens: 10,
  sessionOutputTokens: 5,
  sessionCacheReadInputTokens: 0,
  thinkingLevel: 'none',
}
```

- [ ] **Step 11: Update frontend display semantics**

Replace `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx` with:

```typescript
import {render, screen} from '@testing-library/react';
import {describe, expect, it} from 'vitest';

import {UsageInfoView} from './UsageInfoView.js';

describe('UsageInfoView', () => {
  it('renders context usage separately from cumulative usage', () => {
    render(
      <UsageInfoView
        usage={{
          model: 'test-model',
          contextWindowTokens: 100,
          currentContextInputTokens: 20,
          sessionInputTokens: 150,
          sessionOutputTokens: 35,
          sessionCacheReadInputTokens: 45,
          thinkingLevel: 'high',
        }}
      />,
    );

    expect(screen.getByText('Thinking: High')).toBeInTheDocument();
    expect(screen.getByText(/Context: 20 \/ 100/)).toBeInTheDocument();
    expect(screen.getByText(/\(20%\)/)).toBeInTheDocument();
    expect(screen.getByText('Input: 150')).toBeInTheDocument();
    expect(screen.getByText('Output: 35')).toBeInTheDocument();
    expect(screen.getByText(/Cached: 45/)).toBeInTheDocument();
    expect(screen.getByText(/\(30%\)/)).toBeInTheDocument();
  });
});
```

In `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`, calculate context percentage from `currentContextInputTokens`:

```typescript
const cacheRate =
  usage.sessionInputTokens > 0
    ? Math.round(
        (usage.sessionCacheReadInputTokens / usage.sessionInputTokens) * 100,
      )
    : 0;

const contextRatio =
  usage.contextWindowTokens > 0
    ? usage.currentContextInputTokens / usage.contextWindowTokens
    : 0;
const contextPercent = Math.round(contextRatio * 100);
const isContextHigh = contextRatio > CONTEXT_WARNING_THRESHOLD;
```

Replace the usage field JSX with:

```tsx
<span className={`${styles.item} ${isContextHigh ? styles.warning : ''}`}>
  Context: {formatTokenCount(usage.currentContextInputTokens)} /{' '}
  {formatTokenCount(usage.contextWindowTokens)}
  <span className={styles.rate}> ({contextPercent}%)</span>
</span>
<span className={styles.item}>
  Input: {formatTokenCount(usage.sessionInputTokens)}
</span>
<span className={styles.item}>
  Output: {formatTokenCount(usage.sessionOutputTokens)}
</span>
<span className={styles.item}>
  Cached: {formatTokenCount(usage.sessionCacheReadInputTokens)}
  <span className={styles.rate}> ({cacheRate}%)</span>
</span>
```

- [ ] **Step 12: Run phase-2 focused tests**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/llm-session/llm-session.test.ts -t "tracks latest context input separately"
bun run --cwd apps/backend test src/agent-core/agent/agent.test.ts -t "emits latest context input"
bun run --cwd apps/frontend test src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx src/modules/chat-session/helpers/route-base-event-to-bus.test.ts src/modules/chat-session/hooks/useStreamChat.test.tsx
```

Expected: PASS.

- [ ] **Step 13: Run final checks**

Run:

```bash
bun run --cwd packages/sse-events typecheck
bun run --cwd apps/backend typecheck
bun run --cwd apps/backend test
bun run --cwd apps/frontend build
bun run --cwd apps/frontend test
```

Expected: PASS.

- [ ] **Step 14: Verify old public usage keys are gone**

Run:

```bash
rg -n "maxInputTokens:|contextInputTokens:" packages/sse-events/src apps/backend/src/agent-core/agent apps/backend/src/agent/agents/coding-sub-agent apps/frontend/src/modules/chat-session
```

Expected: no matches. The old public field names `inputTokens`, `outputTokens`, and `cacheReadInputTokens` may still appear in provider-call `LlmCallUsage` code and in test helpers that construct provider-call usage; those should not be renamed unless they are inside a public `SseUsage` object.

- [ ] **Step 15: Commit phase-2 behavior change**

Run:

```bash
git add packages/sse-events/src/schema.ts apps/backend/src/agent-core/llm-api/types.ts apps/backend/src/agent-core/llm-api/index.ts apps/backend/src/agent-core/llm-api/claude/stream.ts apps/backend/src/agent-core/llm-session/types.ts apps/backend/src/agent-core/llm-session/index.ts apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/llm-session.test.ts apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx
git commit -m "fix: report current context usage separately"
```
