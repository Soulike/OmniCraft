# Session Usage Reporting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Separate current context usage from cumulative session token usage in `done.usage` and update the frontend display to show both correctly.

**Architecture:** Provider adapters continue emitting per-call usage. `LlmSession` stores the latest completed call usage separately from cumulative session usage, then `Agent.buildSseUsage()` exposes both through the existing `done.usage` event. The public `SseUsage` shape is replaced in one pass with `contextWindowTokens`, `currentContextInputTokens`, `sessionInputTokens`, `sessionOutputTokens`, and `sessionCacheReadInputTokens`; do not keep compatibility aliases for the previous token field names.

**Tech Stack:** TypeScript, Zod, Vitest, React Testing Library, Bun workspaces.

---

## File Structure

- Modify: `packages/sse-events/src/schema.ts` — replace ambiguous token fields in `SseUsage` with explicit context and session names.
- Create: `packages/sse-events/src/schema.test.ts` — verify usage payloads require the explicit token field names.
- Modify: `packages/sse-events/package.json` — add a package test script and Vitest dev dependency through Bun.
- Modify: `bun.lock` — capture the Vitest dev dependency added to `@omnicraft/sse-events`.
- Modify: `apps/backend/src/agent-core/llm-api/types.ts` — rename the provider per-call usage type and add a session usage type.
- Modify: `apps/backend/src/agent-core/llm-api/claude/stream.ts` — update usage type import/name.
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts` — track latest call usage and cumulative usage separately.
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts` — add multi-turn usage behavior coverage.
- Modify: `apps/backend/src/agent-core/agent/agent.ts` — emit `contextWindowTokens` from `buildSseUsage()`.
- Modify: `apps/backend/src/agent-core/agent/agent.test.ts` — verify `done.usage` contains latest context and cumulative totals.
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts` — use explicit token field names in coding subagent usage payloads.
- Modify: `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts` — update logged `SseUsage` fixtures to the explicit token field names.
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx` — use `currentContextInputTokens` for context display and show cumulative input separately.
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx` — cover context percentage and cumulative input rendering.
- Modify: `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts` — update routed `done.usage` fixtures to the explicit token field names.
- Modify: `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` — update streamed `done.usage` fixtures to the explicit token field names.

---

### Task 1: Update Shared SSE Usage Schema

**Files:**

- Modify: `packages/sse-events/package.json`
- Modify: `bun.lock`
- Modify: `packages/sse-events/src/schema.ts`
- Create: `packages/sse-events/src/schema.test.ts`

- [ ] **Step 1: Add a test script and install Vitest for the SSE events package**

Run:

```bash
bun add --cwd packages/sse-events --dev vitest@catalog:
```

Expected: `packages/sse-events/package.json` gains `vitest` in `devDependencies`, and `bun.lock` is updated if needed.

Then update the `scripts` section in `packages/sse-events/package.json` to:

```json
"scripts": {
  "test": "vitest run",
  "typecheck": "tsc --noEmit"
}
```

- [ ] **Step 2: Write the failing schema tests**

Create `packages/sse-events/src/schema.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {sseUsageSchema} from './schema.js';

describe('sseUsageSchema', () => {
  it('rejects the previous public token field names instead of accepting aliases', () => {
    const result = sseUsageSchema.safeParse({
      model: 'test-model',
      maxInputTokens: 100,
      inputTokens: 40,
      outputTokens: 8,
      cacheReadInputTokens: 12,
      thinkingLevel: 'none',
    });

    expect(result.success).toBe(false);
  });

  it('accepts current context input alongside cumulative usage', () => {
    const result = sseUsageSchema.safeParse({
      model: 'test-model',
      contextWindowTokens: 100,
      currentContextInputTokens: 30,
      sessionInputTokens: 140,
      sessionOutputTokens: 18,
      sessionCacheReadInputTokens: 25,
      thinkingLevel: 'high',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      model: 'test-model',
      contextWindowTokens: 100,
      currentContextInputTokens: 30,
      sessionInputTokens: 140,
      sessionOutputTokens: 18,
      sessionCacheReadInputTokens: 25,
      thinkingLevel: 'high',
    });
  });
});
```

- [ ] **Step 3: Run the schema test and verify it fails**

Run:

```bash
bun run --cwd packages/sse-events test src/schema.test.ts
```

Expected: FAIL because `sseUsageSchema` currently accepts the previous public token field names and rejects the new explicit field names.

- [ ] **Step 4: Replace the shared usage token fields without aliases**

In `packages/sse-events/src/schema.ts`, update `sseUsageSchema` to this exact shape. Do not keep `maxInputTokens`, `inputTokens`, `outputTokens`, or `cacheReadInputTokens` as optional fields or fallback aliases.

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

- [ ] **Step 5: Run the schema test and verify it passes**

Run:

```bash
bun run --cwd packages/sse-events test src/schema.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit shared schema changes**

Run:

```bash
git add bun.lock packages/sse-events/package.json packages/sse-events/src/schema.ts packages/sse-events/src/schema.test.ts
git commit -m "feat: use explicit usage token names in SSE schema"
```

---

### Task 2: Track Latest Context Usage Separately In `LlmSession`

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/stream.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`

- [ ] **Step 1: Add a multi-turn usage test**

In `apps/backend/src/agent-core/llm-session/llm-session.test.ts`, add these helpers near the existing stream helpers:

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

Then add this test before `describe('LlmSession compaction', ...)`:

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

- [ ] **Step 2: Run the focused backend test and verify it fails**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/llm-session/llm-session.test.ts -t "tracks latest context input separately"
```

Expected: FAIL because `session.getUsage()` does not return `currentContextInputTokens` and currently has only one accumulated usage object.

- [ ] **Step 3: Rename provider call usage and add session usage type**

In `apps/backend/src/agent-core/llm-api/types.ts`, replace the current `LlmUsage` interface and `LlmMessageEndEvent` usage property with:

```typescript
/** Token usage statistics for one completed provider call. */
export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}

/** Token usage statistics exposed for a full LLM session. */
export interface LlmSessionUsage {
  currentContextInputTokens: number;
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionCacheReadInputTokens: number;
}

/** The LLM response has ended. */
export interface LlmMessageEndEvent {
  type: 'message-end';
  stopReason: string;
  usage: LlmCallUsage;
}
```

Update any imports in `apps/backend/src/agent-core/llm-api/claude/stream.ts` from `LlmUsage` to `LlmCallUsage`, and update the local declaration:

```typescript
let usage: LlmCallUsage = {
  inputTokens: 0,
  outputTokens: 0,
  cacheReadInputTokens: 0,
};
```

- [ ] **Step 4: Implement separate latest and cumulative usage state**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, update the type import block to import `LlmCallUsage` and `LlmSessionUsage` instead of `LlmUsage`:

```typescript
import type {
  LlmAssistantMessage,
  LlmCallUsage,
  LlmConfig,
  LlmMessage,
  LlmSessionUsage,
  LlmThinkingBlock,
  LlmToolCall,
} from '../llm-api/index.js';
```

Add these helper functions above the `LlmSession` class:

```typescript
function emptyUsage(): LlmCallUsage {
  return {inputTokens: 0, outputTokens: 0, cacheReadInputTokens: 0};
}

function addUsage(left: LlmCallUsage, right: LlmCallUsage): LlmCallUsage {
  return {
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    cacheReadInputTokens:
      left.cacheReadInputTokens + right.cacheReadInputTokens,
  };
}
```

Replace the existing `private usage` field with:

```typescript
private latestUsage: LlmCallUsage = emptyUsage();
private cumulativeUsage: LlmCallUsage = emptyUsage();
```

Replace `getUsage()` with:

```typescript
/** Returns latest context input usage plus cumulative session token usage. */
getUsage(): LlmSessionUsage {
  return {
    currentContextInputTokens: this.latestUsage.inputTokens,
    sessionInputTokens: this.cumulativeUsage.inputTokens,
    sessionOutputTokens: this.cumulativeUsage.outputTokens,
    sessionCacheReadInputTokens: this.cumulativeUsage.cacheReadInputTokens,
  };
}
```

Update `clear()` usage reset to:

```typescript
this.latestUsage = emptyUsage();
this.cumulativeUsage = emptyUsage();
```

Replace the `message-end` case usage update with:

```typescript
case 'message-end':
  this.latestUsage = event.usage;
  this.cumulativeUsage = addUsage(this.cumulativeUsage, event.usage);
  break;
```

- [ ] **Step 5: Run the focused backend test and verify it passes**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/llm-session/llm-session.test.ts -t "tracks latest context input separately"
```

Expected: PASS.

- [ ] **Step 6: Run the LLM session test file**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/llm-session/llm-session.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit backend session usage changes**

Run:

```bash
git add apps/backend/src/agent-core/llm-api/types.ts apps/backend/src/agent-core/llm-api/claude/stream.ts apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/llm-session.test.ts
git commit -m "feat: separate context and cumulative llm usage"
```

---

### Task 3: Update Backend SSE Usage Payloads And Fixtures

**Files:**

- Modify: `apps/backend/src/agent-core/agent/agent.test.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`
- Modify: `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts`

- [ ] **Step 1: Add an Agent-level usage assertion**

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

In `apps/backend/src/agent-core/agent/agent.test.ts`, add this helper after `titleCompletionStream()`:

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

- [ ] **Step 2: Run the Agent usage test and verify it fails**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/agent/agent.test.ts -t "emits latest context input"
```

Expected: FAIL until `Agent.buildSseUsage()` and all `SseUsage` payloads and fixtures use the explicit token field names.

- [ ] **Step 3: Emit `contextWindowTokens` from the main Agent usage builder**

In `apps/backend/src/agent-core/agent/agent.ts`, replace `buildSseUsage()` with:

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

- [ ] **Step 4: Use explicit token field names in coding subagent usage payloads**

In `apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts`, update the initial `usage` object to:

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

Update the SDK result assignment to:

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

- [ ] **Step 5: Update backend `SseUsage` test fixtures**

Run:

```bash
rg -n "maxInputTokens:|contextInputTokens:|inputTokens:|outputTokens:|cacheReadInputTokens:|usage: \{" packages/sse-events/src apps/backend/src/agent-core/agent apps/backend/src/agent/agents/coding-sub-agent
```

For every object that represents `SseUsage`, use the explicit context/session token field names and remove the previous token field names from that object. For fixtures that are not testing the distinction, copy the old `inputTokens` numeric value into both `currentContextInputTokens` and `sessionInputTokens`.

For example, in `apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts`, fixture usage should look like:

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

- [ ] **Step 6: Run backend tests that cover Agent and SSE logs**

Run:

```bash
bun run --cwd apps/backend test src/agent-core/agent/agent.test.ts src/agent-core/agent/events/agent-sse-log.test.ts
```

Expected: PASS.

- [ ] **Step 7: Commit backend SSE usage updates**

Run:

```bash
git add apps/backend/src/agent-core/agent/agent.ts apps/backend/src/agent-core/agent/agent.test.ts apps/backend/src/agent/agents/coding-sub-agent/coding-sub-agent.ts apps/backend/src/agent-core/agent/events/agent-sse-log.test.ts
git commit -m "feat: emit explicit session usage token names"
```

---

### Task 4: Update Frontend Usage Display

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx`
- Modify: `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`
- Modify: frontend test fixtures containing `SseUsage`

- [ ] **Step 1: Write the failing UsageInfoView test**

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

- [ ] **Step 2: Run the focused frontend test and verify it fails**

Run:

```bash
bun run --cwd apps/frontend test src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx
```

Expected: FAIL because the component still renders cumulative `inputTokens` as context usage and does not render a separate cumulative input field.

- [ ] **Step 3: Implement the display change**

In `apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx`, replace the cache and context calculations with:

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

Replace the current input/context JSX block with:

```tsx
<span className={`${styles.item} ${isContextHigh ? styles.warning : ''}`}>
  Context: {formatTokenCount(usage.currentContextInputTokens)} /{' '}
  {formatTokenCount(usage.contextWindowTokens)}
  <span className={styles.rate}> ({contextPercent}%)</span>
</span>
<span className={styles.item}>
  Input: {formatTokenCount(usage.sessionInputTokens)}
</span>
```

Update the `Output` and `Cached` blocks to read the session-scoped fields:

```tsx
<span className={styles.item}>
  Output: {formatTokenCount(usage.sessionOutputTokens)}
</span>
<span className={styles.item}>
  Cached: {formatTokenCount(usage.sessionCacheReadInputTokens)}
  <span className={styles.rate}> ({cacheRate}%)</span>
</span>
```

- [ ] **Step 4: Update frontend `SseUsage` fixtures**

Run:

```bash
rg -n "maxInputTokens:|contextInputTokens:|inputTokens:|outputTokens:|cacheReadInputTokens:|usage\(\)|usage: \{" apps/frontend/src
```

For every `SseUsage` fixture, use the explicit context/session token field names and remove the previous token field names from that object. Use the same value for `currentContextInputTokens` and `sessionInputTokens` in fixtures that are not testing the distinction.

For example, update the helper in `apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx` to:

```typescript
function usage() {
  return {
    model: 'test-model',
    contextWindowTokens: 100,
    currentContextInputTokens: 10,
    sessionInputTokens: 10,
    sessionOutputTokens: 5,
    sessionCacheReadInputTokens: 0,
    thinkingLevel: 'none' as const,
  };
}
```

Update the `done` route test in `apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts` to include:

```typescript
contextWindowTokens: 100,
currentContextInputTokens: 10,
sessionInputTokens: 10,
sessionOutputTokens: 5,
sessionCacheReadInputTokens: 0,
```

- [ ] **Step 5: Run focused frontend tests**

Run:

```bash
bun run --cwd apps/frontend test src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx src/modules/chat-session/helpers/route-base-event-to-bus.test.ts src/modules/chat-session/hooks/useStreamChat.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit frontend usage display changes**

Run:

```bash
git add apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.tsx apps/frontend/src/modules/chat-session/components/UsageInfo/UsageInfoView.test.tsx apps/frontend/src/modules/chat-session/helpers/route-base-event-to-bus.test.ts apps/frontend/src/modules/chat-session/hooks/useStreamChat.test.tsx
git commit -m "feat: show explicit context and session usage"
```

---

### Task 5: Run Repository Verification

**Files:**

- Modify only files surfaced by typecheck or tests from the previous tasks.

- [ ] **Step 1: Run shared package checks**

Run:

```bash
bun run --cwd packages/sse-events typecheck
bun run --cwd packages/sse-events test
```

Expected: PASS.

- [ ] **Step 2: Run backend checks**

Run:

```bash
bun run --cwd apps/backend typecheck
bun run --cwd apps/backend test
```

Expected: PASS.

- [ ] **Step 3: Run frontend checks**

Run:

```bash
bun run --cwd apps/frontend build
bun run --cwd apps/frontend test
```

Expected: PASS.

- [ ] **Step 4: Fix any remaining typed usage literals**

If typecheck reports old or missing `SseUsage` token fields, update only the reported `SseUsage` object. For unrelated fixtures that previously used `inputTokens: 10`, `outputTokens: 5`, and `cacheReadInputTokens: 0`, use this exact replacement shape:

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

Then rerun the failing command from the previous step.

- [ ] **Step 5: Scan for removed public `SseUsage` token keys**

Run:

```bash
rg -n "maxInputTokens:|contextInputTokens:|inputTokens:|outputTokens:|cacheReadInputTokens:" packages/sse-events/src apps/backend/src/agent-core/agent/events apps/backend/src/agent/agents/coding-sub-agent apps/frontend/src/modules/chat-session
```

Expected: no matches for removed public `SseUsage` token keys. If a match is a `SseUsage` object, replace it with the explicit context/session token field names. Provider-call usage in `LlmCallUsage` is allowed to keep `inputTokens`, `outputTokens`, and `cacheReadInputTokens`, but it should not appear in the scanned public SSE paths.

- [ ] **Step 6: Commit verification fixes if needed**

If Step 4 or Step 5 changed files, run:

```bash
git add apps/backend/src apps/frontend/src packages/sse-events/src packages/sse-events/package.json bun.lock
git commit -m "test: update usage fixtures for explicit token names"
```

If Step 4 and Step 5 changed no files, do not create an empty commit.

- [ ] **Step 7: Confirm final status**

Run:

```bash
git status --short
```

Expected: no output.
