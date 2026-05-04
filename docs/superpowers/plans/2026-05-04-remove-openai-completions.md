# Remove OpenAI Completions Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove `apiFormat: "openai"` support completely so OmniCraft only supports Claude and OpenAI Responses.

**Architecture:** The settings schema remains the source of truth for valid LLM API formats. Backend dispatchers and type definitions mirror that narrowed union, and the frontend exposes only the supported choices. The old OpenAI Chat Completions adapter is deleted instead of hidden.

**Tech Stack:** Bun workspaces, TypeScript, Zod, Vitest, React, HeroUI.

---

## File Structure

- Modify `packages/settings-schema/src/llm/schema.ts` to remove `"openai"` from the `apiFormat` enum.
- Modify `packages/settings-schema/src/schema.test.ts` to assert `"openai"` is rejected and `"openai-responses"` is accepted.
- Modify `apps/backend/src/agent-core/llm-api/types.ts` to narrow `LlmConfig.apiFormat`.
- Modify `apps/backend/src/agent-core/llm-api/llm-api.ts` to remove OpenAI Chat Completions imports and switch cases.
- Delete `apps/backend/src/agent-core/llm-api/openai/` because it contains only the old Chat Completions adapter.
- Modify `apps/backend/src/agent-core/model-capacity/model-capacity.ts` and `model-capacity.test.ts` so OpenAI-compatible capacity lookup is tied to `"openai-responses"` only.
- Modify backend tests that use `apiFormat: "openai"` as generic fixtures to use `"openai-responses"`.
- Modify `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx` and `apps/frontend/src/pages/settings/sections/llm/coding/CodingLlmSectionFields.tsx` to remove the OpenAI Completions selector item.

## Task 1: Settings Schema

**Files:**

- Modify: `packages/settings-schema/src/llm/schema.ts`
- Modify: `packages/settings-schema/src/schema.test.ts`

- [ ] **Step 1: Write the failing schema test**

Add this import and test case to `packages/settings-schema/src/schema.test.ts`:

```typescript
import {llmSettingsSchema} from './llm/schema.js';

it('accepts only supported LLM API formats', () => {
  expect(llmSettingsSchema.safeParse({apiFormat: 'claude'}).success).toBe(true);
  expect(
    llmSettingsSchema.safeParse({apiFormat: 'openai-responses'}).success,
  ).toBe(true);
  expect(llmSettingsSchema.safeParse({apiFormat: 'openai'}).success).toBe(
    false,
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun run --filter '@omnicraft/settings-schema' test -- src/schema.test.ts`

Expected: FAIL because `"openai"` is still accepted.

- [ ] **Step 3: Remove `"openai"` from the enum**

Change `packages/settings-schema/src/llm/schema.ts`:

```typescript
apiFormat: z
  .enum(['claude', 'openai-responses'])
  .describe('API protocol format')
  .default('claude'),
```

- [ ] **Step 4: Run settings-schema tests**

Run: `bun run --filter '@omnicraft/settings-schema' test -- src/schema.test.ts`

Expected: PASS.

## Task 2: Backend Dispatch and Types

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/llm-api.ts`
- Modify: `apps/backend/src/agent-core/model-capacity/model-capacity.ts`
- Modify: `apps/backend/src/agent-core/model-capacity/model-capacity.test.ts`
- Modify: backend tests containing `apiFormat: 'openai'`
- Delete: `apps/backend/src/agent-core/llm-api/openai/helpers.ts`
- Delete: `apps/backend/src/agent-core/llm-api/openai/index.ts`
- Delete: `apps/backend/src/agent-core/llm-api/openai/stream.ts`
- Delete: `apps/backend/src/agent-core/llm-api/openai/token-count.ts`

- [ ] **Step 1: Run search to capture current backend references**

Run: `rg -n "apiFormat: 'openai'|streamOpenAI|countOpenAITokens|case 'openai'|from './openai" apps/backend/src`

Expected: matches in backend dispatch, the old adapter directory, and test fixtures. These are the references removed in the following steps.

- [ ] **Step 2: Narrow `LlmConfig.apiFormat`**

Change `apps/backend/src/agent-core/llm-api/types.ts`:

```typescript
export interface LlmConfig {
  apiFormat: 'claude' | 'openai-responses';
  apiKey: string;
  baseUrl: string;
  model: string;
}
```

- [ ] **Step 3: Remove OpenAI Chat Completions dispatch**

Change `apps/backend/src/agent-core/llm-api/llm-api.ts` so it imports only Claude and OpenAI Responses adapters:

```typescript
import {countClaudeTokens, streamClaude} from './claude/index.js';
import {
  countOpenAIResponsesTokens,
  streamOpenAIResponses,
} from './openai-responses/index.js';
```

The two switches should contain only these cases:

```typescript
case 'claude':
  return streamClaude(options);
case 'openai-responses':
  return streamOpenAIResponses(options);
```

and

```typescript
case 'claude':
  return countClaudeTokens(options);
case 'openai-responses':
  return countOpenAIResponsesTokens(options);
```

- [ ] **Step 4: Remove OpenAI Chat Completions model-capacity branch**

Change both switches in `apps/backend/src/agent-core/model-capacity/model-capacity.ts` so the OpenAI capacity helpers are used only for `"openai-responses"`:

```typescript
case 'openai-responses':
  return getOpenAIMaxOutputTokens(config);
```

and

```typescript
case 'openai-responses':
  return getOpenAIMaxInputTokens(config);
```

- [ ] **Step 5: Update backend fixture formats**

Replace generic backend test fixtures using `apiFormat: 'openai'` with `apiFormat: 'openai-responses'` in these files:

```text
apps/backend/src/agent-core/agent/agent.test.ts
apps/backend/src/agent-core/llm-session/llm-session.test.ts
apps/backend/src/agent-core/llm-session/compaction/summary.test.ts
apps/backend/src/agent-core/llm-session/types.test.ts
apps/backend/src/agent-core/model-capacity/model-capacity.test.ts
```

Also update model-capacity test names that say `OpenAI path` to `OpenAI Responses path` where that improves accuracy.

- [ ] **Step 6: Delete the old adapter directory**

Remove these files:

```text
apps/backend/src/agent-core/llm-api/openai/helpers.ts
apps/backend/src/agent-core/llm-api/openai/index.ts
apps/backend/src/agent-core/llm-api/openai/stream.ts
apps/backend/src/agent-core/llm-api/openai/token-count.ts
```

- [ ] **Step 7: Verify backend typecheck and targeted tests**

Run: `bun run --filter '@omnicraft/backend' typecheck`

Expected: PASS.

Run: `bun run --filter '@omnicraft/backend' test -- src/agent-core/model-capacity/model-capacity.test.ts src/agent-core/llm-session/llm-session.test.ts src/agent-core/agent/agent.test.ts src/agent-core/llm-session/compaction/summary.test.ts src/agent-core/llm-session/types.test.ts`

Expected: PASS.

## Task 3: Frontend Settings UI

**Files:**

- Modify: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/llm/coding/CodingLlmSectionFields.tsx`

- [ ] **Step 1: Run frontend typecheck/build before UI edit**

Run: `bun run --filter '@omnicraft/frontend' build`

Expected: may PASS before the edit; it establishes the baseline for the UI-only change.

- [ ] **Step 2: Remove the OpenAI Completions selector item**

Delete this block from both files:

```tsx
<ListBox.Item id='openai' textValue='OpenAI Completions'>
  OpenAI Completions
  <ListBox.ItemIndicator />
</ListBox.Item>
```

- [ ] **Step 3: Verify frontend build**

Run: `bun run --filter '@omnicraft/frontend' build`

Expected: PASS.

## Task 4: Global Cleanup and Verification

**Files:**

- Inspect all repository files with search commands.
- Modify only files with live references to deleted support.

- [ ] **Step 1: Search for old API format support**

Run: `rg -n "apiFormat: 'openai'|apiFormat: \"openai\"|id='openai'|OpenAI Completions|streamOpenAI|countOpenAITokens|chat\.completions|llm-api/openai|from './openai" apps packages`

Expected: no live source references. Historical docs may still contain mentions if the search includes `docs/`; this command intentionally excludes docs.

- [ ] **Step 2: Run package verification**

Run: `bun run --filter '@omnicraft/settings-schema' typecheck`

Expected: PASS.

Run: `bun run --filter '@omnicraft/settings-schema' test`

Expected: PASS.

Run: `bun run --filter '@omnicraft/backend' typecheck`

Expected: PASS.

Run: `bun run --filter '@omnicraft/backend' test`

Expected: PASS.

Run: `bun run --filter '@omnicraft/frontend' build`

Expected: PASS.

- [ ] **Step 3: Commit implementation**

Run:

```bash
git add packages/settings-schema/src/llm/schema.ts \
  packages/settings-schema/src/schema.test.ts \
  apps/backend/src/agent-core/llm-api/types.ts \
  apps/backend/src/agent-core/llm-api/llm-api.ts \
  apps/backend/src/agent-core/llm-api/openai \
  apps/backend/src/agent-core/model-capacity/model-capacity.ts \
  apps/backend/src/agent-core/model-capacity/model-capacity.test.ts \
  apps/backend/src/agent-core/agent/agent.test.ts \
  apps/backend/src/agent-core/llm-session/llm-session.test.ts \
  apps/backend/src/agent-core/llm-session/compaction/summary.test.ts \
  apps/backend/src/agent-core/llm-session/types.test.ts \
  apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx \
  apps/frontend/src/pages/settings/sections/llm/coding/CodingLlmSectionFields.tsx
git commit -m "refactor: remove openai completions support"
```

Expected: commit succeeds after lint-staged formatting.

## Self-Review

- Spec coverage: schema narrowing, backend dispatch removal, adapter deletion, model-capacity cleanup, UI removal, no migration behavior, and verification are covered.
- Placeholder scan: no red-flag placeholder text or unspecified test steps.
- Type consistency: the only surviving OpenAI format is consistently named `"openai-responses"` across schema, backend types, tests, and UI.
