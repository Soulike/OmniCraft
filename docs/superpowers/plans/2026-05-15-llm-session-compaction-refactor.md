# LlmSession Compaction Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move compaction logic out of `LlmSession` into object-named singleton services behind a single `compaction/index.ts` facade.

**Architecture:** `LlmSession` remains the session-state owner and delegates compaction to `llmSessionCompactor`. The compaction package owns decision-making, token estimation, history compaction, event construction, and the compaction workflow. Tests follow ownership boundaries: singleton logic is tested in singleton test files; `LlmSession` tests cover delegation, event forwarding, error wrapping, and rollback only.

**Tech Stack:** TypeScript, Bun, Vitest, Zod, existing `LlmSession`/`llm-api` backend modules.

---

## File Map

- Modify: `apps/backend/src/agent-core/llm-session/types.ts` - rename persisted snapshot field to `latestUsageInputMessageCount`.
- Modify: `apps/backend/src/agent-core/llm-session/types.test.ts` - update snapshot field tests and wording.
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts` - remove compaction internals, delegate to facade, apply compaction patch.
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts` - remove singleton-owned compaction assertions, keep boundary tests.
- Create: `apps/backend/src/agent-core/llm-session/compaction/index.ts` - export only `llmSessionCompactor`.
- Rename: `compaction/constants.ts` -> `compaction/compaction-constants.ts`.
- Rename: `compaction/prompt.ts` -> `compaction/compaction-prompt-builder.ts`.
- Rename: `compaction/slim.ts` -> `compaction/compaction-message-slimmer.ts`.
- Rename: `compaction/summary.ts` -> `compaction/compaction-summary-generator.ts`.
- Rename tests: `prompt.test.ts`, `slim.test.ts`, `summary.test.ts` to match object names.
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-types.ts`.
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-token-estimator.ts` and test.
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.ts` and test.
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor.ts` and test.
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-event-factory.ts` and test.
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-session-compactor.ts` and test.

---

### Task 1: Rename Usage Count Field

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/types.ts`
- Modify: `apps/backend/src/agent-core/llm-session/types.test.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`

- [ ] **Step 1: Update tests to require `latestUsageInputMessageCount`**

In `types.test.ts`, replace snapshot objects using `usageBaselineMessageCount` with `latestUsageInputMessageCount`. Rename the test `requires usage baseline message count` to `requires latest usage input message count`.

Example expected valid snapshot shape:

```typescript
{
  id: 'session-1',
  messages: [],
  compactions: [],
  latestUsageInputMessageCount: null,
  usage: emptyUsage(),
}
```

- [ ] **Step 2: Run the focused schema tests and verify failure**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/types.test.ts
```

Expected: fail because `llmSessionSnapshotSchema` still requires `usageBaselineMessageCount`.

- [ ] **Step 3: Rename production field**

In `types.ts`, change the snapshot schema field:

```typescript
latestUsageInputMessageCount: z.number().nullable(),
```

In `llm-session.ts`, rename the private field and all snapshot/state references:

```typescript
private latestUsageInputMessageCount: number | null = null;
```

Use the new field in constructor snapshot restore, `toSnapshot()`, `clear()`, rollback, compaction reset, latest-usage token estimation, and `message-end` usage updates.

- [ ] **Step 4: Run focused schema and session tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/types.test.ts src/agent-core/llm-session/llm-session.test.ts
```

Expected: pass after updating all old snapshot fixtures to the new field.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/types.ts apps/backend/src/agent-core/llm-session/types.test.ts apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/llm-session.test.ts
git commit -m "refactor: rename latest usage input message count"
```

---

### Task 2: Convert Existing Compaction Helpers Into Object-Named Services

**Files:**

- Rename: `apps/backend/src/agent-core/llm-session/compaction/constants.ts` -> `apps/backend/src/agent-core/llm-session/compaction/compaction-constants.ts`
- Rename: `apps/backend/src/agent-core/llm-session/compaction/prompt.ts` -> `apps/backend/src/agent-core/llm-session/compaction/compaction-prompt-builder.ts`
- Rename: `apps/backend/src/agent-core/llm-session/compaction/slim.ts` -> `apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.ts`
- Rename: `apps/backend/src/agent-core/llm-session/compaction/summary.ts` -> `apps/backend/src/agent-core/llm-session/compaction/compaction-summary-generator.ts`
- Rename tests to matching filenames.

- [ ] **Step 1: Rename files and tests**

Run non-destructive renames:

```bash
mv apps/backend/src/agent-core/llm-session/compaction/constants.ts apps/backend/src/agent-core/llm-session/compaction/compaction-constants.ts
mv apps/backend/src/agent-core/llm-session/compaction/prompt.ts apps/backend/src/agent-core/llm-session/compaction/compaction-prompt-builder.ts
mv apps/backend/src/agent-core/llm-session/compaction/slim.ts apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.ts
mv apps/backend/src/agent-core/llm-session/compaction/summary.ts apps/backend/src/agent-core/llm-session/compaction/compaction-summary-generator.ts
mv apps/backend/src/agent-core/llm-session/compaction/prompt.test.ts apps/backend/src/agent-core/llm-session/compaction/compaction-prompt-builder.test.ts
mv apps/backend/src/agent-core/llm-session/compaction/slim.test.ts apps/backend/src/agent-core/llm-session/compaction/compaction-message-slimmer.test.ts
mv apps/backend/src/agent-core/llm-session/compaction/summary.test.ts apps/backend/src/agent-core/llm-session/compaction/compaction-summary-generator.test.ts
```

- [ ] **Step 2: Wrap prompt functions in a singleton service**

In `compaction-prompt-builder.ts`, export:

```typescript
export class CompactionPromptBuilder {
  buildCompactionPrompt(slimmedMessages: readonly string[]): string {
    return buildCompactionPrompt(slimmedMessages);
  }

  buildCompactedMessageContent(
    options: BuildCompactedMessageContentOptions,
  ): string {
    return buildCompactedMessageContent(options);
  }
}

export const compactionPromptBuilder = new CompactionPromptBuilder();
```

Keep local private implementation helpers in the same file. Update tests to call `compactionPromptBuilder.buildCompactionPrompt()` and `compactionPromptBuilder.buildCompactedMessageContent()`.

- [ ] **Step 3: Wrap slimmer functions in a singleton service**

In `compaction-message-slimmer.ts`, export:

```typescript
export class CompactionMessageSlimmer {
  slimMessagesForSummary(
    messages: readonly LlmMessage[],
    tools: readonly ToolDefinition[],
  ): string[] {
    return slimMessages(messages, tools, SUMMARY_INPUT_TRUNCATION);
  }

  buildRecentContext(
    messages: readonly LlmMessage[],
    tools: readonly ToolDefinition[],
  ): RecentContext {
    const recentMessages = messages.slice(-RECENT_CONTEXT_SOURCE_MESSAGE_COUNT);
    if (recentMessages.length === 0) {
      return {content: 'No recent context.', sourceMessageCount: 0};
    }

    return {
      content: slimMessages(
        recentMessages,
        tools,
        RECENT_CONTEXT_TRUNCATION,
      ).join('\n'),
      sourceMessageCount: recentMessages.length,
    };
  }
}

export const compactionMessageSlimmer = new CompactionMessageSlimmer();
```

Update tests to call the singleton methods.

- [ ] **Step 4: Wrap summary generation in a singleton service**

In `compaction-summary-generator.ts`, export:

```typescript
export class CompactionSummaryGenerator {
  async generate(options: GenerateCompactionSummaryOptions): Promise<string> {
    const prompt = compactionPromptBuilder.buildCompactionPrompt(
      compactionMessageSlimmer.slimMessagesForSummary(
        options.messages,
        options.tools,
      ),
    );
    // Existing stream aggregation logic remains unchanged.
  }
}

export const compactionSummaryGenerator = new CompactionSummaryGenerator();
```

Update tests to call `compactionSummaryGenerator.generate()`.

- [ ] **Step 5: Update imports and run helper tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/compaction-prompt-builder.test.ts src/agent-core/llm-session/compaction/compaction-message-slimmer.test.ts src/agent-core/llm-session/compaction/compaction-summary-generator.test.ts
```

Expected: pass.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/compaction
git commit -m "refactor: name compaction support services"
```

---

### Task 3: Add Compaction Types, Token Estimator, and Decision Service

**Files:**

- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-types.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-token-estimator.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-token-estimator.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.test.ts`

- [ ] **Step 1: Write failing token estimator tests**

Create `llm-compaction-token-estimator.test.ts` with tests for:

```typescript
it('uses latest provider usage plus output and pending messages when valid', () => {
  const result = llmCompactionTokenEstimator.estimateCurrentTokens({
    messages: [
      userMessage('first'),
      assistantMessage('reply'),
      userMessage('next'),
    ],
    usage: {
      currentContextInputTokens: 100,
      latestCallOutputTokens: 20,
      sessionInputTokens: 100,
      sessionOutputTokens: 20,
      sessionCacheReadInputTokens: 0,
    },
    latestUsageInputMessageCount: 1,
    options: compactionOptions(),
  });

  expect(result).toBeGreaterThan(120);
});

it('falls back to local prompt estimation when latest usage is unavailable', () => {
  const result = llmCompactionTokenEstimator.estimateCurrentTokens({
    messages: [userMessage('hello')],
    usage: emptyUsage(),
    latestUsageInputMessageCount: null,
    options: compactionOptions(),
  });

  expect(result).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run token estimator tests and verify failure**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-compaction-token-estimator.test.ts
```

Expected: fail because the file under test does not exist.

- [ ] **Step 3: Implement compaction types and token estimator**

Create `llm-compaction-types.ts` with shared internal interfaces, including `LlmCompactionDecision`, `CompactLlmSessionIfNeededInput`, and `LlmSessionCompactionPatch`.

Create `llm-compaction-token-estimator.ts` with:

```typescript
export class LlmCompactionTokenEstimator {
  estimateCurrentTokens(input: EstimateCurrentTokensInput): number;
  estimateTokensFromMessages(input: EstimateTokensFromMessagesInput): number;
}

export const llmCompactionTokenEstimator = new LlmCompactionTokenEstimator();
```

Move the current `estimatePromptTokensForCompaction`, `estimatePromptTokensFromMessages`, and `estimatePromptTokensFromLatestUsage` logic out of `LlmSession` into this service.

- [ ] **Step 4: Run token estimator tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-compaction-token-estimator.test.ts
```

Expected: pass.

- [ ] **Step 5: Write failing decision service tests**

Create `llm-compaction-decision-service.test.ts` with tests for skip and compact decisions. Mock `modelCapacity.getMaxInputTokens` to return `100`, then use small and large message inputs.

Expected compact decision shape:

```typescript
expect(decision).toMatchObject({
  type: 'compact',
  reason: 'after-turn',
  beforeTokens: expect.any(Number),
  coveredMessageCount: 1,
});
expect(decision.compactionId).toEqual(expect.any(String));
expect(decision.startedAt).toEqual(expect.any(Number));
```

- [ ] **Step 6: Run decision service tests and verify failure**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-compaction-decision-service.test.ts
```

Expected: fail because the file under test does not exist.

- [ ] **Step 7: Implement decision service**

Create `llm-compaction-decision-service.ts`:

```typescript
export class LlmCompactionDecisionService {
  constructor(private readonly tokenEstimator = llmCompactionTokenEstimator) {}

  async decide(
    input: LlmCompactionDecisionInput,
  ): Promise<LlmCompactionDecision> {
    const maxInputTokens = await modelCapacity.getMaxInputTokens(input.config);
    const beforeTokens = this.tokenEstimator.estimateCurrentTokens(input);
    if (
      beforeTokens < maxInputTokens * COMPACTION_TRIGGER_INPUT_TOKEN_RATIO ||
      input.messages.length === 0
    ) {
      return {type: 'skip'};
    }

    return {
      type: 'compact',
      compactionId: crypto.randomUUID(),
      reason: input.options.reason,
      beforeTokens,
      coveredMessageCount: input.messages.length,
      startedAt: Date.now(),
    };
  }
}

export const llmCompactionDecisionService = new LlmCompactionDecisionService();
```

- [ ] **Step 8: Run tests and commit**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-compaction-token-estimator.test.ts src/agent-core/llm-session/compaction/llm-compaction-decision-service.test.ts
```

Expected: pass.

Commit:

```bash
git add apps/backend/src/agent-core/llm-session/compaction/llm-compaction-*.ts
git commit -m "refactor: extract compaction decision services"
```

---

### Task 4: Add History Compactor and Event Factory

**Files:**

- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-event-factory.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-event-factory.test.ts`

- [ ] **Step 1: Write failing history compactor tests**

Create tests that instantiate `LlmHistoryCompactor` with a fake summary generator returning `'summary text'`. Assert:

```typescript
expect(result.summary).toBe('summary text');
expect(result.messages).toHaveLength(1);
expect(result.messages[0]?.role).toBe('user');
expect(result.messages[0]?.content).toContain('<conversation_summary>');
expect(result.messages[0]?.content).toContain('<recent_context>');
expect(result.metadataInput.beforeCharCount).toBeGreaterThan(0);
expect(result.metadataInput.afterCharCount).toBeGreaterThan(0);
```

Add a second test where the fake generator returns `''` and assert rejection with `Compaction summary is empty`.

- [ ] **Step 2: Run history compactor tests and verify failure**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-history-compactor.test.ts
```

Expected: fail because the file under test does not exist.

- [ ] **Step 3: Implement history compactor**

Create `llm-history-compactor.ts` with:

```typescript
export class LlmHistoryCompactor {
  constructor(
    private readonly summaryGenerator = compactionSummaryGenerator,
    private readonly messageSlimmer = compactionMessageSlimmer,
    private readonly promptBuilder = compactionPromptBuilder,
  ) {}

  async compact(
    input: LlmHistoryCompactorInput,
  ): Promise<LlmHistoryCompactionResult> {
    const beforeCharCount = JSON.stringify(input.messages).length;
    const summary = await this.summaryGenerator.generate(input);
    throwIfAborted(input.signal);
    if (!summary) throw new Error('Compaction summary is empty');

    const recentContext = this.messageSlimmer.buildRecentContext(
      input.messages,
      input.tools,
    );
    const summaryMessage: LlmMessage = {
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      role: 'user',
      content: this.promptBuilder.buildCompactedMessageContent({
        summary,
        recentContext: recentContext.content,
      }),
    };

    const messages = [summaryMessage];
    return {
      summary,
      messages,
      metadataInput: {
        recentContextMessageCount: recentContext.sourceMessageCount,
        beforeCharCount,
        afterCharCount: JSON.stringify(messages).length,
      },
    };
  }
}

export const llmHistoryCompactor = new LlmHistoryCompactor();
```

- [ ] **Step 4: Write failing event factory tests**

Create tests for start, end, and abort error events. Assert the start event includes `type: 'context-compaction-start'`, the end event includes `durationMs`, and abort error messages are `Aborted`.

- [ ] **Step 5: Implement event factory**

Create `llm-compaction-event-factory.ts` with singleton methods `createStartEvent()`, `createEndEvent()`, and `createErrorEvent()`.

- [ ] **Step 6: Run tests and commit**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-history-compactor.test.ts src/agent-core/llm-session/compaction/llm-compaction-event-factory.test.ts
```

Expected: pass.

Commit:

```bash
git add apps/backend/src/agent-core/llm-session/compaction/llm-history-compactor* apps/backend/src/agent-core/llm-session/compaction/llm-compaction-event-factory*
git commit -m "refactor: extract compaction history and events"
```

---

### Task 5: Add LlmSessionCompactor Facade

**Files:**

- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-session-compactor.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/llm-session-compactor.test.ts`
- Create: `apps/backend/src/agent-core/llm-session/compaction/index.ts`

- [ ] **Step 1: Write failing facade tests**

Create tests using fake decision/history/event services and a `commit` spy:

```typescript
it('commits before yielding the end event', async () => {
  const order: string[] = [];
  const compactor = new LlmSessionCompactor({
    decisionService: {
      decide: async () => ({
        type: 'compact',
        compactionId: 'compaction-1',
        reason: 'after-turn',
        beforeTokens: 100,
        coveredMessageCount: 1,
        startedAt: 1000,
      }),
    },
    historyCompactor: {
      compact: async () => ({
        summary: 'summary text',
        messages: [userMessage('summary')],
        metadataInput: {
          recentContextMessageCount: 1,
          beforeCharCount: 100,
          afterCharCount: 20,
        },
      }),
    },
    eventFactory: {
      createStartEvent: () => ({
        type: 'context-compaction-start',
        compactionId: 'compaction-1',
        reason: 'after-turn',
        beforeTokens: 100,
        messageCount: 1,
      }),
      createEndEvent: () => ({
        type: 'context-compaction-end',
        compactionId: 'compaction-1',
        summary: 'summary text',
        beforeTokens: 100,
        afterTokens: 10,
        messageCount: 1,
        durationMs: 5,
      }),
      createErrorEvent: () => ({
        type: 'context-compaction-error',
        compactionId: 'compaction-1',
        reason: 'after-turn',
        message: 'failure',
        beforeTokens: 100,
        messageCount: 1,
      }),
    },
    tokenEstimator: {
      estimateCurrentTokens: () => 100,
      estimateTokensFromMessages: () => 10,
    },
  });

  for await (const event of compactor.compactIfNeeded({
    config: TEST_CONFIG,
    messages: [userMessage('old')],
    usage: emptyUsage(),
    latestUsageInputMessageCount: null,
    options: compactionOptions(),
    commit: () => order.push('commit'),
  })) {
    order.push(event.type);
  }

  expect(order).toEqual([
    'context-compaction-start',
    'commit',
    'context-compaction-end',
  ]);
});
```

Add tests for skip yielding no events, history failure yielding error and rethrowing, and no commit on failure.

- [ ] **Step 2: Run facade tests and verify failure**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-session-compactor.test.ts
```

Expected: fail because the facade does not exist.

- [ ] **Step 3: Implement facade and public index**

Create `llm-session-compactor.ts` with:

```typescript
export class LlmSessionCompactor {
  async *compactIfNeeded(
    input: CompactLlmSessionIfNeededInput,
  ): AsyncGenerator<SseContextCompactionEvent, void, void> {
    const decision = await this.decisionService.decide(input);
    if (decision.type === 'skip') return;

    yield this.eventFactory.createStartEvent(decision);

    try {
      const result = await this.historyCompactor.compact({
        config: input.config,
        messages: input.messages,
        tools: input.options.tools,
        signal: input.options.signal,
      });
      const afterTokens = this.tokenEstimator.estimateTokensFromMessages({
        messages: result.messages,
        options: input.options,
      });
      input.commit(this.buildPatch(input, decision, result, afterTokens));
      yield this.eventFactory.createEndEvent(decision, result, afterTokens);
    } catch (err: unknown) {
      yield this.eventFactory.createErrorEvent(
        decision,
        err,
        input.options.signal,
      );
      throw normalizeCompactionError(err);
    }
  }
}

export const llmSessionCompactor = new LlmSessionCompactor();
```

Create `index.ts` with:

```typescript
export {llmSessionCompactor} from './llm-session-compactor.js';
```

- [ ] **Step 4: Run facade tests and verify index boundary**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/compaction/llm-session-compactor.test.ts
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/compaction/llm-session-compactor* apps/backend/src/agent-core/llm-session/compaction/index.ts
git commit -m "refactor: add llm session compactor facade"
```

---

### Task 6: Wire LlmSession To The Facade

**Files:**

- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.test.ts`
- Modify: `apps/backend/src/agent-core/llm-session/index.ts`

- [ ] **Step 1: Rewrite LlmSession compaction tests as boundary tests**

In `llm-session.test.ts`, remove tests that assert decision thresholds, summary generation, event payload construction, empty summary, and abort error payloads through `LlmSession`. Keep or add tests for:

- before-call compaction events are forwarded as `compaction-sse`;
- before-call compactor failure is wrapped;
- `compactIfNeeded()` delegates public after-turn compaction;
- provider failure after compactor commit rolls back the committed patch;
- latest usage input message count is restored in snapshots.

Use `vi.spyOn(llmSessionCompactor, 'compactIfNeeded')` for delegation tests.
Fake compactor streams should be explicit async generators, for example:

```typescript
async function* singleCompactionEvent() {
  yield {
    type: 'context-compaction-start' as const,
    compactionId: 'compaction-1',
    reason: 'before-llm-call' as const,
    beforeTokens: 100,
    messageCount: 1,
  };
}
```

- [ ] **Step 2: Run LlmSession tests and verify failure**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/llm-session.test.ts
```

Expected: fail because `LlmSession` still owns old compaction internals and imports old helper modules.

- [ ] **Step 3: Replace LlmSession compaction internals**

In `llm-session.ts`:

- remove direct imports of `z`, `modelCapacity`, `estimatePromptTokens`, and compaction helper internals;
- import `llmSessionCompactor` from `./compaction/index.js`;
- add `applyCompactionPatch(patch: LlmSessionCompactionPatch)`;
- change `compactIfNeededUnlocked()` to call the facade with `commit`;
- delete old private token-estimation methods.

- [ ] **Step 4: Run focused LlmSession and compaction tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session/llm-session.test.ts src/agent-core/llm-session/compaction
```

Expected: pass.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-session/llm-session.ts apps/backend/src/agent-core/llm-session/llm-session.test.ts apps/backend/src/agent-core/llm-session/index.ts apps/backend/src/agent-core/llm-session/compaction
git commit -m "refactor: delegate llm session compaction"
```

---

### Task 7: Final Verification

**Files:**

- All files touched above.

- [ ] **Step 1: Search boundary violations**

Run:

```bash
rg -n "from './compaction/(?!index)|from './compaction/(compaction|llm-)" apps/backend/src/agent-core/llm-session/llm-session.ts
rg -n "usageBaselineMessageCount" apps/backend/src docs/superpowers/specs/2026-05-15-llm-session-compaction-refactor-design.md
```

Expected: no `LlmSession` compaction-internal imports; old field appears only in the spec rename language, not source.

- [ ] **Step 2: Run focused backend tests**

Run:

```bash
bun --filter '@omnicraft/backend' test src/agent-core/llm-session src/agent-core/agent/agent.test.ts
```

Expected: pass.

- [ ] **Step 3: Run typecheck**

Run:

```bash
bun --filter '@omnicraft/backend' typecheck
```

Expected: pass.

- [ ] **Step 4: Commit final verification cleanup if needed**

If formatting, import cleanup, or test cleanup changes were needed:

```bash
git add apps/backend/src/agent-core/llm-session
git commit -m "test: align compaction refactor coverage"
```

If no files changed, do not create an empty commit.
