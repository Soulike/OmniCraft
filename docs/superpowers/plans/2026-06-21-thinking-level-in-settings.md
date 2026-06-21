# Thinking Level in Settings (Unified Cross-API Scale) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move thinking-level selection out of the chat composer / coding card into LLM Settings, widen the enum to the 7-value union of both providers' native effort scales, and read it live from settings on every LLM call.

**Architecture:** The canonical `thinkingLevelSchema`/`ThinkingLevel` moves from `api-schema` to `settings-schema` (widened to 7 values), and `api-schema` re-exports it so all existing imports keep working. Thinking level becomes a field on `LlmConfig` (read live from settings via `getLlmConfig()` and the agents' `getConfig` closures), so it no longer threads through agent constructors, the turn runner, llm-session, token-count, compaction, or usage-reporter as a separate parameter. Provider helpers map+clamp the unified scale to each SDK's native effort at the boundary. `dispatch_agent` keeps an agent-controlled `thinkingLevel` param (default `none`) that overrides the subagent's config.

**Tech Stack:** Bun (package manager + runtime; use Node APIs in code), TypeScript, Zod v4, Koa backend, React + Vite frontend, HeroUI, Vitest.

## Global Constraints

- Package manager / runner: **Bun**. Use `bun run --filter '<pkg>' <script>` to run per-package scripts. **Never** `bun test` — use `bun run --filter '<pkg>' test` (Vitest). Frontend tests: `bun run --filter '@omnicraft/frontend' test`.
- In code use Node.js APIs only (`node:*`), never Bun-specific APIs.
- Never use `any`; use `unknown` + narrowing. No non-null `!`; use `assert` from `node:assert`.
- Backend: no default exports; no `console`; relative imports use `.js`; `@/*` alias for cross-module; early-return style.
- Frontend: one React component per file; MVVM (View is stateless, state in hooks); CSS Modules only (no Tailwind in our components); import a component only via its `index.ts`; validate UI changes in a real browser in **both** light and dark themes.
- The unified scale, ordered: `none < minimal < low < medium < high < xhigh < max`.
- Provider mapping (verified against installed SDKs — Anthropic `OutputConfig.effort: 'low'|'medium'|'high'|'xhigh'|'max'|null`, OpenAI `ReasoningEffort: 'none'|'minimal'|'low'|'medium'|'high'|'xhigh'`):

  | Unified | Claude `toThinkingConfig` | Claude `toOutputConfig` | OpenAI `toReasoning` effort |
  | ------- | ------------------------- | ----------------------- | --------------------------- |
  | none    | `{type:'disabled'}`       | `undefined`             | `undefined`                 |
  | minimal | `{type:'adaptive'}`       | `{effort:'low'}`        | `minimal`                   |
  | low     | `{type:'adaptive'}`       | `{effort:'low'}`        | `low`                       |
  | medium  | `{type:'adaptive'}`       | `{effort:'medium'}`     | `medium`                    |
  | high    | `{type:'adaptive'}`       | `{effort:'high'}`       | `high`                      |
  | xhigh   | `{type:'adaptive'}`       | `{effort:'xhigh'}`      | `xhigh`                     |
  | max     | `{type:'adaptive'}`       | `{effort:'max'}`        | `xhigh`                     |

- Conventional Commits for messages (`feat:`, `refactor:`, `test:`, etc.).

---

## File Structure

**Schema packages**

- `packages/settings-schema/src/llm/schema.ts` — gains the canonical `thinkingLevelSchema` (7-value) + `ThinkingLevel` type, and a `thinkingLevel` field on `llmSettingsSchema`. New owner of the enum.
- `packages/settings-schema/src/index.ts` — re-exports `thinkingLevelSchema`, `ThinkingLevel`, and `llmSettingsSchema` so other packages can import them.
- `packages/api-schema/src/chat/schema.ts` — drops the local enum; drops `thinkingLevel` from both create-session request schemas.
- `packages/api-schema/src/index.ts` — re-exports `thinkingLevelSchema`/`ThinkingLevel` from `@omnicraft/settings-schema` (keeps every existing `@omnicraft/api-schema` import compiling).

**Backend — provider boundary**

- `apps/backend/src/agent-core/llm-api/types.ts` — `LlmConfig` gains `thinkingLevel`; `LlmCompletionOptions`/`LlmTokenCountOptions` drop the standalone `thinkingLevel`.
- `apps/backend/src/agent-core/llm-api/claude/helpers.ts` — `toThinkingConfig`/`toOutputConfig` widened to 7 values (removes `xhigh→max` hack).
- `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts` — new mapping tests.
- `apps/backend/src/agent-core/llm-api/claude/stream.ts` + `token-count.ts` — read `options.config.thinkingLevel`.
- `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts` — `toReasoning` widened; `max→xhigh`, `minimal→minimal`.
- `apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts` — **new** test file.
- `apps/backend/src/agent-core/llm-api/openai-responses/stream.ts` + `token-count.ts` — read `options.config.thinkingLevel`.

**Backend — config source**

- `apps/backend/src/services/agent-session/helpers.ts` — `getLlmConfig()` includes `thinkingLevel`.
- `apps/backend/src/agent/agents/main-agent/main-agent.ts` + `coding-agent/coding-agent.ts` — `getConfig`/`getLightConfig` closures include `thinkingLevel`; drop constructor param.

**Backend — threading removal**

- `apps/backend/src/agent-core/agent/types.ts`, `agent.ts`, `agent-turn-runner.ts`, `agent-usage-reporter.ts` — drop the threaded `thinkingLevel`; usage-reporter sources it from config.
- `apps/backend/src/agent-core/llm-session/types.ts`, `llm-session.ts`, `compaction/*` — drop the threaded `thinkingLevel`.
- `apps/backend/src/dispatcher/agent-session/router.ts`, `services/agent-session/agent-session-service.ts` — drop the request-parsed `thinkingLevel`.

**Backend — subagents (agent-controlled)**

- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` — keeps a 7-value `thinkingLevel` param (default `none`), now applied by wrapping the subagent `getConfig`.
- `apps/backend/src/agent/agents/explore-sub-agent/*` + `general-sub-agent/*` — drop the constructor param.
- `apps/backend/src/agent-core/agent/state/subagent-registry.ts` — registry entry/handle carry `thinkingLevel` (so the resume SSE event still has it, replacing the removed `agent.getThinkingLevel()`).
- `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts` — read level from the handle, not the agent.

**Frontend**

- `apps/frontend/src/modules/chat-session/constants.ts` — extend `THINKING_LEVEL_LABELS` to 7 values; import `ThinkingLevel` from `@omnicraft/settings-schema` (still consumed by `UsageInfoView`).
- `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/` — **deleted** (chat composer no longer has it).
- `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/*`, `SessionIdContext/SessionIdProvider.tsx` — drop `thinkingLevel`.
- `apps/frontend/src/modules/chat-session/components/ChatInput/*` — drop the selector.
- `apps/frontend/src/pages/coding/components/TaskDispatchCard/*` — drop the selector + form field.
- `apps/frontend/src/api/agent-session/agent-session.ts` — drop `thinkingLevel` from `CreateSessionOptions` + body.
- `apps/frontend/src/pages/settings/sections/llm/chat/*` + `coding/*` — add a "Thinking level" `Select` + FIELDS entry.

---

### Task 1: Move + widen the thinking-level enum to `settings-schema`

Establishes the single 7-value source of truth and re-exports it from `api-schema` so nothing else breaks yet.

**Files:**

- Modify: `packages/settings-schema/src/llm/schema.ts`
- Modify: `packages/settings-schema/src/index.ts`
- Modify: `packages/api-schema/src/chat/schema.ts`
- Modify: `packages/api-schema/src/index.ts`
- Test: `packages/settings-schema/src/schema.test.ts` (existing JSON-schema test must still pass)

**Interfaces:**

- Produces: `thinkingLevelSchema = z.enum(['none','minimal','low','medium','high','xhigh','max'])` and `type ThinkingLevel`, exported from `@omnicraft/settings-schema` AND re-exported from `@omnicraft/api-schema` (same import paths as today). Also exports `llmSettingsSchema` from `@omnicraft/settings-schema`.

- [ ] **Step 1: Add the widened enum to `settings-schema/src/llm/schema.ts`**

At the top of the file (after the `import {z} from 'zod';` line), add:

```typescript
/** Thinking/reasoning level for models that support extended thinking. */
export const thinkingLevelSchema = z.enum([
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
]);

export type ThinkingLevel = z.infer<typeof thinkingLevelSchema>;
```

(The `thinkingLevel` _field_ is added to `llmSettingsSchema` in Task 2 — this step only introduces the enum + type so downstream re-exports work.)

- [ ] **Step 2: Re-export the enum + `llmSettingsSchema` from `settings-schema/src/index.ts`**

Add to `packages/settings-schema/src/index.ts`:

```typescript
export {
  llmSettingsSchema,
  type ThinkingLevel,
  thinkingLevelSchema,
} from './llm/schema.js';
```

Keep existing exports. Maintain alphabetical export-name order if the file already enforces it.

- [ ] **Step 3: Point `api-schema` at the new owner**

In `packages/api-schema/src/chat/schema.ts`, DELETE the local enum + type (the `thinkingLevelSchema` const and `ThinkingLevel` type, lines 5–14), and add an import at the top:

```typescript
import {thinkingLevelSchema} from '@omnicraft/settings-schema';
```

Keep `thinkingLevelSchema` referenced by the two create-session request schemas **for now** (they are stripped in Task 9). The file no longer declares `ThinkingLevel`.

- [ ] **Step 4: Re-export `ThinkingLevel`/`thinkingLevelSchema` from `api-schema/src/index.ts`**

In `packages/api-schema/src/index.ts`, the `./chat/schema.js` export block currently lists `type ThinkingLevel` and `thinkingLevelSchema`. REMOVE those two names from that block, and add a new re-export from settings-schema:

```typescript
export {
  type ThinkingLevel,
  thinkingLevelSchema,
} from '@omnicraft/settings-schema';
```

This keeps `import {ThinkingLevel, thinkingLevelSchema} from '@omnicraft/api-schema'` working everywhere.

- [ ] **Step 5: Typecheck both schema packages**

Run: `bun run --filter '@omnicraft/settings-schema' typecheck && bun run --filter '@omnicraft/api-schema' typecheck`
Expected: PASS (no type errors).

- [ ] **Step 6: Run schema tests**

Run: `bun run --filter '@omnicraft/settings-schema' test && bun run --filter '@omnicraft/api-schema' test`
Expected: PASS. The existing `z.toJSONSchema(settingsSchema)` test still passes (enum is JSON-schema-convertible). The api-schema `chat/schema.test.ts` still passes (it asserts `thinkingLevel: 'high'|'none'|'medium'` on the create-session schemas, all still valid members).

- [ ] **Step 7: Commit**

```bash
git add packages/settings-schema packages/api-schema
git commit -m "refactor: move thinking-level enum to settings-schema and widen to 7 values"
```

---

### Task 2: Add `thinkingLevel` field to `llmSettingsSchema`

Makes Chat and Coding each carry an independent, persisted thinking level.

**Files:**

- Modify: `packages/settings-schema/src/llm/schema.ts`
- Test: `packages/settings-schema/src/schema.test.ts`

**Interfaces:**

- Consumes: `thinkingLevelSchema` (Task 1).
- Produces: `settingsSchema.shape.llm` / `.codingLlm` each have a `thinkingLevel` field defaulting to `'none'`. Field paths `llm/thinkingLevel` and `codingLlm/thinkingLevel` become valid.

- [ ] **Step 1: Write a failing test for the new field + default**

Append to `packages/settings-schema/src/schema.test.ts`:

```typescript
import {settingsSchema as schemaForDefaults} from './schema.js';

describe('llm.thinkingLevel', () => {
  it('defaults to none for both llm and codingLlm', () => {
    const parsed = schemaForDefaults.parse({});
    expect(parsed.llm.thinkingLevel).toBe('none');
    expect(parsed.codingLlm.thinkingLevel).toBe('none');
  });

  it('accepts the widened union members', () => {
    const parsed = schemaForDefaults.parse({
      llm: {thinkingLevel: 'minimal'},
      codingLlm: {thinkingLevel: 'max'},
    });
    expect(parsed.llm.thinkingLevel).toBe('minimal');
    expect(parsed.codingLlm.thinkingLevel).toBe('max');
  });
});
```

(If `settingsSchema` is already imported at the top of the file, reuse that import instead of the aliased one.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `bun run --filter '@omnicraft/settings-schema' test`
Expected: FAIL — `thinkingLevel` is `undefined` (field not yet added).

- [ ] **Step 3: Add the field to `llmSettingsSchema`**

In `packages/settings-schema/src/llm/schema.ts`, add to the `z.object({...})` passed to `llmSettingsSchema` (after `lightModel`):

```typescript
  thinkingLevel: thinkingLevelSchema
    .describe('Extended-thinking effort level for this agent')
    .default('none'),
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `bun run --filter '@omnicraft/settings-schema' test`
Expected: PASS (including the existing `z.toJSONSchema()` tests).

- [ ] **Step 5: Commit**

```bash
git add packages/settings-schema
git commit -m "feat: add thinkingLevel field to llm settings schema"
```

---

### Task 3: Widen Claude provider mapping (remove the `xhigh→max` hack)

The Anthropic SDK natively supports `xhigh` and `max` on `OutputConfig.effort`, so the unified scale maps 1:1 for the shared levels and `minimal → low`.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/claude/helpers.ts`
- Test: `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts`

**Interfaces:**

- Consumes: `ThinkingLevel` (7-value, from `@omnicraft/api-schema`).
- Produces: `toThinkingConfig(level)` and `toOutputConfig(level)` covering all 7 members (signatures unchanged).

- [ ] **Step 1: Add failing mapping tests**

Append to `apps/backend/src/agent-core/llm-api/claude/helpers.test.ts` (and extend the top import to `import {addCacheBreakpoint, toOutputConfig, toThinkingConfig} from './helpers.js';`):

```typescript
describe('toThinkingConfig', () => {
  it('disables thinking only for none', () => {
    expect(toThinkingConfig('none')).toEqual({type: 'disabled'});
    for (const level of [
      'minimal',
      'low',
      'medium',
      'high',
      'xhigh',
      'max',
    ] as const) {
      expect(toThinkingConfig(level)).toEqual({type: 'adaptive'});
    }
  });
});

describe('toOutputConfig', () => {
  it('returns undefined for none', () => {
    expect(toOutputConfig('none')).toBeUndefined();
  });

  it('clamps minimal to low', () => {
    expect(toOutputConfig('minimal')).toEqual({effort: 'low'});
  });

  it('maps shared levels 1:1 and preserves xhigh and max', () => {
    expect(toOutputConfig('low')).toEqual({effort: 'low'});
    expect(toOutputConfig('medium')).toEqual({effort: 'medium'});
    expect(toOutputConfig('high')).toEqual({effort: 'high'});
    expect(toOutputConfig('xhigh')).toEqual({effort: 'xhigh'});
    expect(toOutputConfig('max')).toEqual({effort: 'max'});
  });
});
```

- [ ] **Step 2: Run tests to verify the `minimal`/`xhigh` cases fail**

Run: `bun run --filter '@omnicraft/backend' test -- claude/helpers.test.ts`
Expected: FAIL — `toOutputConfig('minimal')` currently returns `{effort:'minimal'}` (invalid) and `toOutputConfig('xhigh')` returns `{effort:'max'}` (the hack).

- [ ] **Step 3: Rewrite `toOutputConfig`**

Replace the body of `toOutputConfig` in `apps/backend/src/agent-core/llm-api/claude/helpers.ts`:

```typescript
export function toOutputConfig(
  level: ThinkingLevel,
): Anthropic.OutputConfig | undefined {
  if (level === 'none') return undefined;
  if (level === 'minimal') return {effort: 'low'};
  return {effort: level};
}
```

`toThinkingConfig` needs no change (`none → disabled`, everything else `adaptive`) — it already handles all 7 members correctly.

- [ ] **Step 4: Run tests to verify they pass**

Run: `bun run --filter '@omnicraft/backend' test -- claude/helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/claude/helpers.ts apps/backend/src/agent-core/llm-api/claude/helpers.test.ts
git commit -m "feat: map unified thinking level to Claude native effort without clamping xhigh"
```

---

### Task 4: Widen OpenAI provider mapping + add test coverage

OpenAI `ReasoningEffort` supports `minimal` but not `max`; `max` clamps to `xhigh`.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts`
- Create: `apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts`

**Interfaces:**

- Consumes: `ThinkingLevel` (7-value).
- Produces: `toReasoning(level)` returning `{effort: 'minimal'|'low'|'medium'|'high'|'xhigh'; summary: 'auto'} | undefined`.

- [ ] **Step 1: Write the new test file**

Create `apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts`:

```typescript
import {describe, expect, it} from 'vitest';

import {toReasoning} from './helpers.js';

describe('toReasoning', () => {
  it('returns undefined for none', () => {
    expect(toReasoning('none')).toBeUndefined();
  });

  it('maps minimal and shared levels 1:1', () => {
    expect(toReasoning('minimal')).toEqual({
      effort: 'minimal',
      summary: 'auto',
    });
    expect(toReasoning('low')).toEqual({effort: 'low', summary: 'auto'});
    expect(toReasoning('medium')).toEqual({effort: 'medium', summary: 'auto'});
    expect(toReasoning('high')).toEqual({effort: 'high', summary: 'auto'});
    expect(toReasoning('xhigh')).toEqual({effort: 'xhigh', summary: 'auto'});
  });

  it('clamps max to xhigh', () => {
    expect(toReasoning('max')).toEqual({effort: 'xhigh', summary: 'auto'});
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `bun run --filter '@omnicraft/backend' test -- openai-responses/helpers.test.ts`
Expected: FAIL — `toReasoning('max')` currently returns `{effort:'max', ...}` (invalid for OpenAI) and the return type doesn't allow `'minimal'`.

- [ ] **Step 3: Rewrite `toReasoning`**

Replace `toReasoning` in `apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts`:

```typescript
/** Maps a ThinkingLevel to the OpenAI Reasoning config. */
export function toReasoning(
  level: ThinkingLevel,
):
  | {effort: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh'; summary: 'auto'}
  | undefined {
  if (level === 'none') return undefined;
  if (level === 'max') return {effort: 'xhigh', summary: 'auto'};
  return {effort: level, summary: 'auto'};
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `bun run --filter '@omnicraft/backend' test -- openai-responses/helpers.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent-core/llm-api/openai-responses/helpers.ts apps/backend/src/agent-core/llm-api/openai-responses/helpers.test.ts
git commit -m "feat: map unified thinking level to OpenAI reasoning effort"
```

---

### Task 5: Add `thinkingLevel` to `LlmConfig`; provider call sites read from config

Moves the value onto the config object so the provider boundary stops taking a separate `thinkingLevel` option.

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/stream.ts:50-51`
- Modify: `apps/backend/src/agent-core/llm-api/claude/token-count.ts:22,30`
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/stream.ts:26`
- Modify: `apps/backend/src/agent-core/llm-api/openai-responses/token-count.ts:17`

**Interfaces:**

- Produces: `LlmConfig` gains `readonly thinkingLevel: ThinkingLevel;`. `LlmCompletionOptions` and `LlmTokenCountOptions` no longer declare a top-level `thinkingLevel` (it now lives under `config`).

> NOTE: This task makes the codebase temporarily not compile (many sites still pass `thinkingLevel` as a sibling of `config`). Tasks 6–9 fix every remaining site; run the full backend typecheck only at the end of Task 9. Within this task, just make the edits below — do not run a global typecheck between steps.

- [ ] **Step 1: Edit `LlmConfig` and the options types**

In `apps/backend/src/agent-core/llm-api/types.ts`:

- Add to the `LlmConfig` interface (after `model: string;`): `readonly thinkingLevel: ThinkingLevel;`
- Remove the `readonly thinkingLevel: ThinkingLevel;` line from `LlmCompletionOptions`.
- Keep `export type LlmTokenCountOptions = Omit<LlmCompletionOptions, 'signal'>;` as-is (it inherits the removal automatically).
- Keep the `import type {ThinkingLevel} from '@omnicraft/api-schema';` line (still used by `LlmConfig`).

- [ ] **Step 2: Update Claude stream call site**

In `apps/backend/src/agent-core/llm-api/claude/stream.ts`, change lines 50–51 to read from `options.config`:

```typescript
const thinking = toThinkingConfig(options.config.thinkingLevel);
const outputConfig = toOutputConfig(options.config.thinkingLevel);
```

- [ ] **Step 3: Update Claude token-count call site**

In `apps/backend/src/agent-core/llm-api/claude/token-count.ts`, change lines 22 and 30:

```typescript
const outputConfig = toOutputConfig(options.config.thinkingLevel);
```

```typescript
    thinking: toThinkingConfig(options.config.thinkingLevel),
```

- [ ] **Step 4: Update OpenAI stream + token-count call sites**

In `apps/backend/src/agent-core/llm-api/openai-responses/stream.ts:26`:

```typescript
const reasoning = toReasoning(options.config.thinkingLevel);
```

In `apps/backend/src/agent-core/llm-api/openai-responses/token-count.ts:17`:

```typescript
const reasoning = toReasoning(options.config.thinkingLevel);
```

- [ ] **Step 5: Commit (compile deferred to Task 9)**

```bash
git add apps/backend/src/agent-core/llm-api
git commit -m "refactor: source thinking level from LlmConfig at the provider boundary"
```

---

### Task 6: Config sources include `thinkingLevel` (live read)

`getLlmConfig()` and both agents' `getConfig`/`getLightConfig` closures now read `thinkingLevel` from the relevant settings section, so every LLM call picks up the current value.

**Files:**

- Modify: `apps/backend/src/services/agent-session/helpers.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`

**Interfaces:**

- Consumes: `LlmConfig.thinkingLevel` (Task 5), `settings.llm.thinkingLevel` / `settings.codingLlm.thinkingLevel` (Task 2).
- Produces: every `LlmConfig` returned by these closures includes `thinkingLevel`. (The constructor `thinkingLevel` params are removed in Task 9, after the threading is gone.)

- [ ] **Step 1: `getLlmConfig()` includes thinkingLevel**

In `apps/backend/src/services/agent-session/helpers.ts`, change the destructure + return:

```typescript
const {apiFormat, apiKey, baseUrl, model, thinkingLevel} = llmSettings;
return {apiFormat, apiKey, baseUrl, model, thinkingLevel};
```

- [ ] **Step 2: MainAgent closures include thinkingLevel**

In `apps/backend/src/agent/agents/main-agent/main-agent.ts`, update the two closures (the `super(...)` first arg and `getLightConfig`):

```typescript
      async () => {
        const settings = await settingsService.getAll();
        const {apiFormat, apiKey, baseUrl, model, thinkingLevel} = settings.llm;
        return {apiFormat, apiKey, baseUrl, model, thinkingLevel};
      },
```

```typescript
        getLightConfig: async () => {
          const settings = await settingsService.getAll();
          const {apiFormat, apiKey, baseUrl, model, lightModel, thinkingLevel} =
            settings.llm;
          return {
            apiFormat,
            apiKey,
            baseUrl,
            model: lightModel || model,
            thinkingLevel,
          };
        },
```

- [ ] **Step 3: CodingAgent closures include thinkingLevel**

Apply the identical change in `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`, reading from `settings.codingLlm` instead of `settings.llm`.

- [ ] **Step 4: Commit (compile still deferred — verified in Task 9)**

```bash
git add apps/backend/src/services/agent-session/helpers.ts apps/backend/src/agent/agents/main-agent apps/backend/src/agent/agents/coding-agent
git commit -m "feat: read thinking level live from settings in agent config closures"
```

---

### Task 7: Remove `thinkingLevel` threading through agent-core

Drops the standalone `thinkingLevel` parameter from the Agent class, turn runner, llm-session, compaction, and usage-reporter. Each of these now relies on `LlmConfig.thinkingLevel` (provider boundary) and no longer needs the value passed in.

**Files:**

- Modify: `apps/backend/src/agent-core/agent/types.ts`
- Modify: `apps/backend/src/agent-core/agent/agent.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts`
- Modify: `apps/backend/src/agent-core/agent/agent-usage-reporter.ts`
- Modify: `apps/backend/src/agent-core/llm-session/types.ts`
- Modify: `apps/backend/src/agent-core/llm-session/llm-session.ts`
- Modify: `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-token-estimator.ts`

**Interfaces:**

- Produces: `AgentOptions` no longer has `thinkingLevel`; `AgentSnapshot.options` no longer has `thinkingLevel`; `LlmSession` send methods, `LlmCompactionOptions`, and `RunAgentTurnInput` no longer carry it; `BuildAgentUsageInput.thinkingLevel` removed (sourced from `config`); `Agent.getThinkingLevel()` removed.

> NOTE: Still part of the deferred-compile window. Do not run a full backend typecheck until Task 9.

- [ ] **Step 1: `agent/types.ts` — drop from options + snapshot schema**

In `apps/backend/src/agent-core/agent/types.ts`:

- Remove `thinkingLevel: thinkingLevelSchema,` from `agentSnapshotOptionsSchema`.
- Remove `readonly thinkingLevel: ThinkingLevel;` from `AgentOptions`.
- Remove now-unused imports: `type ThinkingLevel` and `thinkingLevelSchema` from the `@omnicraft/api-schema` import (keep `agentIdSchema`).

- [ ] **Step 2: `agent.ts` — remove field, assertion, getter, snapshot, threading**

In `apps/backend/src/agent-core/agent/agent.ts`:

- Delete the `private readonly thinkingLevel: ThinkingLevel;` field (line ~60).
- In the snapshot branch, delete the `assert(Object.hasOwn(snapshot.options, 'thinkingLevel'), ...)` block and the `this.thinkingLevel = snapshot.options.thinkingLevel;` line.
- In the non-snapshot branch, delete `this.thinkingLevel = options.thinkingLevel;`.
- Delete the `getThinkingLevel()` method.
- In `toSnapshot()`, remove `thinkingLevel: this.thinkingLevel,` from `options` (leaving `{workingDirectory: this.workingDirectory}`).
- In `runTurn()`, delete `const thinkingLevel = this.thinkingLevel;` and remove the `thinkingLevel` argument from the `this.runAgentLoop(userMessage, thinkingLevel, signal)` call → `this.runAgentLoop(userMessage, this.abortController.signal)`.
- Change `runAgentLoop(userMessage, thinkingLevel, signal)` signature to `runAgentLoop(userMessage, signal)` and remove `thinkingLevel` from the `agentTurnRunner.run({...})` payload.
- Change `compactAfterTurn(tools, systemPrompt, thinkingLevel)` to `compactAfterTurn(tools, systemPrompt)`; remove `thinkingLevel` from the `this.llmSession.compactIfNeeded({...})` argument.
- Update the `compactAfterTurn` callback passed in `run({...})` to `(tools, systemPrompt) => this.compactAfterTurn(tools, systemPrompt)`.
- Remove the now-unused `import type {ThinkingLevel} from '@omnicraft/api-schema';` and the `assert` import if it becomes unused (check for other `assert` uses first; keep if still used).

- [ ] **Step 3: `agent-turn-runner.ts` — drop from input + calls**

In `apps/backend/src/agent-core/agent/agent-turn-runner.ts`:

- Remove `readonly thinkingLevel: ThinkingLevel;` from `RunAgentTurnInput`.
- Change the `compactAfterTurn` field type to `(tools: readonly ToolDefinition[], systemPrompt: string) => Promise<void>`.
- Remove `input.thinkingLevel` argument from the `llmSession.sendUserMessage(...)` / `sendReminder(...)` / `submitToolResults(...)` calls (whichever appear — drop the `thinkingLevel` positional arg so `signal` follows `systemPrompt` directly).
- Change `input.compactAfterTurn(tools, systemPrompt, input.thinkingLevel)` → `input.compactAfterTurn(tools, systemPrompt)`.
- Remove the now-unused `import type {ThinkingLevel} from '@omnicraft/api-schema';`.

- [ ] **Step 4: `agent-usage-reporter.ts` — source from config**

In `apps/backend/src/agent-core/agent/agent-usage-reporter.ts`:

- Remove `readonly thinkingLevel: ThinkingLevel;` from `BuildAgentUsageInput`.
- In `buildUsage`, change `thinkingLevel: input.thinkingLevel,` → `thinkingLevel: config.thinkingLevel,`.
- Remove the now-unused `import type {ThinkingLevel} from '@omnicraft/api-schema';`.

- [ ] **Step 5: `llm-session/types.ts` — drop from compaction options**

In `apps/backend/src/agent-core/llm-session/types.ts`, remove `readonly thinkingLevel: ThinkingLevel;` from `LlmCompactionOptions` and the now-unused `ThinkingLevel` import.

- [ ] **Step 6: `llm-session.ts` — drop the parameter from every method**

In `apps/backend/src/agent-core/llm-session/llm-session.ts`, remove the `thinkingLevel: ThinkingLevel` parameter (and every forwarded `thinkingLevel` argument) from: `sendUserMessage`, `sendReminder`, `submitToolResults`, `sendMessages`, `compactBeforeModelCall`, `streamCompletion`, and the `compactIfNeeded`/`compactIfNeededUnlocked` option objects. After this, `streamCompletion` builds the `llmApi.streamCompletion({config, messages, systemPrompt, tools, signal})` call with no top-level `thinkingLevel` (the value rides on `config`). Remove the now-unused `ThinkingLevel` import.

- [ ] **Step 7: compaction estimator — drop vestigial thinkingLevel**

In `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-token-estimator.ts`, remove the `thinkingLevel: options.thinkingLevel,` line from the `estimatePromptTokens({...})` call (the estimator serializes to a char count; `thinkingLevel` contributed nothing meaningful, and `LlmCompactionOptions` no longer has it).

- [ ] **Step 8: Commit (compile verified in Task 9)**

```bash
git add apps/backend/src/agent-core
git commit -m "refactor: remove thinkingLevel threading from agent core"
```

---

### Task 8: Subagent dispatch is agent-controlled via config override; registry carries the level

`dispatch_agent` keeps its `thinkingLevel` param (default `none`, widened enum) but now applies it by wrapping the chosen `getConfig` so the subagent's `LlmConfig.thinkingLevel` is the chosen value. The subagent classes drop their `thinkingLevel` constructor param. The registry stores the chosen level so `resume_agent`'s SSE event can read it (the removed `agent.getThinkingLevel()`).

**Files:**

- Modify: `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts`
- Modify: `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts`
- Modify: `apps/backend/src/agent-core/agent/state/subagent-registry.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`

**Interfaces:**

- Consumes: `LlmConfig.thinkingLevel` (Task 5).
- Produces: `SubagentRegistry.register(agent, agentType, nickname, thinkingLevel)`; `LiveSubagentHandle.thinkingLevel: ThinkingLevel`; `createSubAgent(agentType, getConfig, workingDirectory, sessionsDir?)` (no `thinkingLevel` param — config is pre-wrapped); subagent constructors `(getConfig, workingDirectory, sessionsDir?)`.

- [ ] **Step 1: Drop the constructor param from both subagent classes**

In `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` and `general-sub-agent/general-sub-agent.ts`:

- Remove the `thinkingLevel: ThinkingLevel,` constructor parameter.
- Remove `thinkingLevel,` from the `super(getConfig, {...})` options object.
- Remove the now-unused `import type {ThinkingLevel} from '@omnicraft/api-schema';`.

- [ ] **Step 2: Registry stores thinkingLevel**

In `apps/backend/src/agent-core/agent/state/subagent-registry.ts`:

- Add `import {type SubAgentType, subAgentTypeSchema, type ThinkingLevel} from '@omnicraft/api-schema';` (extend the existing import — `ThinkingLevel` is re-exported from api-schema).
- Add `readonly thinkingLevel: ThinkingLevel;` to `LiveSubagentRegistryEntry` and `LiveSubagentHandle`.
- Change `register(agent, agentType, nickname)` → `register(agent, agentType, nickname, thinkingLevel: ThinkingLevel)`, and store `thinkingLevel` in the `records.set(...)` entry.
- Add `thinkingLevel: entry.thinkingLevel,` to the objects returned by `get()` and `getByNickname()`.

- [ ] **Step 3: Failing test for the registry handle**

Add to `apps/backend/src/agent-core/agent/state/subagent-registry.test.ts` a test that registers with a level and reads it back:

```typescript
it('exposes the registered thinking level on the handle', () => {
  const registry = new SubagentRegistry();
  const agent = makeFakeAgent('agent-1'); // reuse this file's existing agent factory/stub
  registry.register(agent, SubAgentType.GENERAL, 'alkali', 'high');
  expect(registry.getByNickname('alkali')?.thinkingLevel).toBe('high');
});
```

(Match the file's existing helper for constructing a fake `Agent` and its `SubAgentType` import; if registrations elsewhere in the test now miss the 4th arg, add a level like `'none'`.)

Run: `bun run --filter '@omnicraft/backend' test -- subagent-registry.test.ts` → expect FAIL (arity/property), then it passes once Step 2 is in. (Step 2 and this test can land together.)

- [ ] **Step 4: `dispatch-agent-tool.ts` — wrap getConfig, widen description, register with level**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`:

- Change `createSubAgent` to drop the `thinkingLevel` param: `createSubAgent(agentType, getConfig, workingDirectory, sessionsDir?)`, and the `new GeneralSubAgent(getConfig, workingDirectory, sessionsDir)` / `new ExploreSubAgent(...)` calls lose their `thinkingLevel` argument.
- Update the `thinkingLevel` param `.describe(...)` to list all 7 levels and explain default `none`:
  ```typescript
  thinkingLevel: thinkingLevelSchema
    .optional()
    .describe(
      "Extended-thinking effort for the subagent: 'none' | 'minimal' | 'low' | " +
        "'medium' | 'high' | 'xhigh' | 'max'. Defaults to 'none'. Raise it for " +
        'subtasks needing multi-step reasoning, complex analysis, or planning ' +
        'before acting; leave at none for routine lookups and edits.',
    ),
  ```
- In `execute`, after resolving `const baseGetConfig = model === 'light' ? context.getLightConfig : context.getConfig;`, wrap it to override the level:
  ```typescript
  const getConfig = async (): Promise<LlmConfig> => ({
    ...(await baseGetConfig()),
    thinkingLevel,
  });
  ```
  (`thinkingLevel` here is the destructured arg defaulting to `'none'`. Keep the existing `LlmConfig` import; add it if absent.)
- Pass the wrapped `getConfig` into `createSubAgent(agentType, getConfig, workingDirectory, subagentSessionsDir)`.
- The `startEvent.thinkingLevel: thinkingLevel` stays (SSE display unchanged).
- Change the `registerSubAgent` helper to forward the level: `register(subagent, agentType, nickname, thinkingLevel)`. Update `registerSubAgent(context, subagent, agentType, nickname)` signature + the `onTurnStarted` call to pass `thinkingLevel`.

- [ ] **Step 5: `resume-agent-tool.ts` — read level from the handle**

In `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts`, change the start event's `thinkingLevel: handle.agent.getThinkingLevel(),` to `thinkingLevel: handle.thinkingLevel,`.

- [ ] **Step 6: Commit**

```bash
git add apps/backend/src/agent/agents/explore-sub-agent apps/backend/src/agent/agents/general-sub-agent apps/backend/src/agent-core/agent/state/subagent-registry.ts apps/backend/src/agent-core/agent/state/subagent-registry.test.ts apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts apps/backend/src/agent/tools/sub-agent/resume-agent-tool.ts
git commit -m "refactor: make subagent thinking level config-driven and stored in the registry"
```

---

### Task 9: Remove request-level `thinkingLevel`; restore a compiling backend

Strips `thinkingLevel` from the create-session request schemas, dispatcher, service, and the agent constructors (which no longer need it), then verifies the whole backend compiles and its tests pass.

**Files:**

- Modify: `packages/api-schema/src/chat/schema.ts`
- Modify: `apps/backend/src/dispatcher/agent-session/router.ts`
- Modify: `apps/backend/src/services/agent-session/agent-session-service.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`
- Modify (tests): backend tests asserting on the removed param (see Step 6)

**Interfaces:**

- Produces: `createSessionRequestSchema = z.strictObject({})`; `createCodingSessionRequestSchema = z.strictObject({workspace: z.string()})`; `MainAgent`/`CodingAgent` constructors `(workingDirectory, sessionsDir?, snapshot?)`.

- [ ] **Step 1: Strip the request schemas**

In `packages/api-schema/src/chat/schema.ts`:

- `createSessionRequestSchema` → `z.strictObject({})`.
- `createCodingSessionRequestSchema` → `z.strictObject({workspace: z.string()})`.
- Remove the now-unused `import {thinkingLevelSchema} from '@omnicraft/settings-schema';` (added in Task 1) — the file no longer references it.

- [ ] **Step 2: Dispatcher stops parsing thinkingLevel**

In `apps/backend/src/dispatcher/agent-session/router.ts`:

- Change `let options: {thinkingLevel: ThinkingLevel; workspace?: string};` → `let options: {workspace?: string};`.
- CHAT branch: `options = {};` (still call `createSessionRequestSchema.parse(ctx.request.body)` to validate the body shape, but don't read `thinkingLevel`).
- CODING branch: `options = {workspace: body.workspace};`.
- Remove the now-unused `type ThinkingLevel` from the `@omnicraft/api-schema` import.

- [ ] **Step 3: Service drops thinkingLevel**

In `apps/backend/src/services/agent-session/agent-session-service.ts`:

- Remove `thinkingLevel: ThinkingLevel;` from `CreateSessionOptions` (leaving `{workspace?: string}`).
- Change `new MainAgent(options.workspace, options.thinkingLevel, sessionsDir)` → `new MainAgent(options.workspace, sessionsDir)` and the `CodingAgent` call likewise.
- Remove the now-unused `type ThinkingLevel` import.

- [ ] **Step 4: Agent constructors drop the param**

In `main-agent.ts` and `coding-agent.ts`:

- Remove `thinkingLevel: ThinkingLevel,` from the constructor signature.
- Remove `thinkingLevel,` from the `super(getConfig, {...}, snapshot)` options object.
- In `restore(...)`, change `new MainAgent(snapshot.options.workingDirectory, snapshot.options.thinkingLevel, sessionsDir, snapshot)` → `new MainAgent(snapshot.options.workingDirectory, sessionsDir, snapshot)` (and `CodingAgent` likewise).
- Remove the now-unused `import type {ThinkingLevel} from '@omnicraft/api-schema';`.

- [ ] **Step 5: Typecheck the backend (closes the deferred-compile window)**

Run: `bun run --filter '@omnicraft/backend' typecheck`
Expected: PASS. If errors remain, they pinpoint a missed threading site — fix per the same pattern (read level from config, not a param).

- [ ] **Step 6: Fix and run backend tests**

Run: `bun run --filter '@omnicraft/backend' test`
Expected: fix any failures, then PASS. Known test edits:

- `apps/backend/src/agent-core/agent/agent.test.ts` — remove the "Snapshot is missing thinkingLevel" assertion test and drop `thinkingLevel` from any `AgentOptions`/snapshot fixtures.
- `agent-turn-runner.test.ts`, `agent-usage-reporter.test.ts` — drop `thinkingLevel` from `RunAgentTurnInput`/`BuildAgentUsageInput` fixtures; usage-reporter fixtures must put `thinkingLevel` inside the `getConfig()` return (`LlmConfig`) so the asserted usage value still appears.
- `dispatch-agent-tool.test.ts` — registrations/fixtures: `options: {workingDirectory: tmpDir}` (no `thinkingLevel`); `register(...)` calls pass a 4th arg; assertions on `startEvent.thinkingLevel` still hold (default `'none'`).
- `resume-agent-tool.test.ts`, `list-resumable-agents-tool.test.ts` — `register(agent, type, nickname, 'none')` 4-arg form.
- Any `LlmConfig` fixture in llm-api/llm-session/model-capacity tests — add `thinkingLevel: 'none'`.

- [ ] **Step 7: Lint + format the backend & schema packages**

Run: `bun run --filter '@omnicraft/backend' lint && bun run --filter '@omnicraft/settings-schema' typecheck && bun run --filter '@omnicraft/api-schema' typecheck && bun run format`
Expected: PASS / no diffs needing attention.

- [ ] **Step 8: Commit**

```bash
git add packages/api-schema apps/backend
git commit -m "refactor: remove request-level thinking level; settings is the single source"
```

---

### Task 10: Add "Thinking level" Select to both LLM settings sections

Adds the relocated control. The 7-value labels come from the (extended) `THINKING_LEVEL_LABELS` constant.

**Files:**

- Modify: `apps/frontend/src/modules/chat-session/constants.ts`
- Modify: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSection.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/llm/coding/CodingLlmSection.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/llm/coding/CodingLlmSectionFields.tsx`

**Interfaces:**

- Consumes: `settingsSchema.shape.llm.unwrap().shape.thinkingLevel` (Task 2), `THINKING_LEVEL_LABELS`.
- Produces: settings fields `llm/thinkingLevel` and `codingLlm/thinkingLevel` rendered as Selects.

- [ ] **Step 1: Extend the labels constant to 7 values**

In `apps/frontend/src/modules/chat-session/constants.ts`, change the import to settings-schema and extend the map:

```typescript
import type {ThinkingLevel} from '@omnicraft/settings-schema';

export const THINKING_LEVEL_LABELS: Record<ThinkingLevel, string> = {
  none: 'None',
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra High',
  max: 'Max',
};

export const THINKING_LEVELS = Object.entries(THINKING_LEVEL_LABELS) as [
  ThinkingLevel,
  string,
][];
```

(`@omnicraft/settings-schema` is already a dependency of the frontend — it's imported elsewhere, e.g. `SessionConfigContext`. `ThinkingLevel` from api-schema and settings-schema are the same type, so `UsageInfoView`, which imports `THINKING_LEVEL_LABELS`, keeps working.)

- [ ] **Step 2: Add the field to `ChatLlmSection` FIELDS**

In `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSection.tsx`, add to `FIELDS` (after `llm/model`, before/after `lightModel` — order is cosmetic):

```typescript
  {path: 'llm/thinkingLevel', schema: llmShape.thinkingLevel},
```

- [ ] **Step 3: Render the Select in `ChatLlmSectionFields`**

In `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx`, add an import:

```typescript
import {THINKING_LEVELS} from '@/modules/chat-session/index.js';
```

and add this Select (e.g. after the API Format Select, before the API Key field):

```tsx
<Select
  value={String(values['llm/thinkingLevel'])}
  isInvalid={'llm/thinkingLevel' in validationErrors}
  isDisabled={isDisabled}
  onChange={(value) => {
    if (value) {
      setValue('llm/thinkingLevel', String(value));
    }
  }}
>
  <Label>Thinking Level</Label>
  <Select.Trigger>
    <Select.Value />
    <Select.Indicator />
  </Select.Trigger>
  <Description>Extended-thinking effort for the chat agent</Description>
  <Select.Popover>
    <ListBox>
      {THINKING_LEVELS.map(([id, label]) => (
        <ListBox.Item key={id} id={id} textValue={label}>
          {label}
          <ListBox.ItemIndicator />
        </ListBox.Item>
      ))}
    </ListBox>
  </Select.Popover>
  {validationErrors['llm/thinkingLevel'] && (
    <FieldError>{validationErrors['llm/thinkingLevel']}</FieldError>
  )}
</Select>
```

- [ ] **Step 4: Mirror into the Coding section**

In `apps/frontend/src/pages/settings/sections/llm/coding/CodingLlmSection.tsx`, add `{path: 'codingLlm/thinkingLevel', schema: codingLlmShape.thinkingLevel},` to `FIELDS`. In `CodingLlmSectionFields.tsx`, add the same import and Select, replacing every `llm/thinkingLevel` with `codingLlm/thinkingLevel` and the description with "...for the coding agent".

- [ ] **Step 5: Typecheck the frontend**

Run: `bun run --filter '@omnicraft/frontend' build` (runs `tsc -b`) — or, faster, just verify these files typecheck by running the frontend test suite in Step 7.
Expected: no type errors. (The chat/coding selector removal in Task 11 is what makes the suite green; if you build now, the still-present `ThinkingLevelSelect` references compile fine — they're removed next.)

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/modules/chat-session/constants.ts apps/frontend/src/pages/settings/sections/llm
git commit -m "feat: add thinking-level selector to chat and coding LLM settings"
```

---

### Task 11: Remove the thinking selector from chat composer + coding card

Deletes the old per-session control and its plumbing now that settings owns the value.

**Files:**

- Delete: `apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect/` (whole folder)
- Modify: `apps/frontend/src/modules/chat-session/index.ts` (drop the `ThinkingLevelSelect` export)
- Modify: `apps/frontend/src/modules/chat-session/components/ChatInput/ChatInput.tsx` + `ChatInputView.tsx`
- Modify: `apps/frontend/src/pages/chat/ChatPageView.tsx` (drop `showThinkingLevelSelect`)
- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionConfigContext/SessionConfigContext.ts` + `SessionConfigProvider.tsx`
- Modify: `apps/frontend/src/modules/chat-session/contexts/SessionIdContext/SessionIdProvider.tsx`
- Modify: `apps/frontend/src/api/agent-session/agent-session.ts`
- Modify: `apps/frontend/src/pages/coding/components/TaskDispatchCard/TaskDispatchCardView.tsx` + `TaskDispatchCard.tsx` + `types.ts` + `hooks/useTaskDispatchForm.ts`

**Interfaces:**

- Produces: `CreateSessionOptions = {workspace?: string}`; `SessionConfigContextValue` without `thinkingLevel`/`setThinkingLevel`; `ChatInput` without `showThinkingLevelSelect`.

- [ ] **Step 1: Delete the component + its export**

```bash
rm -rf apps/frontend/src/modules/chat-session/components/ThinkingLevelSelect
```

In `apps/frontend/src/modules/chat-session/index.ts`, remove the `export {ThinkingLevelSelect} from './components/ThinkingLevelSelect/index.js';` line. Keep the `THINKING_LEVEL_LABELS`/`THINKING_LEVELS` export (still used by settings + `UsageInfoView`).

- [ ] **Step 2: Strip the selector from `ChatInput` + view**

- `ChatInputView.tsx`: remove the `showThinkingLevelSelect`, `thinkingLevel`, `onThinkingLevelChange` props and the `ThinkingLevelSelect` import; replace the `{showThinkingLevelSelect ? (...) : <span />}` block with just `<span />` (keeps the toolbar's space-between layout with the Send/Stop button).
- `ChatInput.tsx`: remove the `showThinkingLevelSelect` prop, the `useSessionConfig()` call, and the `thinkingLevel`/`onThinkingLevelChange`/`showThinkingLevelSelect` props passed to `ChatInputView`.
- `ChatPageView.tsx:117`: remove the `showThinkingLevelSelect` prop from the `<ChatInput .../>` usage.

- [ ] **Step 3: Strip thinkingLevel from session config context + provider**

- `SessionConfigContext.ts`: remove `thinkingLevel` and `setThinkingLevel` from `SessionConfigContextValue` and the now-unused `ThinkingLevel` import.
- `SessionConfigProvider.tsx`: remove the `thinkingLevel` `useState`, the two value-object keys, the dependency-array entry, and the `ThinkingLevel` import.

- [ ] **Step 4: Strip thinkingLevel from session creation**

- `SessionIdProvider.tsx`: remove `const {thinkingLevel} = useSessionConfig();`, change `createSession({...config, thinkingLevel})` → `createSession({...config})`, and drop `thinkingLevel` from the `useCallback` deps.
- `agent-session.ts`: remove `thinkingLevel: ThinkingLevel;` from `CreateSessionOptions` (leaving `{workspace?: string}`) and the now-unused `type ThinkingLevel` import.

- [ ] **Step 5: Strip from the coding task card**

- `TaskDispatchCardView.tsx`: remove the `thinkingLevel`/`onThinkingLevelChange` props, the `ThinkingLevelSelect` + `ThinkingLevel` + `Brain` imports (drop `Brain` only if unused elsewhere in the file), and the entire `<div className={styles.field}>...Thinking level...<ThinkingLevelSelect/></div>` block.
- `types.ts`: remove `thinkingLevel`/`onThinkingLevelChange` from the props/values types if declared there.
- `TaskDispatchCard.tsx`: remove the `thinkingLevel={form.thinkingLevel}` and `onThinkingLevelChange={form.setThinkingLevel}` props.
- `hooks/useTaskDispatchForm.ts`: remove `thinkingLevel`/`setThinkingLevel` from the `useSessionConfig()` destructure and from the returned object. If `useSessionConfig` is no longer used, drop that import.

- [ ] **Step 6: Update frontend tests**

- `ChatPage.test.tsx`: in "creates a chat session..." drop the `expect(getByLabelText('Thinking level'))` assertion and change `createSession` expectation to `toHaveBeenCalledWith({})`. Remove/repurpose the "hides thinking selector on existing sessions" test (no selector exists now — delete it).
- `CodingPage.test.tsx`: change the `createSession` expectation to `toHaveBeenCalledWith({workspace: '/workspace/repo'})`.
- `useTaskDispatchForm.test.ts`: drop `thinkingLevel: 'none', setThinkingLevel: vi.fn()` from the `useSessionConfig` mock and any assertions on them.
- Search for other failing references: `grep -rn "thinkingLevel\|ThinkingLevelSelect" apps/frontend/src` — the only remaining hits should be `constants.ts`, `UsageInfoView.tsx`, the settings sections, and `usage.thinkingLevel` in usage/SSE display code (all intended).

- [ ] **Step 7: Run the frontend test suite**

Run: `bun run --filter '@omnicraft/frontend' test`
Expected: PASS. Fix any remaining references the tests surface.

- [ ] **Step 8: Lint the frontend**

Run: `bun run --filter '@omnicraft/frontend' lint`
Expected: PASS (no unused imports/vars left behind).

- [ ] **Step 9: Commit**

```bash
git add apps/frontend
git commit -m "refactor: remove per-session thinking selector from chat and coding UI"
```

---

### Task 12: Full verification + browser check

**Files:** none (verification only).

- [ ] **Step 1: Whole-repo typecheck + tests + format**

Run each and confirm PASS:

```bash
bun run --filter '@omnicraft/settings-schema' test
bun run --filter '@omnicraft/api-schema' test
bun run --filter '@omnicraft/backend' typecheck
bun run --filter '@omnicraft/backend' test
bun run --filter '@omnicraft/frontend' test
bun run format:check
```

- [ ] **Step 2: Grep for leftover threading**

Run: `grep -rn "thinkingLevel" apps/backend/src | grep -v ".test.ts"`
Expected: hits only in — `llm-api/types.ts` (`LlmConfig`), `claude/helpers.ts` + `stream.ts` + `token-count.ts`, `openai-responses/helpers.ts` + `stream.ts` + `token-count.ts`, `services/agent-session/helpers.ts`, `main-agent.ts`/`coding-agent.ts` (closures), `agent-usage-reporter.ts` (`config.thinkingLevel`), `subagent-registry.ts`, `dispatch-agent-tool.ts`, `resume-agent-tool.ts`, and SSE event types. No hits in `agent.ts`, `agent-turn-runner.ts`, `llm-session.ts`, `agent/types.ts`, `compaction/*`, `router.ts`, `agent-session-service.ts`.

- [ ] **Step 3: Browser validation (both themes)**

Start the dev server from the repo root and validate in a real browser, per the frontend guidelines:

```bash
bun dev
```

Verify:

1. Settings → Chat Agent and Coding Agent each show a "Thinking Level" Select listing all 7 levels; changing it persists (reload keeps the value).
2. The chat composer no longer shows a Thinking selector; sending a message still works.
3. The coding task-dispatch card no longer shows a Thinking level field; starting a task still works.
4. Usage display still renders "Thinking: <label>" using the live setting.
5. Check all of the above in **both** light and dark themes.

Capture screenshots of the two settings sections and the cleaned-up composer/card for the PR description.

- [ ] **Step 4: Final commit (if any test fixups were needed)**

```bash
git add -A
git commit -m "test: finalize thinking-level-in-settings verification"
```

---

## Self-Review

**Spec coverage:**

- Move selection into LLM Settings → Task 10. ✓
- Single 7-value abstraction (union) → Tasks 1–2. ✓
- Map+clamp at provider boundary → Tasks 3–5 (incl. `minimal→low` Claude, `max→xhigh` OpenAI). ✓
- Live read on every call → Task 6 (`getLlmConfig` + agent closures). ✓
- `dispatch_agent` agent-controlled, default `none` → Task 8. ✓
- Remove per-session snapshot + threading → Tasks 7, 9 (incl. dropping the snapshot assertion). ✓
- Package layering (enum in settings-schema, api-schema re-exports) → Task 1. ✓
- Testing (settings JSON-schema, provider mappings, agent core, dispatch, frontend) → Tasks 2–4, 8–12. ✓

**Resolved spec gaps:** (1) `resume_agent` previously read `agent.getThinkingLevel()`, which is removed — the level now lives on the registry handle (Task 8). (2) `UsageInfoView` consumes `THINKING_LEVEL_LABELS`, so the constant is widened, not deleted (Tasks 10–11). (3) Compaction's `thinkingLevel` was vestigial (char-count estimator) — dropped cleanly (Task 7).

**SDK type validity:** Anthropic `OutputConfig.effort` includes both `xhigh` and `max`; OpenAI `ReasoningEffort` includes `minimal` but not `max`. The mapping table compiles against both installed SDKs.

**Deferred-compile window:** Tasks 5–8 intentionally leave the backend non-compiling; Task 9 Step 5 is the single typecheck gate that closes it. This is called out in each affected task's NOTE so a reviewer doesn't expect green between them.
