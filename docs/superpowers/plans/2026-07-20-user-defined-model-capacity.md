# User-Defined Model Capacity + Independent Light Model — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the hardcoded model-capacity tables with hand-written per-model limits (max context / max output) stored in settings, and make the light model a fully independent model config (own name, thinking level, and limits).

**Architecture:** The shared Zod settings schema is restructured so each LLM section (`llm`, `codingLlm`) holds shared connection fields (`apiFormat`/`apiKey`/`baseUrl`) plus two nested model configs (`main`, `light`), each `{model, thinkingLevel, maxContextTokens, maxOutputTokens}`. The backend flattens the relevant model config into `LlmConfig` and resolves limits directly from it (`prompt budget = maxContextTokens − maxOutputTokens`, clamped ≥ 1); the two `*-capacity.ts` tables and the Anthropic auto-fetch are deleted. The frontend renders a reusable `ModelSettingsFields` component twice per section. A one-time script migrates the local `settings.json`.

**Tech Stack:** Node.js ≥ 24, PNPM workspaces, TypeScript (nodenext), Zod v4, Koa 3 backend, React 19 + Vite + HeroUI v3 frontend, Vitest + @testing-library/react.

## Global Constraints

- **Package manager:** PNPM. Run package scripts with `pnpm --filter <pkg> <script>`; run a single test file with `pnpm --filter <pkg> exec vitest run <path>`; run a script with `pnpm --filter @omnicraft/backend exec tsx <path>`.
- **Repo-wide checks:** `pnpm typecheck:all`, `pnpm lint:all`, `pnpm format`.
- **Commits:** Conventional Commits (`feat:`, `fix:`, `refactor:`, `chore:`, `test:`, `docs:`).
- **TypeScript style:** never use `any` (use `unknown` + narrowing); early-return `if`; relative imports use the `.js` extension; `@/*` alias maps to each app's `src/`.
- **No default exports** (backend and frontend).
- **File naming:** kebab-case for plain files; UpperCamelCase for React component files/folders; `<name>.test.ts(x)` for tests.
- **settings-schema:** every leaf field has `.describe()` and `.default()`; the whole schema must convert via `z.toJSONSchema()` (enforced by a test).
- **Frontend:** strict MVVM; CSS Modules only (no Tailwind utility classes in our own components); use HeroUI (`@heroui/react`) directly; a shared non-page component lives in a folder with an `index.ts` entry; after any UI change, validate in a real browser in **both light and dark themes** and attach screenshots to the PR.
- **Capacity defaults:** `maxContextTokens = 200_000`, `maxOutputTokens = 32_000` (input budget defaults to `168_000`).
- **Cross-package breakage:** changing the shared schema (Task 1) makes the backend and frontend fail typecheck until Tasks 2 and 4 land. This is expected; each task's gate runs the affected package, and Task 6 runs the repo-wide checks.

---

## File Structure

**settings-schema (Task 1)**

- Modify `packages/settings-schema/src/llm/schema.ts` — nested `main`/`light` model configs + `maxContextTokens`/`maxOutputTokens`.
- Modify `packages/settings-schema/src/schema.test.ts` — update thinking-level paths; add nested + capacity assertions.

**backend (Task 2)**

- Modify `apps/backend/src/agent-core/llm-api/types.ts` — add two fields to `LlmConfig`.
- Rewrite `apps/backend/src/agent-core/model-capacity/model-capacity.ts` — pure, synchronous, reads from config.
- Delete `apps/backend/src/agent-core/model-capacity/claude-capacity.ts` and `openai-capacity.ts`.
- Rewrite `apps/backend/src/agent-core/model-capacity/model-capacity.test.ts`.
- Modify consumers to drop `await`: `agent-core/llm-api/claude/stream.ts`, `agent-core/llm-api/openai-responses/stream.ts`, `agent-core/agent/agent-usage-reporter.ts`, `agent-core/llm-session/compaction/llm-compaction-decision-service.ts`.
- Modify config builders: `agent/agents/main-agent/main-agent.ts`, `agent/agents/coding-agent/coding-agent.ts`, `services/chat-agent-session/helpers.ts`, `services/coding-agent-session/helpers.ts`.
- Update test fixtures: `agent-core/agent/agent-usage-reporter.test.ts`, `agent-core/llm-session/compaction/llm-compaction-decision-service.test.ts`, and all other backend test files that build an `LlmConfig` literal (typecheck-driven).

**frontend (Tasks 3–4)**

- Create `apps/frontend/src/pages/settings/components/ModelSettingsFields/` (`index.ts`, `ModelSettingsFields.tsx`, `styles.module.css`, `helpers/to-number-field-value.ts`, `ModelSettingsFields.test.tsx`).
- Modify `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSection.tsx` + `ChatLlmSectionFields.tsx`.
- Modify `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSection.tsx` + `CodingLlmSectionFields.tsx`.

**migration (Task 5)**

- Create `apps/backend/scripts/migrate-settings-lib.ts`, `migrate-settings-lib.test.ts`, `migrate-settings-to-nested-models.ts`.

---

## Task 1: Settings schema — nested per-model configs

**Files:**

- Modify: `packages/settings-schema/src/llm/schema.ts`
- Test: `packages/settings-schema/src/schema.test.ts`

**Interfaces:**

- Produces: `llmSettingsSchema` with shape `{apiFormat, apiKey, baseUrl, main, light}`, where `main`/`light` are objects `{model, thinkingLevel, maxContextTokens, maxOutputTokens}` each carrying a `.refine()` that requires `maxContextTokens > maxOutputTokens`. New leaf paths: `llm/main/model`, `llm/main/thinkingLevel`, `llm/main/maxContextTokens`, `llm/main/maxOutputTokens`, and the same under `llm/light`, `codingLlm/main`, `codingLlm/light`. Exports `thinkingLevelSchema`, `ThinkingLevel` (unchanged), plus `mainModelSettingsSchema`, `lightModelSettingsSchema`. Verified against Zod 4.4.3: `.refine()` on an object preserves `.shape`, survives `prefault().unwrap().shape`, converts via `z.toJSONSchema()`, and keeps nested leaf-path traversal working — so the constraint lives on the schema without breaking frontend introspection or the settings API's leaf-path check.

- [ ] **Step 1: Update the schema test to the nested shape (failing)**

Replace the `llm.thinkingLevel` describe-block in `packages/settings-schema/src/schema.test.ts` (lines 20–35) and add capacity assertions. New content for that block:

```ts
describe('llm.main / llm.light defaults', () => {
  it('fills nested main/light defaults for both llm and codingLlm', () => {
    const parsed = settingsSchema.parse({});
    expect(parsed.llm.main.thinkingLevel).toBe('none');
    expect(parsed.llm.main.model).toBe('claude-sonnet-4-20250514');
    expect(parsed.llm.main.maxContextTokens).toBe(200_000);
    expect(parsed.llm.main.maxOutputTokens).toBe(32_000);
    expect(parsed.llm.light.model).toBe('');
    expect(parsed.codingLlm.light.thinkingLevel).toBe('none');
  });

  it('accepts per-model thinking levels', () => {
    const parsed = settingsSchema.parse({
      llm: {main: {thinkingLevel: 'minimal'}},
      codingLlm: {light: {thinkingLevel: 'max'}},
    });
    expect(parsed.llm.main.thinkingLevel).toBe('minimal');
    expect(parsed.codingLlm.light.thinkingLevel).toBe('max');
  });

  it('rejects a model whose output is not less than its context', () => {
    const result = settingsSchema.safeParse({
      llm: {main: {maxContextTokens: 100_000, maxOutputTokens: 100_000}},
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual([
      'llm',
      'main',
      'maxOutputTokens',
    ]);
  });
});
```

(Leave the first `describe('settingsSchema', …)` JSON-schema block untouched.)

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @omnicraft/settings-schema exec vitest run src/schema.test.ts`
Expected: FAIL — `parsed.llm.main` is undefined (schema still flat).

- [ ] **Step 3: Rewrite the LLM schema**

Replace the entire contents of `packages/settings-schema/src/llm/schema.ts` with:

```ts
import {z} from 'zod';

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

/** Fields shared by every model config; the `model` field is added per variant. */
const baseModelSettingsSchema = z.object({
  thinkingLevel: thinkingLevelSchema
    .describe('Extended-thinking effort level for this model')
    .default('none'),
  maxContextTokens: z
    .number()
    .int()
    .min(1)
    .describe('Full context window of the model, in tokens (prompt + output)')
    .default(200_000),
  maxOutputTokens: z
    .number()
    .int()
    .min(1)
    .describe('Maximum output tokens the model may generate per response')
    .default(32_000),
});

/** Error shown when a model reserves more output than its context allows. */
const OUTPUT_EXCEEDS_CONTEXT_MESSAGE =
  'Max output tokens must be less than max context tokens';

/** Main model: a name is required. */
export const mainModelSettingsSchema = baseModelSettingsSchema
  .extend({
    model: z
      .string()
      .min(1)
      .describe('Model name to use')
      .default('claude-sonnet-4-20250514'),
  })
  .refine((config) => config.maxContextTokens > config.maxOutputTokens, {
    error: OUTPUT_EXCEEDS_CONTEXT_MESSAGE,
    path: ['maxOutputTokens'],
  });

/** Light model: name may be empty (falls back to the main model). */
export const lightModelSettingsSchema = baseModelSettingsSchema
  .extend({
    model: z
      .string()
      .describe(
        'Model name for lightweight tasks (e.g. title generation). Falls back to the main model if empty.',
      )
      .default(''),
  })
  .refine((config) => config.maxContextTokens > config.maxOutputTokens, {
    error: OUTPUT_EXCEEDS_CONTEXT_MESSAGE,
    path: ['maxOutputTokens'],
  });

export const llmSettingsSchema = z.object({
  apiFormat: z
    .enum(['claude', 'openai-responses'])
    .describe('API protocol format')
    .default('claude'),
  apiKey: z.string().describe('API key for the LLM service').default(''),
  baseUrl: z
    .url()
    .describe('Base URL of the LLM API')
    .default('https://api.anthropic.com'),
  main: mainModelSettingsSchema.prefault({}),
  light: lightModelSettingsSchema.prefault({}),
});
```

- [ ] **Step 4: Run the settings-schema tests to verify they pass**

Run: `pnpm --filter @omnicraft/settings-schema exec vitest run`
Expected: PASS (both the JSON-schema block and the new nested block).

- [ ] **Step 5: Typecheck the package**

Run: `pnpm --filter @omnicraft/settings-schema typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/settings-schema/src/llm/schema.ts packages/settings-schema/src/schema.test.ts
git commit -m "feat(settings-schema): nest per-model config with hand-written limits"
```

---

## Task 2: Backend — config type, capacity derivation, config builders, fixtures

**Files:**

- Modify: `apps/backend/src/agent-core/llm-api/types.ts:70-76`
- Rewrite: `apps/backend/src/agent-core/model-capacity/model-capacity.ts`
- Delete: `apps/backend/src/agent-core/model-capacity/claude-capacity.ts`, `apps/backend/src/agent-core/model-capacity/openai-capacity.ts`
- Rewrite: `apps/backend/src/agent-core/model-capacity/model-capacity.test.ts`
- Modify: `apps/backend/src/agent-core/llm-api/claude/stream.ts:52`, `apps/backend/src/agent-core/llm-api/openai-responses/stream.ts:27-29`, `apps/backend/src/agent-core/agent/agent-usage-reporter.ts:15`, `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.ts:22-24`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts:33-37,55-66`, `apps/backend/src/agent/agents/coding-agent/coding-agent.ts:33-38,56-67`, `apps/backend/src/services/chat-agent-session/helpers.ts`, `apps/backend/src/services/coding-agent-session/helpers.ts`
- Modify (fixtures): `apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts`, `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.test.ts`, and every other backend test that builds an `LlmConfig` literal (typecheck-driven; see Step 9).

**Interfaces:**

- Consumes: `LlmConfig` from `../llm-api/types.js`; nested settings from Task 1 (`settings.llm.main`, `settings.llm.light`, `settings.codingLlm.*`).
- Produces: `LlmConfig` gains `maxContextTokens: number` and `maxOutputTokens: number`. `modelCapacity` becomes `{ getMaxOutputTokens(config): number; getMaxPromptTokens(config): number }` — both **synchronous**. `getMaxContextWindowTokens` is removed.

- [ ] **Step 1: Rewrite the model-capacity test (failing)**

Replace the entire contents of `apps/backend/src/agent-core/model-capacity/model-capacity.test.ts` with:

```ts
import {describe, expect, it} from 'vitest';

import type {LlmConfig} from '../llm-api/types.js';
import {modelCapacity} from './model-capacity.js';

function makeConfig(overrides: Partial<LlmConfig> = {}): LlmConfig {
  return {
    apiFormat: 'claude',
    apiKey: 'test-key',
    baseUrl: 'https://api.example.com',
    model: 'test-model',
    thinkingLevel: 'none',
    maxContextTokens: 200_000,
    maxOutputTokens: 32_000,
    ...overrides,
  };
}

describe('modelCapacity', () => {
  it('returns the configured max output tokens', () => {
    expect(
      modelCapacity.getMaxOutputTokens(makeConfig({maxOutputTokens: 64_000})),
    ).toBe(64_000);
  });

  it('derives max prompt tokens as context minus output', () => {
    expect(
      modelCapacity.getMaxPromptTokens(
        makeConfig({maxContextTokens: 200_000, maxOutputTokens: 32_000}),
      ),
    ).toBe(168_000);
  });

  it('clamps max prompt tokens to at least 1 when output >= context', () => {
    expect(
      modelCapacity.getMaxPromptTokens(
        makeConfig({maxContextTokens: 10_000, maxOutputTokens: 10_000}),
      ),
    ).toBe(1);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent-core/model-capacity/model-capacity.test.ts`
Expected: FAIL — `LlmConfig` has no `maxContextTokens`/`maxOutputTokens`, and `modelCapacity` is still async.

- [ ] **Step 3: Add the two fields to `LlmConfig`**

In `apps/backend/src/agent-core/llm-api/types.ts`, replace the `LlmConfig` interface (lines 69–76):

```ts
/** Configuration needed to call an LLM API. */
export interface LlmConfig {
  apiFormat: 'claude' | 'openai-responses';
  apiKey: string;
  baseUrl: string;
  model: string;
  readonly thinkingLevel: ThinkingLevel;
  maxContextTokens: number;
  maxOutputTokens: number;
}
```

- [ ] **Step 4: Rewrite `model-capacity.ts` as a pure module**

Replace the entire contents of `apps/backend/src/agent-core/model-capacity/model-capacity.ts` with:

```ts
import type {LlmConfig} from '../llm-api/types.js';

/**
 * Resolves model token limits from the user-provided LLM configuration.
 * The full context window and max output are hand-configured in settings;
 * the input budget is derived as (window - output).
 */
export const modelCapacity = {
  /** Maximum output tokens the model may generate per response. */
  getMaxOutputTokens(config: Readonly<LlmConfig>): number {
    return config.maxOutputTokens;
  },

  /**
   * Maximum prompt (input) tokens: the full context window minus reserved
   * output. Clamped to >= 1 so a misconfigured pair (output >= context)
   * degrades to aggressive compaction rather than a non-positive budget.
   */
  getMaxPromptTokens(config: Readonly<LlmConfig>): number {
    return Math.max(1, config.maxContextTokens - config.maxOutputTokens);
  },
};
```

- [ ] **Step 5: Delete the hardcoded capacity tables**

```bash
git rm apps/backend/src/agent-core/model-capacity/claude-capacity.ts \
       apps/backend/src/agent-core/model-capacity/openai-capacity.ts
```

(`index.ts` already only re-exports `modelCapacity`, so it needs no change.)

- [ ] **Step 6: Drop `await` at the four consumers**

The functions are now synchronous. Edit each call:

`apps/backend/src/agent-core/llm-api/claude/stream.ts:52`:

```ts
const maxTokens = modelCapacity.getMaxOutputTokens(options.config);
```

`apps/backend/src/agent-core/llm-api/openai-responses/stream.ts:27-29`:

```ts
const maxOutputTokens = modelCapacity.getMaxOutputTokens(options.config);
```

`apps/backend/src/agent-core/agent/agent-usage-reporter.ts:15`:

```ts
const contextWindowTokens = modelCapacity.getMaxPromptTokens(config);
```

`apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.ts:22-24`:

```ts
const maxPromptTokens = modelCapacity.getMaxPromptTokens(input.config);
```

- [ ] **Step 7: Update the four config builders to read the nested shape**

`apps/backend/src/agent/agents/main-agent/main-agent.ts` — replace the `getConfig` closure (lines 33–37) and the `getLightConfig` closure (lines 55–66):

```ts
      async () => {
        const settings = await settingsService.getAll();
        const {apiFormat, apiKey, baseUrl, main} = settings.llm;
        return {
          apiFormat,
          apiKey,
          baseUrl,
          model: main.model,
          thinkingLevel: main.thinkingLevel,
          maxContextTokens: main.maxContextTokens,
          maxOutputTokens: main.maxOutputTokens,
        };
      },
```

```ts
        getLightConfig: async () => {
          const settings = await settingsService.getAll();
          const {apiFormat, apiKey, baseUrl, main, light} = settings.llm;
          return {
            apiFormat,
            apiKey,
            baseUrl,
            model: light.model || main.model,
            thinkingLevel: light.thinkingLevel,
            maxContextTokens: light.maxContextTokens,
            maxOutputTokens: light.maxOutputTokens,
          };
        },
```

`apps/backend/src/agent/agents/coding-agent/coding-agent.ts` — make the identical change on `settings.codingLlm` (the `getConfig` closure at lines 33–38 and `getLightConfig` at lines 56–67), using `settings.codingLlm` in place of `settings.llm`.

`apps/backend/src/services/chat-agent-session/helpers.ts` — replace the body:

```ts
import type {LlmConfig} from '@/agent-core/llm-api/index.js';
import {settingsService} from '@/services/settings/index.js';

/** Returns the main LLM configuration for chat sessions from settings. */
export async function getLlmConfig(): Promise<LlmConfig> {
  const settings = await settingsService.getAll();
  const {apiFormat, apiKey, baseUrl, main} = settings.llm;
  return {
    apiFormat,
    apiKey,
    baseUrl,
    model: main.model,
    thinkingLevel: main.thinkingLevel,
    maxContextTokens: main.maxContextTokens,
    maxOutputTokens: main.maxOutputTokens,
  };
}
```

`apps/backend/src/services/coding-agent-session/helpers.ts` — identical, reading `settings.codingLlm`.

- [ ] **Step 8: Fix the two mock-based consumer tests**

`modelCapacity` is now synchronous, so `mockResolvedValue` (a Promise) is wrong — use `mockReturnValue`. Also add the two new fields to their `LlmConfig` fixtures.

In `apps/backend/src/agent-core/agent/agent-usage-reporter.test.ts`, update `MAIN_CONFIG` (lines 8–14) and the spy (line 22):

```ts
const MAIN_CONFIG: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'test-key',
  baseUrl: 'https://example.test',
  model: 'main-model',
  thinkingLevel: 'high',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};
```

```ts
vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(200_000);
```

In `apps/backend/src/agent-core/llm-session/compaction/llm-compaction-decision-service.test.ts`, update `config` (lines 11–17) and all three spies (lines 60, 75, 90) from `mockResolvedValue(1000)` to `mockReturnValue(1000)`:

```ts
const config: LlmConfig = {
  apiFormat: 'openai-responses',
  apiKey: 'key',
  baseUrl: 'https://example.test',
  model: 'test-model',
  thinkingLevel: 'none',
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
};
```

```ts
vi.spyOn(modelCapacity, 'getMaxPromptTokens').mockReturnValue(1000);
```

- [ ] **Step 9: Update every remaining `LlmConfig` fixture (typecheck-driven)**

Run: `pnpm --filter @omnicraft/backend typecheck`

The two new required fields make `tsc` report each `LlmConfig` literal missing them. For each reported site, add the two fields (use the model's realistic numbers or the defaults):

```ts
  maxContextTokens: 200_000,
  maxOutputTokens: 32_000,
```

Known files with `LlmConfig` fixtures to check (from the current tree): `agent/tools/sub-agent/resume-agent-tool.test.ts`, `agent/tools/sub-agent/dispatch-agent-tool.test.ts`, `agent-core/llm-session/types.test.ts`, `agent-core/llm-session/llm-session.test.ts`, `agent-core/llm-session/compaction/compaction-summary-generator.test.ts`, `agent-core/llm-session/compaction/llm-session-compactor.test.ts`, `agent-core/llm-session/compaction/llm-history-compactor.test.ts`, `agent-core/agent/agent-runtime-state.test.ts`, `agent-core/agent/agent-turn-runner.test.ts`, `agent-core/agent/agent.test.ts`, `agent-core/agent/agent-tool-executor.test.ts`, `agent-core/agent/state/subagent-registry.test.ts`, `agent-core/agent/events/sse-replay-compressor.test.ts`. Repeat `typecheck` until it reports no errors. (Only fixtures that actually construct an `LlmConfig` object need editing; ignore files where `thinkingLevel` belongs to a different type.)

- [ ] **Step 10: Run the full backend test suite**

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS.

- [ ] **Step 11: Lint the backend**

Run: `pnpm --filter @omnicraft/backend lint`
Expected: no errors (in particular, no leftover `await` on a non-thenable).

- [ ] **Step 12: Commit**

```bash
git add -A apps/backend/src
git commit -m "refactor(backend): resolve model limits from settings, drop capacity tables"
```

---

## Task 3: Frontend — reusable `ModelSettingsFields` component

**Files:**

- Create: `apps/frontend/src/pages/settings/components/ModelSettingsFields/index.ts`
- Create: `apps/frontend/src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.tsx`
- Create: `apps/frontend/src/pages/settings/components/ModelSettingsFields/styles.module.css`
- Create: `apps/frontend/src/pages/settings/components/ModelSettingsFields/helpers/to-number-field-value.ts`
- Test: `apps/frontend/src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.test.tsx`

**Interfaces:**

- Consumes: `SettingSectionRenderProps` from `../SettingSection/index.js`; `THINKING_LEVELS` from `@/helpers/thinking-level-labels.js`.
- Produces: `ModelSettingsFields` — props `SettingSectionRenderProps & { prefix: string; title: string; modelDescription?: string; modelPlaceholder?: string }`. Renders `model`, `thinkingLevel`, `maxContextTokens`, `maxOutputTokens` fields under `` `${prefix}/…` `` and shows a cross-field error on max-output when `maxOutput >= maxContext`.

- [ ] **Step 1: Write the number-coercion helper**

Create `apps/frontend/src/pages/settings/components/ModelSettingsFields/helpers/to-number-field-value.ts`:

```ts
/** Coerces a stored setting value into a NumberField value, or undefined. */
export function toNumberFieldValue(raw: unknown): number | undefined {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  const value = Number(raw);
  return Number.isNaN(value) ? undefined : value;
}
```

- [ ] **Step 2: Write the failing component test**

Create `apps/frontend/src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.test.tsx`:

```tsx
import {render, screen} from '@testing-library/react';
import {describe, expect, it, vi} from 'vitest';

import type {SettingFieldValues} from '../SettingSection/index.js';
import {ModelSettingsFields} from './ModelSettingsFields.js';

function renderFields(values: SettingFieldValues) {
  render(
    <ModelSettingsFields
      values={values}
      setValue={vi.fn()}
      validationErrors={{}}
      isDisabled={false}
      prefix='llm/main'
      title='Main model'
    />,
  );
}

describe('ModelSettingsFields', () => {
  const base: SettingFieldValues = {
    'llm/main/model': 'claude-sonnet-4',
    'llm/main/thinkingLevel': 'none',
    'llm/main/maxContextTokens': 200_000,
    'llm/main/maxOutputTokens': 32_000,
  };

  it('renders the group heading', () => {
    renderFields(base);
    expect(screen.getByText('Main model')).toBeInTheDocument();
  });

  it('shows a cross-field error when max output >= max context', () => {
    renderFields({
      ...base,
      'llm/main/maxContextTokens': 100_000,
      'llm/main/maxOutputTokens': 100_000,
    });
    expect(
      screen.getByText('Max output must be less than max context'),
    ).toBeInTheDocument();
  });

  it('does not show the cross-field error when output < context', () => {
    renderFields(base);
    expect(
      screen.queryByText('Max output must be less than max context'),
    ).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.test.tsx`
Expected: FAIL — module `./ModelSettingsFields.js` does not exist.

- [ ] **Step 4: Write the component**

Create `apps/frontend/src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.tsx`:

```tsx
import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  NumberField,
  Select,
  TextField,
} from '@heroui/react';

import {THINKING_LEVELS} from '@/helpers/thinking-level-labels.js';

import type {SettingSectionRenderProps} from '../SettingSection/index.js';
import {toNumberFieldValue} from './helpers/to-number-field-value.js';
import styles from './styles.module.css';

interface ModelSettingsFieldsProps extends SettingSectionRenderProps {
  /** Key-path prefix for this model's fields, e.g. 'llm/main'. */
  prefix: string;
  /** Group heading shown above the fields. */
  title: string;
  /** Description under the model-name field. */
  modelDescription?: string;
  /** Placeholder for the model-name field. */
  modelPlaceholder?: string;
}

export function ModelSettingsFields({
  values,
  setValue,
  validationErrors,
  isDisabled,
  prefix,
  title,
  modelDescription = 'Model name to use',
  modelPlaceholder = 'claude-sonnet-4-20250514',
}: ModelSettingsFieldsProps) {
  const modelPath = `${prefix}/model`;
  const thinkingLevelPath = `${prefix}/thinkingLevel`;
  const maxContextPath = `${prefix}/maxContextTokens`;
  const maxOutputPath = `${prefix}/maxOutputTokens`;

  const maxContext = toNumberFieldValue(values[maxContextPath]);
  const maxOutput = toNumberFieldValue(values[maxOutputPath]);
  const outputExceedsContext =
    maxContext !== undefined &&
    maxOutput !== undefined &&
    maxOutput >= maxContext;

  const maxOutputError =
    validationErrors[maxOutputPath] ??
    (outputExceedsContext
      ? 'Max output must be less than max context'
      : undefined);

  return (
    <div className={styles.group}>
      <h3 className={styles.heading}>{title}</h3>

      <TextField
        value={String(values[modelPath] ?? '')}
        isInvalid={modelPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue(modelPath, val);
        }}
      >
        <Label>Model</Label>
        <Input placeholder={modelPlaceholder} />
        <Description>{modelDescription}</Description>
        {validationErrors[modelPath] && (
          <FieldError>{validationErrors[modelPath]}</FieldError>
        )}
      </TextField>

      <Select
        value={String(values[thinkingLevelPath])}
        isInvalid={thinkingLevelPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue(thinkingLevelPath, String(value));
          }
        }}
      >
        <Label>Thinking Level</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>Extended-thinking effort for this model</Description>
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
        {validationErrors[thinkingLevelPath] && (
          <FieldError>{validationErrors[thinkingLevelPath]}</FieldError>
        )}
      </Select>

      <NumberField
        value={maxContext}
        isInvalid={maxContextPath in validationErrors}
        isDisabled={isDisabled}
        minValue={1}
        onChange={(value) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            setValue(maxContextPath, value);
          }
        }}
      >
        <Label>Max Context</Label>
        <Input />
        <Description>
          Full context window in tokens (prompt + output)
        </Description>
        {validationErrors[maxContextPath] && (
          <FieldError>{validationErrors[maxContextPath]}</FieldError>
        )}
      </NumberField>

      <NumberField
        value={maxOutput}
        isInvalid={maxOutputPath in validationErrors || outputExceedsContext}
        isDisabled={isDisabled}
        minValue={1}
        onChange={(value) => {
          if (typeof value === 'number' && Number.isFinite(value)) {
            setValue(maxOutputPath, value);
          }
        }}
      >
        <Label>Max Output</Label>
        <Input />
        <Description>Max output tokens per response</Description>
        {maxOutputError && <FieldError>{maxOutputError}</FieldError>}
      </NumberField>
    </div>
  );
}
```

- [ ] **Step 5: Write the styles**

Create `apps/frontend/src/pages/settings/components/ModelSettingsFields/styles.module.css`:

```css
.group {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.heading {
  font-size: 16px;
  font-weight: 600;
  color: var(--foreground);
}
```

- [ ] **Step 6: Write the entry point**

Create `apps/frontend/src/pages/settings/components/ModelSettingsFields/index.ts`:

```ts
export {ModelSettingsFields} from './ModelSettingsFields.js';
```

- [ ] **Step 7: Run the component test to verify it passes**

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/settings/components/ModelSettingsFields
git commit -m "feat(frontend): add reusable ModelSettingsFields component"
```

---

## Task 4: Frontend — wire the component into the Chat and Coding sections

**Files:**

- Modify: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSection.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSection.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSectionFields.tsx`

**Interfaces:**

- Consumes: `ModelSettingsFields` (Task 3); nested schema (Task 1); `SettingSection` engine.

- [ ] **Step 1: Rebuild the Chat section `FIELDS`**

Replace the entire contents of `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSection.tsx`:

```tsx
import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {ChatLlmSectionFields} from './ChatLlmSectionFields.js';

const llmShape = settingsSchema.shape.llm.unwrap().shape;
const mainShape = llmShape.main.unwrap().shape;
const lightShape = llmShape.light.unwrap().shape;

const FIELDS = [
  {path: 'llm/apiFormat', schema: llmShape.apiFormat},
  {path: 'llm/apiKey', schema: llmShape.apiKey},
  {path: 'llm/baseUrl', schema: llmShape.baseUrl},
  {path: 'llm/main/model', schema: mainShape.model},
  {path: 'llm/main/thinkingLevel', schema: mainShape.thinkingLevel},
  {path: 'llm/main/maxContextTokens', schema: mainShape.maxContextTokens},
  {path: 'llm/main/maxOutputTokens', schema: mainShape.maxOutputTokens},
  {path: 'llm/light/model', schema: lightShape.model},
  {path: 'llm/light/thinkingLevel', schema: lightShape.thinkingLevel},
  {path: 'llm/light/maxContextTokens', schema: lightShape.maxContextTokens},
  {path: 'llm/light/maxOutputTokens', schema: lightShape.maxOutputTokens},
];

export function ChatLlmSection() {
  return (
    <SettingSection title='Chat Agent' fields={FIELDS}>
      {(props) => <ChatLlmSectionFields {...props} />}
    </SettingSection>
  );
}
```

- [ ] **Step 2: Rebuild the Chat section fields view**

Replace the entire contents of `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx`:

```tsx
import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@heroui/react';

import {ModelSettingsFields} from '../../../components/ModelSettingsFields/index.js';
import type {SettingSectionRenderProps} from '../../../components/SettingSection/index.js';

export function ChatLlmSectionFields(props: SettingSectionRenderProps) {
  const {values, setValue, validationErrors, isDisabled} = props;
  return (
    <>
      <Select
        value={String(values['llm/apiFormat'])}
        isInvalid={'llm/apiFormat' in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue('llm/apiFormat', String(value));
          }
        }}
      >
        <Label>API Format</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>Protocol format for the LLM API</Description>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id='claude' textValue='Claude'>
              Claude
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id='openai-responses' textValue='OpenAI Responses'>
              OpenAI Responses
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
        {validationErrors['llm/apiFormat'] && (
          <FieldError>{validationErrors['llm/apiFormat']}</FieldError>
        )}
      </Select>

      <TextField
        value={String(values['llm/apiKey'])}
        isInvalid={'llm/apiKey' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('llm/apiKey', val);
        }}
        type='password'
      >
        <Label>API Key</Label>
        <Input placeholder='sk-...' />
        <Description>API key for the LLM service</Description>
        {validationErrors['llm/apiKey'] && (
          <FieldError>{validationErrors['llm/apiKey']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['llm/baseUrl'])}
        isInvalid={'llm/baseUrl' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('llm/baseUrl', val);
        }}
      >
        <Label>Base URL</Label>
        <Input placeholder='https://api.anthropic.com' type='url' />
        <Description>Base URL of the LLM API</Description>
        {validationErrors['llm/baseUrl'] && (
          <FieldError>{validationErrors['llm/baseUrl']}</FieldError>
        )}
      </TextField>

      <ModelSettingsFields {...props} prefix='llm/main' title='Main model' />
      <ModelSettingsFields
        {...props}
        prefix='llm/light'
        title='Light model'
        modelPlaceholder='claude-haiku-4-20250514'
        modelDescription='Model for lightweight tasks (e.g. title generation). Falls back to the main model if empty.'
      />
    </>
  );
}
```

- [ ] **Step 3: Rebuild the Coding section `FIELDS`**

Replace the entire contents of `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSection.tsx`:

```tsx
import {settingsSchema} from '@omnicraft/settings-schema';

import {SettingSection} from '../../../components/SettingSection/index.js';
import {CodingLlmSectionFields} from './CodingLlmSectionFields.js';

const codingLlmShape = settingsSchema.shape.codingLlm.unwrap().shape;
const mainShape = codingLlmShape.main.unwrap().shape;
const lightShape = codingLlmShape.light.unwrap().shape;

const FIELDS = [
  {path: 'codingLlm/apiFormat', schema: codingLlmShape.apiFormat},
  {path: 'codingLlm/apiKey', schema: codingLlmShape.apiKey},
  {path: 'codingLlm/baseUrl', schema: codingLlmShape.baseUrl},
  {path: 'codingLlm/main/model', schema: mainShape.model},
  {path: 'codingLlm/main/thinkingLevel', schema: mainShape.thinkingLevel},
  {path: 'codingLlm/main/maxContextTokens', schema: mainShape.maxContextTokens},
  {path: 'codingLlm/main/maxOutputTokens', schema: mainShape.maxOutputTokens},
  {path: 'codingLlm/light/model', schema: lightShape.model},
  {path: 'codingLlm/light/thinkingLevel', schema: lightShape.thinkingLevel},
  {
    path: 'codingLlm/light/maxContextTokens',
    schema: lightShape.maxContextTokens,
  },
  {path: 'codingLlm/light/maxOutputTokens', schema: lightShape.maxOutputTokens},
];

export function CodingLlmSection() {
  return (
    <SettingSection title='Coding Agent' fields={FIELDS}>
      {(props) => <CodingLlmSectionFields {...props} />}
    </SettingSection>
  );
}
```

- [ ] **Step 4: Rebuild the Coding section fields view**

Replace the entire contents of `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSectionFields.tsx` with the same structure as Step 2 but with the `codingLlm/` prefix on the connection fields:

```tsx
import {
  Description,
  FieldError,
  Input,
  Label,
  ListBox,
  Select,
  TextField,
} from '@heroui/react';

import {ModelSettingsFields} from '../../../components/ModelSettingsFields/index.js';
import type {SettingSectionRenderProps} from '../../../components/SettingSection/index.js';

export function CodingLlmSectionFields(props: SettingSectionRenderProps) {
  const {values, setValue, validationErrors, isDisabled} = props;
  return (
    <>
      <Select
        value={String(values['codingLlm/apiFormat'])}
        isInvalid={'codingLlm/apiFormat' in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue('codingLlm/apiFormat', String(value));
          }
        }}
      >
        <Label>API Format</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>Protocol format for the LLM API</Description>
        <Select.Popover>
          <ListBox>
            <ListBox.Item id='claude' textValue='Claude'>
              Claude
              <ListBox.ItemIndicator />
            </ListBox.Item>
            <ListBox.Item id='openai-responses' textValue='OpenAI Responses'>
              OpenAI Responses
              <ListBox.ItemIndicator />
            </ListBox.Item>
          </ListBox>
        </Select.Popover>
        {validationErrors['codingLlm/apiFormat'] && (
          <FieldError>{validationErrors['codingLlm/apiFormat']}</FieldError>
        )}
      </Select>

      <TextField
        value={String(values['codingLlm/apiKey'])}
        isInvalid={'codingLlm/apiKey' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('codingLlm/apiKey', val);
        }}
        type='password'
      >
        <Label>API Key</Label>
        <Input placeholder='sk-...' />
        <Description>API key for the LLM service</Description>
        {validationErrors['codingLlm/apiKey'] && (
          <FieldError>{validationErrors['codingLlm/apiKey']}</FieldError>
        )}
      </TextField>

      <TextField
        value={String(values['codingLlm/baseUrl'])}
        isInvalid={'codingLlm/baseUrl' in validationErrors}
        isDisabled={isDisabled}
        onChange={(val) => {
          setValue('codingLlm/baseUrl', val);
        }}
      >
        <Label>Base URL</Label>
        <Input placeholder='https://api.anthropic.com' type='url' />
        <Description>Base URL of the LLM API</Description>
        {validationErrors['codingLlm/baseUrl'] && (
          <FieldError>{validationErrors['codingLlm/baseUrl']}</FieldError>
        )}
      </TextField>

      <ModelSettingsFields
        {...props}
        prefix='codingLlm/main'
        title='Main model'
      />
      <ModelSettingsFields
        {...props}
        prefix='codingLlm/light'
        title='Light model'
        modelPlaceholder='claude-haiku-4-20250514'
        modelDescription='Model for lightweight tasks (e.g. title generation). Falls back to the main model if empty.'
      />
    </>
  );
}
```

- [ ] **Step 5: Typecheck and test the frontend**

Run: `pnpm --filter @omnicraft/frontend typecheck`
Expected: no errors.
Run: `pnpm --filter @omnicraft/frontend test`
Expected: PASS.

- [ ] **Step 6: Browser validation (both themes)**

Start the dev server from the repo root (`pnpm dev`), open the app, go to Settings → Chat Agent and Settings → Coding Agent. Verify each shows: API Format, API Key, Base URL, then a "Main model" group (Model / Thinking Level / Max Context / Max Output) and a "Light model" group. Change Max Output above Max Context and confirm the inline "Max output must be less than max context" error appears. Save and confirm the toast. Repeat the visual check in **light and dark** themes. Capture screenshots for the PR.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/settings/sections
git commit -m "feat(frontend): render per-model settings for main and light models"
```

---

## Task 5: One-time settings migration script

**Files:**

- Create: `apps/backend/scripts/migrate-settings-lib.ts`
- Test: `apps/backend/scripts/migrate-settings-lib.test.ts`
- Create: `apps/backend/scripts/migrate-settings-to-nested-models.ts`

**Interfaces:**

- Produces: `migrateLlmBlock(block)` and `migrateSettings(raw)` pure functions; a runnable CLI that reads `~/.omni-craft/settings.json` (or `$DATA_DIR/settings.json`), backs it up, and writes the migrated file.

- [ ] **Step 1: Write the failing migration-lib test**

Create `apps/backend/scripts/migrate-settings-lib.test.ts`:

```ts
import {describe, expect, it} from 'vitest';

import {migrateLlmBlock, migrateSettings} from './migrate-settings-lib.js';

describe('migrateLlmBlock', () => {
  it('moves flat model/thinkingLevel/lightModel into nested main/light', () => {
    const result = migrateLlmBlock({
      apiFormat: 'claude',
      apiKey: 'secret',
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-opus-4.8',
      lightModel: 'claude-haiku-4.5',
      thinkingLevel: 'high',
    });
    expect(result).toEqual({
      apiFormat: 'claude',
      apiKey: 'secret',
      baseUrl: 'https://api.anthropic.com',
      main: {
        model: 'claude-opus-4.8',
        thinkingLevel: 'high',
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      },
      light: {
        model: 'claude-haiku-4.5',
        thinkingLevel: 'high',
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      },
    });
  });

  it('is idempotent when already migrated', () => {
    const already = {
      apiFormat: 'claude',
      main: {
        model: 'x',
        thinkingLevel: 'none',
        maxContextTokens: 1,
        maxOutputTokens: 1,
      },
      light: {
        model: '',
        thinkingLevel: 'none',
        maxContextTokens: 1,
        maxOutputTokens: 1,
      },
    };
    expect(migrateLlmBlock(already)).toBe(already);
  });

  it('migrates both llm and codingLlm in the whole settings object', () => {
    const migrated = migrateSettings({
      llm: {model: 'a', lightModel: '', thinkingLevel: 'none'},
      codingLlm: {model: 'b', lightModel: 'c', thinkingLevel: 'low'},
      agent: {maxToolRounds: 20},
    });
    expect((migrated.llm as {main: {model: string}}).main.model).toBe('a');
    expect((migrated.codingLlm as {light: {model: string}}).light.model).toBe(
      'c',
    );
    expect(migrated.agent).toEqual({maxToolRounds: 20});
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run scripts/migrate-settings-lib.test.ts`
Expected: FAIL — `./migrate-settings-lib.js` does not exist.

- [ ] **Step 3: Write the migration library**

Create `apps/backend/scripts/migrate-settings-lib.ts`:

```ts
const DEFAULT_MAX_CONTEXT_TOKENS = 200_000;
const DEFAULT_MAX_OUTPUT_TOKENS = 32_000;
const DEFAULT_MAIN_MODEL = 'claude-sonnet-4-20250514';

type Json = Record<string, unknown>;

/** Migrates one LLM block from the flat shape to the nested main/light shape. */
export function migrateLlmBlock(block: Json): Json {
  if (block.main !== undefined) {
    return block;
  }
  const {model, lightModel, thinkingLevel, ...connection} = block;
  const thinking = typeof thinkingLevel === 'string' ? thinkingLevel : 'none';
  return {
    ...connection,
    main: {
      model: typeof model === 'string' && model ? model : DEFAULT_MAIN_MODEL,
      thinkingLevel: thinking,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    },
    light: {
      model: typeof lightModel === 'string' ? lightModel : '',
      thinkingLevel: thinking,
      maxContextTokens: DEFAULT_MAX_CONTEXT_TOKENS,
      maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS,
    },
  };
}

/** Migrates the whole settings object (both llm and codingLlm blocks). */
export function migrateSettings(raw: Json): Json {
  const result: Json = {...raw};
  for (const key of ['llm', 'codingLlm']) {
    const block = result[key];
    if (block !== null && typeof block === 'object') {
      result[key] = migrateLlmBlock(block as Json);
    }
  }
  return result;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run scripts/migrate-settings-lib.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Write the runnable CLI**

Create `apps/backend/scripts/migrate-settings-to-nested-models.ts`:

```ts
import {copyFile, readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {migrateSettings} from './migrate-settings-lib.js';

const dataDir = process.env.DATA_DIR ?? path.join(os.homedir(), '.omni-craft');
const settingsPath = path.join(dataDir, 'settings.json');

const raw = JSON.parse(await readFile(settingsPath, 'utf-8')) as Record<
  string,
  unknown
>;
await copyFile(settingsPath, `${settingsPath}.pre-nested-migration.bak`);
const migrated = migrateSettings(raw);
await writeFile(settingsPath, JSON.stringify(migrated, null, 2) + '\n');
process.stdout.write(
  `Migrated ${settingsPath} (backup at ${settingsPath}.pre-nested-migration.bak)\n`,
);
```

- [ ] **Step 6: Commit**

```bash
git add apps/backend/scripts
git commit -m "chore(backend): add one-time settings migration to nested model config"
```

---

## Task 6: Repo-wide verification and migration run

**Files:** none (verification + one-time operational run).

- [ ] **Step 1: Repo-wide typecheck**

Run: `pnpm typecheck:all`
Expected: no errors across all packages.

- [ ] **Step 2: Repo-wide lint + format check**

Run: `pnpm lint:all`
Run: `pnpm format:check`
Expected: clean (run `pnpm format` if the format check reports files).

- [ ] **Step 3: Run all tests**

Run: `pnpm --filter @omnicraft/settings-schema test && pnpm --filter @omnicraft/backend test && pnpm --filter @omnicraft/frontend test`
Expected: all PASS.

- [ ] **Step 4: Migrate the local settings file**

Only if `~/.omni-craft/settings.json` (or `$DATA_DIR/settings.json`) exists and predates this change:

Run: `pnpm --filter @omnicraft/backend exec tsx scripts/migrate-settings-to-nested-models.ts`
Expected: prints the migrated path and backup path. Confirm the file now has `llm.main` / `llm.light` (and `codingLlm.*`) and that `apiKey` is preserved.

- [ ] **Step 5: End-to-end check**

Start the app (`pnpm dev`), open Settings, confirm both LLM sections load with the migrated values populated, save a change, and start one chat turn to confirm a completion streams (limits resolve from settings). No commit needed for this step.

---

## Self-Review

**Spec coverage:**

- Hand-written max context / max output → Task 1 (schema) + Task 3/4 (UI). ✓
- Delete hardcoded tables + Anthropic auto-fetch → Task 2, Step 5. ✓
- Input budget = context − output, clamped ≥ 1 → Task 2, Step 4. ✓
- Independent light model (own name/thinking/limits) → Task 1 (`light` config) + Task 2, Step 7 (`getLightConfig`) + Task 4 (second `ModelSettingsFields`). ✓
- Chat/Coding stay independent (own connection fields) → connection fields rendered per section; schema composes `llm`/`codingLlm` separately. ✓
- Reusable per-model component → Task 3. ✓
- Cross-field validation in the component + backend clamp → Task 3 (component) + Task 2, Step 4 (clamp). ✓
- One-time migration script (not in-app), preserves old thinking level into light → Task 5. ✓
- No usage-wire-format change → `contextWindowTokens` still fed by `getMaxPromptTokens`; `SseUsage` untouched. ✓

**Placeholder scan:** No TBD/TODO; every code step shows complete code. The only non-literal step is Task 2 Step 9 (fixture updates), which is a typecheck-driven mechanical transformation with the exact snippet and file list shown — acceptable because the set is defined by the compiler, not left vague.

**Type consistency:** `modelCapacity` exposes `getMaxOutputTokens`/`getMaxPromptTokens` (sync) consistently across the rewrite (Task 2 Step 4), the test (Step 1), and all consumers (Step 6); `getMaxContextWindowTokens` is removed everywhere (no remaining callers after Step 6 — its only prior caller was the deleted test). `LlmConfig` gains `maxContextTokens`/`maxOutputTokens` (Step 3) and every builder/fixture provides them (Steps 7–9). Frontend field paths (`<prefix>/model`, `/thinkingLevel`, `/maxContextTokens`, `/maxOutputTokens`) match between `ModelSettingsFields` (Task 3) and the `FIELDS` arrays (Task 4). Schema exports (`mainModelSettingsSchema`, `lightModelSettingsSchema`, `llmSettingsSchema`, `thinkingLevelSchema`, `ThinkingLevel`) are consumed via `settingsSchema.shape…` introspection only, so no import churn beyond the sections.
