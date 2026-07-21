# Uniform Three-Tier Model Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the two-tier (`main`/`light`) model settings with a uniform three-tier capability ladder (`powerful`/`versatile`/`lightweight`) plus a `defaultTier` selector, shared by the chat and coding agents, and route subagent dispatch through the chosen tier.

**Architecture:** One `llmSettingsSchema` (used by both `settings.llm` and `settings.codingLlm`) defines the three tiers, a `defaultTier` anchor, and a full-config cascade. A pure `resolveModelConfig(llmSettings, tier)` helper flattens a tier to an `LlmConfig`. Agent-core's fixed `getLightConfig` is generalized to `getTierConfig(tier)`, and the shared `dispatch_agent` tool exposes a three-value `model` enum (default `versatile`).

**Tech Stack:** TypeScript, Zod 4.4, Node.js + `tsx`, PNPM workspaces, Koa (backend), React 19 + Vite + HeroUI v3 (frontend), Vitest.

## Global Constraints

- Package manager is **PNPM**; run package scripts with `pnpm --filter <name> <script>`.
- Tier names verbatim: `powerful`, `versatile`, `lightweight`. `defaultTier` defaults to `'powerful'`. `dispatch_agent` defaults the tier to `'versatile'`.
- Anchor (`powerful`) model default: `'claude-sonnet-4-20250514'`.
- The full-config cascade inherits **the entire tier config** (model + thinkingLevel + maxContextTokens + maxOutputTokens), walking toward the anchor.
- TypeScript: never use `any` (use `unknown` + narrowing); no non-null assertions (`!`); early-return style.
- Backend: no default exports; relative imports use the `.js` extension; use the `@/*` alias across modules; no `console` (use `logger`); group functions with object-literal namespaces where the file already does.
- **Do not re-export a workspace package's exports from a local barrel.** Import `modelTierSchema` / `ModelTier` / `MODEL_TIER_LADDER` / `LlmSettings` **directly** from `@omnicraft/settings-schema` wherever needed. (This intentionally deviates from spec §1, which proposed an `@omnicraft/api-schema` re-export — the repo CLAUDE.md forbids it.)
- Frontend: CSS Modules only (no Tailwind in our components); use HeroUI (`@heroui/react`) components; one React component per file; keep layout props in the parent; validate UI in a browser in **both light and dark themes**.
- After a pre-commit hook formats files, do not re-run compile/test solely because of formatting.
- Commit messages follow Conventional Commits.

---

## File Structure

**Created:**

- `apps/backend/src/agent/model-tier/resolve-model-config.ts` — pure tier→`LlmConfig` resolver
- `apps/backend/src/agent/model-tier/resolve-model-config.test.ts` — resolver tests
- `apps/backend/src/agent/model-tier/index.ts` — barrel for the resolver
- `apps/frontend/src/pages/settings/components/LlmSettingsFields/LlmSettingsFields.tsx` — shared tier fields view
- `apps/frontend/src/pages/settings/components/LlmSettingsFields/LlmSettingsFields.test.tsx`
- `apps/frontend/src/pages/settings/components/LlmSettingsFields/helpers/build-llm-setting-fields.ts` — derives `FieldConfig[]` from the schema
- `apps/frontend/src/pages/settings/components/LlmSettingsFields/index.ts`
- `scripts/migrate-model-tiers.ts` — throwaway local settings migration (deleted after use)

**Modified:**

- `packages/settings-schema/src/llm/schema.ts` — add tiers, `defaultTier`, cascade anchor refine
- `packages/settings-schema/src/index.ts` — export new symbols
- `packages/settings-schema/src/schema.test.ts` — new-tier defaults + refine
- `apps/backend/src/agent-core/agent/{types,agent,agent-runtime-state,agent-tool-executor,agent-turn-runner}.ts` — `getLightConfig` → `getTierConfig(tier)`
- `apps/backend/src/agent-core/tool/{types,testing}.ts` — context `getTierConfig`
- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` (+ `.test.ts`) — three-tier `model`
- `apps/backend/src/agent/agents/{main-agent,coding-agent}/*.ts` — resolver wiring + system-prompt note
- `apps/frontend/src/pages/settings/sections/llm/chat/*`, `.../coding/agent/*` — use shared fields
- `apps/frontend/src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.tsx` (+ test) — optional `modelError`
- backend agent-core test files — `getLightConfig` → `getTierConfig` property rename

**Migration strategy:** additive first (Task 1 keeps `main`/`light` alongside the new tiers so the repo keeps compiling), consumers move to tiers (Tasks 2–5), then legacy fields are removed once unreferenced (Task 6).

---

## Task 1: Settings schema — add three tiers + `defaultTier`

**Files:**

- Modify: `packages/settings-schema/src/llm/schema.ts`
- Modify: `packages/settings-schema/src/index.ts`
- Test: `packages/settings-schema/src/schema.test.ts`

**Interfaces:**

- Produces: `MODEL_TIER_LADDER` (`readonly ['lightweight','versatile','powerful']`), `modelTierSchema` (`z.enum`), `type ModelTier`, `tierModelSettingsSchema`, `type LlmSettings = z.infer<typeof llmSettingsSchema>`. `llmSettingsSchema` gains `defaultTier`, `powerful`, `versatile`, `lightweight` (and still has `main`/`light` until Task 6).

- [ ] **Step 1: Add the new failing tests**

Append to `packages/settings-schema/src/schema.test.ts`:

```ts
describe('model tiers', () => {
  it('defaults defaultTier to powerful with a concrete anchor model', () => {
    const parsed = settingsSchema.parse({});
    expect(parsed.llm.defaultTier).toBe('powerful');
    expect(parsed.llm.powerful.model).toBe('claude-sonnet-4-20250514');
    expect(parsed.llm.versatile.model).toBe('');
    expect(parsed.llm.lightweight.model).toBe('');
    expect(parsed.codingLlm.defaultTier).toBe('powerful');
  });

  it('rejects a blank model on the selected default tier', () => {
    const result = settingsSchema.safeParse({
      llm: {defaultTier: 'versatile', versatile: {model: ''}},
    });
    expect(result.success).toBe(false);
    expect(result.success ? [] : result.error.issues[0]?.path).toEqual([
      'llm',
      'versatile',
      'model',
    ]);
  });

  it('allows blank non-anchor tiers', () => {
    const result = settingsSchema.safeParse({
      llm: {powerful: {model: 'opus'}, versatile: {model: ''}},
    });
    expect(result.success).toBe(true);
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @omnicraft/settings-schema exec vitest run src/schema.test.ts`
Expected: FAIL (`defaultTier`/`powerful` are undefined).

- [ ] **Step 3: Add the tier schemas and fields**

In `packages/settings-schema/src/llm/schema.ts`, after the `lightModelSettingsSchema` block and before `llmSettingsSchema`, add:

```ts
/** Model capability tiers, ordered from cheapest/lowest to most capable. */
export const MODEL_TIER_LADDER = [
  'lightweight',
  'versatile',
  'powerful',
] as const;

export const modelTierSchema = z.enum(MODEL_TIER_LADDER);

export type ModelTier = (typeof MODEL_TIER_LADDER)[number];

/** A single tier's model config. Blank `model` inherits the default tier. */
export const tierModelSettingsSchema = baseModelSettingsSchema
  .extend({
    model: z
      .string()
      .describe(
        'Model name for this tier. Leave empty to inherit the default tier.',
      )
      .default(''),
  })
  .refine((config) => config.maxContextTokens > config.maxOutputTokens, {
    error: OUTPUT_EXCEEDS_CONTEXT_MESSAGE,
    path: ['maxOutputTokens'],
  });
```

Then replace the `llmSettingsSchema` definition with (note: `main`/`light` stay for now):

```ts
export const llmSettingsSchema = z
  .object({
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
    defaultTier: modelTierSchema
      .describe('Tier the agent runs on; also the fallback for blank tiers')
      .default('powerful'),
    powerful: tierModelSettingsSchema.prefault({
      model: 'claude-sonnet-4-20250514',
    }),
    versatile: tierModelSettingsSchema.prefault({}),
    lightweight: tierModelSettingsSchema.prefault({}),
  })
  .check((ctx) => {
    const settings = ctx.value;
    if (settings[settings.defaultTier].model.trim().length === 0) {
      ctx.issues.push({
        code: 'custom',
        message: 'The default tier must have a model',
        path: [settings.defaultTier, 'model'],
        input: settings,
      });
    }
  });

export type LlmSettings = z.infer<typeof llmSettingsSchema>;
```

- [ ] **Step 4: Export the new symbols**

In `packages/settings-schema/src/index.ts`, extend the `./llm/schema.js` export block to:

```ts
export {
  llmSettingsSchema,
  type LlmSettings,
  MODEL_TIER_LADDER,
  type ModelTier,
  modelTierSchema,
  type ThinkingLevel,
  thinkingLevelSchema,
} from './llm/schema.js';
```

- [ ] **Step 5: Run the full settings-schema tests**

Run: `pnpm --filter @omnicraft/settings-schema test`
Expected: PASS (new tests + existing `main`/`light` tests + `toJSONSchema` tests).

- [ ] **Step 6: Commit**

```bash
git add packages/settings-schema/src/llm/schema.ts packages/settings-schema/src/index.ts packages/settings-schema/src/schema.test.ts
git commit -m "feat(settings): add powerful/versatile/lightweight model tiers"
```

---

## Task 2: `resolveModelConfig` cascade resolver

**Files:**

- Create: `apps/backend/src/agent/model-tier/resolve-model-config.ts`
- Create: `apps/backend/src/agent/model-tier/index.ts`
- Test: `apps/backend/src/agent/model-tier/resolve-model-config.test.ts`

**Interfaces:**

- Consumes: `LlmSettings`, `ModelTier`, `MODEL_TIER_LADDER` from `@omnicraft/settings-schema`; `LlmConfig` from `@/agent-core/llm-api/index.js`.
- Produces: `resolveModelConfig(llmSettings: LlmSettings, tier: ModelTier): LlmConfig`.

- [ ] **Step 1: Write the failing tests**

Create `apps/backend/src/agent/model-tier/resolve-model-config.test.ts`:

```ts
import {llmSettingsSchema, type LlmSettings} from '@omnicraft/settings-schema';
import {describe, expect, it} from 'vitest';

import {resolveModelConfig} from './resolve-model-config.js';

function build(overrides: Record<string, unknown>): LlmSettings {
  return llmSettingsSchema.parse({
    apiFormat: 'claude',
    apiKey: 'k',
    baseUrl: 'https://api.anthropic.com',
    ...overrides,
  });
}

describe('resolveModelConfig', () => {
  it('returns each tier when all are configured', () => {
    const s = build({
      powerful: {model: 'opus'},
      versatile: {model: 'sonnet'},
      lightweight: {model: 'haiku'},
    });
    expect(resolveModelConfig(s, 'powerful').model).toBe('opus');
    expect(resolveModelConfig(s, 'versatile').model).toBe('sonnet');
    expect(resolveModelConfig(s, 'lightweight').model).toBe('haiku');
  });

  it('falls a blank lightweight up to versatile when set', () => {
    const s = build({powerful: {model: 'opus'}, versatile: {model: 'sonnet'}});
    expect(resolveModelConfig(s, 'lightweight').model).toBe('sonnet');
  });

  it('falls blank tiers up to the powerful anchor', () => {
    const s = build({powerful: {model: 'opus'}});
    expect(resolveModelConfig(s, 'lightweight').model).toBe('opus');
    expect(resolveModelConfig(s, 'versatile').model).toBe('opus');
  });

  it('inherits the full config of the resolved tier', () => {
    const s = build({
      powerful: {
        model: 'opus',
        thinkingLevel: 'high',
        maxContextTokens: 300_000,
        maxOutputTokens: 50_000,
      },
    });
    const resolved = resolveModelConfig(s, 'lightweight');
    expect(resolved.thinkingLevel).toBe('high');
    expect(resolved.maxContextTokens).toBe(300_000);
    expect(resolved.maxOutputTokens).toBe(50_000);
  });

  it('carries the shared connection fields', () => {
    const s = build({powerful: {model: 'opus'}});
    const resolved = resolveModelConfig(s, 'versatile');
    expect(resolved.apiKey).toBe('k');
    expect(resolved.baseUrl).toBe('https://api.anthropic.com');
    expect(resolved.apiFormat).toBe('claude');
  });

  it('walks toward a non-powerful anchor', () => {
    const s = build({
      defaultTier: 'lightweight',
      lightweight: {model: 'haiku'},
    });
    expect(resolveModelConfig(s, 'powerful').model).toBe('haiku');
    expect(resolveModelConfig(s, 'versatile').model).toBe('haiku');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/model-tier/resolve-model-config.test.ts`
Expected: FAIL (`resolve-model-config` module not found).

- [ ] **Step 3: Implement the resolver**

Create `apps/backend/src/agent/model-tier/resolve-model-config.ts`:

```ts
import {
  type LlmSettings,
  MODEL_TIER_LADDER,
  type ModelTier,
} from '@omnicraft/settings-schema';

import type {LlmConfig} from '@/agent-core/llm-api/index.js';

/** Finds the nearest configured tier when walking from `tier` toward the anchor. */
function resolveTierName(llmSettings: LlmSettings, tier: ModelTier): ModelTier {
  const anchor = llmSettings.defaultTier;
  const from = MODEL_TIER_LADDER.indexOf(tier);
  const to = MODEL_TIER_LADDER.indexOf(anchor);
  const step = Math.sign(to - from);

  let index = from;
  for (;;) {
    const name = MODEL_TIER_LADDER[index];
    if (llmSettings[name].model.trim().length > 0) return name;
    if (index === to) return anchor;
    index += step;
  }
}

/** Flattens one model tier into a concrete LLM config, applying the cascade. */
export function resolveModelConfig(
  llmSettings: LlmSettings,
  tier: ModelTier,
): LlmConfig {
  const resolved = llmSettings[resolveTierName(llmSettings, tier)];
  return {
    apiFormat: llmSettings.apiFormat,
    apiKey: llmSettings.apiKey,
    baseUrl: llmSettings.baseUrl,
    model: resolved.model,
    thinkingLevel: resolved.thinkingLevel,
    maxContextTokens: resolved.maxContextTokens,
    maxOutputTokens: resolved.maxOutputTokens,
  };
}
```

Create `apps/backend/src/agent/model-tier/index.ts`:

```ts
export {resolveModelConfig} from './resolve-model-config.js';
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/model-tier/resolve-model-config.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/backend/src/agent/model-tier
git commit -m "feat(backend): add resolveModelConfig tier cascade helper"
```

---

## Task 3: Route agent-core, dispatch, and agents through tiers

Replaces `getLightConfig` with `getTierConfig(tier)` end-to-end, points the `dispatch_agent` tool at the three tiers, wires both agents to `resolveModelConfig`, and moves title generation to the `lightweight` tier. All files change together because removing `getLightConfig` from the shared context breaks its consumers until they migrate.

**Files:**

- Modify: `apps/backend/src/agent-core/agent/types.ts:57`
- Modify: `apps/backend/src/agent-core/agent/agent.ts:57,98,330,342-344`
- Modify: `apps/backend/src/agent-core/agent/agent-runtime-state.ts:26,89`
- Modify: `apps/backend/src/agent-core/agent/agent-tool-executor.ts:37,76`
- Modify: `apps/backend/src/agent-core/agent/agent-turn-runner.ts:54,241`
- Modify: `apps/backend/src/agent-core/tool/types.ts:84`
- Modify: `apps/backend/src/agent-core/tool/testing.ts:65`
- Modify: `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`
- Modify: `apps/backend/src/agent/agents/main-agent/main-agent.ts`
- Modify: `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`
- Test (rename only): `agent-runtime-state.test.ts`, `agent-turn-runner.test.ts`, `agent.test.ts`, `agent-tool-executor.test.ts`, `stop-checks/todo-stop-check.test.ts`
- Test (behavior): `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`

**Interfaces:**

- Consumes: `resolveModelConfig` (Task 2); `ModelTier`, `modelTierSchema` from `@omnicraft/settings-schema`.
- Produces: `ToolExecutionContext.getTierConfig(tier: ModelTier): Promise<LlmConfig>`; `AgentOptions.getTierConfig?`; `dispatch_agent` `model` param is `ModelTier` (default `'versatile'`).

- [ ] **Step 1: Generalize the context type**

In `apps/backend/src/agent-core/tool/types.ts`, add the import and replace the `getLightConfig` member:

```ts
import type {ModelTier} from '@omnicraft/settings-schema';
```

```ts
  /** Returns the LLM configuration of the parent agent. */
  readonly getConfig: () => Promise<LlmConfig>;

  /** Resolves the parent agent's LLM config for a given model tier. */
  readonly getTierConfig: (tier: ModelTier) => Promise<LlmConfig>;
```

- [ ] **Step 2: Thread `getTierConfig` through the runtime-state, executor, and turn-runner**

In `agent-runtime-state.ts`: add `import type {ModelTier} from '@omnicraft/settings-schema';`, change line 26 to `readonly getTierConfig: (tier: ModelTier) => Promise<LlmConfig>;`, and change line 89 to `getTierConfig: input.getTierConfig,`.

In `agent-tool-executor.ts`: add `import type {ModelTier} from '@omnicraft/settings-schema';`, change line 37 to `readonly getTierConfig: (tier: ModelTier) => Promise<LlmConfig>;`, and change line 76 to `getTierConfig: input.getTierConfig,`.

In `agent-turn-runner.ts`: add `import type {ModelTier} from '@omnicraft/settings-schema';`, change line 54 to `readonly getTierConfig: (tier: ModelTier) => Promise<LlmConfig>;`, and change line 241 to `getTierConfig: input.getTierConfig,`.

- [ ] **Step 3: Update `AgentOptions` and `Agent`**

In `agent-core/agent/types.ts`: add `import type {ModelTier} from '@omnicraft/settings-schema';` and replace line 57 with:

```ts
  readonly getTierConfig?: (tier: ModelTier) => Promise<LlmConfig>;
```

In `agent-core/agent/agent.ts`:

- Add `import type {ModelTier} from '@omnicraft/settings-schema';`.
- Replace line 57 field with:

```ts
  private readonly getTierConfig:
    | ((tier: ModelTier) => Promise<LlmConfig>)
    | null;
```

- Replace line 98 with `this.getTierConfig = options.getTierConfig ?? null;`.
- Add a private helper (e.g. above `runAgentLoop`):

```ts
  private resolveTierConfig(tier: ModelTier): Promise<LlmConfig> {
    return this.getTierConfig ? this.getTierConfig(tier) : this.getConfig();
  }
```

- In `runAgentLoop`, replace the `getLightConfig` line (330) with:

```ts
      getTierConfig: (tier) => this.resolveTierConfig(tier),
```

- In `generateAndEmitTitle`, replace lines 342-344 with:

```ts
  private async generateAndEmitTitle(userMessage: string): Promise<void> {
    this.title = await generateTitle(userMessage, () =>
      this.resolveTierConfig('lightweight'),
    );
```

- [ ] **Step 4: Update the mock context builder**

In `apps/backend/src/agent-core/tool/testing.ts`, replace the `getLightConfig:` property (line 65) with `getTierConfig` — keep the same resolved value; the zero-arg function is assignable to `(tier) => …`:

```ts
    getTierConfig: () =>
      Promise.resolve({
        apiFormat: 'claude' as const,
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: 'mock-light-model',
        thinkingLevel: 'none' as const,
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      }),
```

- [ ] **Step 5: Rename `getLightConfig` in the agent-core test setups**

In each of these files, rename the object property `getLightConfig:` to `getTierConfig:` (values unchanged):

- `agent-runtime-state.test.ts` (lines 40, 52, 93, 125)
- `agent-turn-runner.test.ts` (line 149)
- `agent.test.ts` (line 77)
- `agent-tool-executor.test.ts` (line 72)
- `stop-checks/todo-stop-check.test.ts` (line 20)

Run: `git grep -n "getLightConfig" apps/backend/src/agent-core`
Expected: no matches remain.

- [ ] **Step 6: Update the dispatch tool to the three tiers**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`:

- Add `import {modelTierSchema, type ModelTier} from '@omnicraft/settings-schema';`.
- Add a tier-guidance table near `subAgentInfos`:

```ts
const modelTierInfos = {
  lightweight:
    'Cheapest and fastest. Use for trivial, well-defined subtasks where speed matters more than reasoning depth.',
  versatile:
    'Balanced default. Use for standard subtasks needing solid competence but not deep reasoning.',
  powerful:
    'Most capable and most expensive. Reserve for subtasks needing deep multi-step reasoning or complex analysis.',
} as const satisfies Record<ModelTier, string>;
```

- In `buildToolDescription`, append a tier section before the return:

```ts
const tierDescriptions = Object.entries(modelTierInfos)
  .map(([tier, info]) => `- ${tier}: ${info}`)
  .join('\n');

return (
  `${header}\n\nAvailable agent types:\n${typeDescriptions}` +
  `\n\nModel tiers (choose the cheapest that can do the job):\n${tierDescriptions}`
);
```

- Replace the `model` parameter definition with:

```ts
  model: modelTierSchema
    .optional()
    .describe(
      "Which model tier the subagent runs on. Defaults to 'versatile'. " +
        'Choose the cheapest tier that can do the job: raise it only when the ' +
        'subtask needs deeper reasoning, lower it when speed matters more.',
    ),
```

- In `execute`, change the destructure default and the config resolution:

```ts
const {
  task,
  agentType = SubAgentType.GENERAL,
  model = 'versatile',
  thinkingLevel = 'none',
} = args;
```

```ts
// Build config for the subagent — resolve the chosen tier and override thinking level.
const getConfig = async (): Promise<LlmConfig> => ({
  ...(await context.getTierConfig(model)),
  thinkingLevel,
});
```

(Delete the old `baseGetConfig` line that referenced `context.getLightConfig`.)

- [ ] **Step 7: Wire both agents to the resolver**

In `apps/backend/src/agent/agents/main-agent/main-agent.ts`, add `import {resolveModelConfig} from '@/agent/model-tier/index.js';`. Make exactly two edits, leaving `toolRegistries`, `skillRegistries`, `stopChecks`, `baseSystemPrompt`, `getMaxToolRounds`, `workingDirectory`, and `sessionsDir` untouched:

1. Replace the first `super()` argument (the primary `getConfig` callback, lines 33-45) with:

```ts
      async () => {
        const settings = await settingsService.getAll();
        return resolveModelConfig(settings.llm, settings.llm.defaultTier);
      },
```

2. Replace the `getLightConfig` option (lines 63-75) with:

```ts
        getTierConfig: async (tier) => {
          const settings = await settingsService.getAll();
          return resolveModelConfig(settings.llm, tier);
        },
```

Apply the identical two edits in `apps/backend/src/agent/agents/coding-agent/coding-agent.ts`, but read `settings.codingLlm` instead of `settings.llm` in both callbacks (leave `codingAgentSystemPrompt` and everything else untouched).

- [ ] **Step 8: Update the dispatch tool test for tier routing**

In `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`, ensure the mock context provides a `getTierConfig` that records the requested tier, and assert (a) omitting `model` resolves `'versatile'` and (b) `model: 'powerful'` resolves `'powerful'`. Example additions:

```ts
it("defaults the subagent to the 'versatile' tier", async () => {
  const seen: string[] = [];
  const context = createMockContext({
    workingDirectory: '/repo',
    getTierConfig: (tier) => {
      seen.push(tier);
      return Promise.resolve({
        apiFormat: 'claude' as const,
        apiKey: '',
        baseUrl: 'https://api.anthropic.com',
        model: `model-${tier}`,
        thinkingLevel: 'none' as const,
        maxContextTokens: 200_000,
        maxOutputTokens: 32_000,
      });
    },
  });
  await dispatchAgentTool.execute({task: 'do a thing'}, context);
  expect(seen).toContain('versatile');
});
```

Mirror it with `{task: 'x', model: 'powerful'}` asserting `seen` contains `'powerful'`. Adjust to the file's existing helpers/assertion style.

- [ ] **Step 9: Verify the backend compiles and passes**

Run: `pnpm --filter @omnicraft/backend typecheck`
Expected: no errors.

Run: `pnpm --filter @omnicraft/backend test`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add apps/backend/src
git commit -m "feat(backend): route subagent dispatch through model tiers"
```

---

## Task 4: Shared three-tier settings UI

**Files:**

- Create: `apps/frontend/src/pages/settings/components/LlmSettingsFields/helpers/build-llm-setting-fields.ts`
- Create: `apps/frontend/src/pages/settings/components/LlmSettingsFields/LlmSettingsFields.tsx`
- Create: `apps/frontend/src/pages/settings/components/LlmSettingsFields/LlmSettingsFields.test.tsx`
- Create: `apps/frontend/src/pages/settings/components/LlmSettingsFields/index.ts`
- Modify: `apps/frontend/src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.tsx` (+ `.test.tsx`)
- Modify: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSection.tsx`
- Delete: `apps/frontend/src/pages/settings/sections/llm/chat/ChatLlmSectionFields.tsx`
- Modify: `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSection.tsx`
- Delete: `apps/frontend/src/pages/settings/sections/coding/agent/CodingLlmSectionFields.tsx`

**Interfaces:**

- Consumes: `settingsSchema` from `@omnicraft/settings-schema`; `FieldConfig`, `SettingSectionRenderProps` from the `SettingSection` module; `ConnectionFields`, `ModelSettingsFields`.
- Produces: `buildLlmSettingFields(prefix: 'llm' | 'codingLlm'): FieldConfig[]`; `LlmSettingsFields` component (props: `SettingSectionRenderProps & {prefix: 'llm' | 'codingLlm'}`); `ModelSettingsFields` gains optional `modelError?: string`.

- [ ] **Step 1: Add `modelError` to `ModelSettingsFields` (failing test first)**

In `ModelSettingsFields.test.tsx`, add:

```ts
it('shows a model error when provided', () => {
  render(
    <ModelSettingsFields
      values={base}
      setValue={vi.fn()}
      validationErrors={{}}
      isDisabled={false}
      prefix='llm/powerful'
      title='Powerful model'
      modelError='The default tier must have a model'
    />,
  );
  expect(
    screen.getByText('The default tier must have a model'),
  ).toBeInTheDocument();
});
```

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/settings/components/ModelSettingsFields/ModelSettingsFields.test.tsx`
Expected: FAIL (`modelError` not a prop).

- [ ] **Step 2: Implement `modelError`**

In `ModelSettingsFields.tsx`, add `modelError?: string;` to `ModelSettingsFieldsProps`, accept it in the destructure, and combine it with the existing validation error:

```ts
const modelFieldError = validationErrors[modelPath] ?? modelError;
```

Update the model `TextField`'s `isInvalid` to `modelPath in validationErrors || modelError !== undefined` and render `{modelFieldError && <FieldError>{modelFieldError}</FieldError>}` instead of the current `validationErrors[modelPath]`-only block.

Run: the same command as Step 1.
Expected: PASS.

- [ ] **Step 3: Write the field-builder helper**

Create `build-llm-setting-fields.ts`:

```ts
import {settingsSchema} from '@omnicraft/settings-schema';

import type {FieldConfig} from '../../SettingSection/index.js';

const TIERS = ['powerful', 'versatile', 'lightweight'] as const;

/** Builds the SettingSection field list for one LLM settings group. */
export function buildLlmSettingFields(
  prefix: 'llm' | 'codingLlm',
): FieldConfig[] {
  const shape = settingsSchema.shape[prefix].unwrap().shape;
  const fields: FieldConfig[] = [
    {path: `${prefix}/apiFormat`, schema: shape.apiFormat},
    {path: `${prefix}/apiKey`, schema: shape.apiKey},
    {path: `${prefix}/baseUrl`, schema: shape.baseUrl},
    {path: `${prefix}/defaultTier`, schema: shape.defaultTier},
  ];
  for (const tier of TIERS) {
    const tierShape = shape[tier].unwrap().shape;
    fields.push(
      {path: `${prefix}/${tier}/model`, schema: tierShape.model},
      {
        path: `${prefix}/${tier}/thinkingLevel`,
        schema: tierShape.thinkingLevel,
      },
      {
        path: `${prefix}/${tier}/maxContextTokens`,
        schema: tierShape.maxContextTokens,
      },
      {
        path: `${prefix}/${tier}/maxOutputTokens`,
        schema: tierShape.maxOutputTokens,
      },
    );
  }
  return fields;
}
```

- [ ] **Step 4: Write the shared view component**

Create `LlmSettingsFields.tsx`:

```tsx
import {Description, FieldError, Label, ListBox, Select} from '@heroui/react';

import {ConnectionFields} from '../ConnectionFields/index.js';
import {ModelSettingsFields} from '../ModelSettingsFields/index.js';
import type {SettingSectionRenderProps} from '../SettingSection/index.js';

interface LlmSettingsFieldsProps extends SettingSectionRenderProps {
  prefix: 'llm' | 'codingLlm';
}

const TIER_META = [
  {
    tier: 'powerful',
    title: 'Powerful model',
    placeholder: 'claude-opus-4-20250514',
    description: 'Most capable tier, for hard multi-step reasoning.',
  },
  {
    tier: 'versatile',
    title: 'Versatile model',
    placeholder: 'claude-sonnet-4-20250514',
    description: 'Balanced default. Leave empty to inherit the default tier.',
  },
  {
    tier: 'lightweight',
    title: 'Lightweight model',
    placeholder: 'claude-haiku-4-20250514',
    description:
      'Cheapest tier for trivial subtasks. Leave empty to inherit the default tier.',
  },
] as const;

const DEFAULT_TIER_OPTIONS = [
  ['powerful', 'Powerful'],
  ['versatile', 'Versatile'],
  ['lightweight', 'Lightweight'],
] as const;

export function LlmSettingsFields(props: LlmSettingsFieldsProps) {
  const {prefix, values, setValue, validationErrors, isDisabled} = props;
  const defaultTierPath = `${prefix}/defaultTier`;
  const defaultTier = String(values[defaultTierPath] ?? 'powerful');

  return (
    <>
      <ConnectionFields {...props} prefix={prefix} />

      <Select
        value={defaultTier}
        isInvalid={defaultTierPath in validationErrors}
        isDisabled={isDisabled}
        onChange={(value) => {
          if (value) {
            setValue(defaultTierPath, String(value));
          }
        }}
      >
        <Label>Default Tier</Label>
        <Select.Trigger>
          <Select.Value />
          <Select.Indicator />
        </Select.Trigger>
        <Description>
          The tier the agent runs on; also the fallback for empty tiers.
        </Description>
        <Select.Popover>
          <ListBox>
            {DEFAULT_TIER_OPTIONS.map(([id, label]) => (
              <ListBox.Item key={id} id={id} textValue={label}>
                {label}
                <ListBox.ItemIndicator />
              </ListBox.Item>
            ))}
          </ListBox>
        </Select.Popover>
        {validationErrors[defaultTierPath] && (
          <FieldError>{validationErrors[defaultTierPath]}</FieldError>
        )}
      </Select>

      {TIER_META.map(({tier, title, placeholder, description}) => {
        const modelIsBlank =
          String(values[`${prefix}/${tier}/model`] ?? '').trim() === '';
        return (
          <ModelSettingsFields
            key={tier}
            {...props}
            prefix={`${prefix}/${tier}`}
            title={title}
            modelPlaceholder={placeholder}
            modelDescription={description}
            modelError={
              tier === defaultTier && modelIsBlank
                ? 'The default tier must have a model'
                : undefined
            }
          />
        );
      })}
    </>
  );
}
```

Create `index.ts`:

```ts
export {LlmSettingsFields} from './LlmSettingsFields.js';
export {buildLlmSettingFields} from './helpers/build-llm-setting-fields.js';
```

- [ ] **Step 5: Add a component test**

Create `LlmSettingsFields.test.tsx`:

```tsx
import {cleanup, render, screen} from '@testing-library/react';
import {afterEach, describe, expect, it, vi} from 'vitest';

import type {SettingFieldValues} from '../SettingSection/index.js';
import {LlmSettingsFields} from './LlmSettingsFields.js';

afterEach(() => {
  cleanup();
});

function renderFields(values: SettingFieldValues) {
  render(
    <LlmSettingsFields
      prefix='llm'
      values={values}
      setValue={vi.fn()}
      validationErrors={{}}
      isDisabled={false}
    />,
  );
}

describe('LlmSettingsFields', () => {
  const base: SettingFieldValues = {
    'llm/defaultTier': 'powerful',
    'llm/powerful/model': 'opus',
    'llm/versatile/model': '',
    'llm/lightweight/model': '',
  };

  it('renders all three tier headings', () => {
    renderFields(base);
    expect(screen.getByText('Powerful model')).toBeInTheDocument();
    expect(screen.getByText('Versatile model')).toBeInTheDocument();
    expect(screen.getByText('Lightweight model')).toBeInTheDocument();
  });

  it('flags a blank model on the selected default tier', () => {
    renderFields({...base, 'llm/powerful/model': ''});
    expect(
      screen.getByText('The default tier must have a model'),
    ).toBeInTheDocument();
  });
});
```

Run: `pnpm --filter @omnicraft/frontend exec vitest run src/pages/settings/components/LlmSettingsFields/LlmSettingsFields.test.tsx`
Expected: PASS.

- [ ] **Step 6: Rewrite both sections to use the shared component**

Replace `ChatLlmSection.tsx` with:

```tsx
import {
  buildLlmSettingFields,
  LlmSettingsFields,
} from '../../../components/LlmSettingsFields/index.js';
import {SettingSection} from '../../../components/SettingSection/index.js';

const FIELDS = buildLlmSettingFields('llm');

export function ChatLlmSection() {
  return (
    <SettingSection title='Chat Agent' fields={FIELDS}>
      {(props) => <LlmSettingsFields {...props} prefix='llm' />}
    </SettingSection>
  );
}
```

Replace `CodingLlmSection.tsx` with the same, using `'codingLlm'` and `title='Coding Agent'`.

Delete `ChatLlmSectionFields.tsx` and `CodingLlmSectionFields.tsx`.

- [ ] **Step 7: Verify frontend compiles and tests pass**

Run: `pnpm --filter @omnicraft/frontend typecheck`
Expected: no errors.

Run: `pnpm --filter @omnicraft/frontend test`
Expected: PASS.

- [ ] **Step 8: Manually verify in the browser (both themes)**

Run the dev server from the repo root (`pnpm dev`), open Settings → Chat Agent and Coding Agent. Confirm: three tier blocks render, the Default Tier select works, clearing the default tier's model shows the inline error, and it looks correct in light and dark themes.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/pages/settings
git commit -m "feat(frontend): three-tier LLM settings with shared section"
```

---

## Task 5: Coding agent delegation guidance

**Files:**

- Modify: `apps/backend/src/agent/agents/coding-agent/system-prompt.ts`
- Test: `apps/backend/src/agent/agents/coding-agent/system-prompt.test.ts`

**Interfaces:**

- Consumes: nothing new.
- Produces: a "Delegating Subtasks" section in `codingAgentSystemPrompt`.

- [ ] **Step 1: Write the failing test**

Add to `system-prompt.test.ts` (match the file's existing import/style):

```ts
it('includes tier-aware delegation guidance', () => {
  expect(codingAgentSystemPrompt).toContain('Delegating Subtasks');
  expect(codingAgentSystemPrompt).toContain('cheapest tier');
});
```

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/agents/coding-agent/system-prompt.test.ts`
Expected: FAIL.

- [ ] **Step 2: Add the section**

In `system-prompt.ts`, insert before the `'## Verification',` entry:

```ts
  '## Delegating Subtasks',
  '',
  '- When you dispatch a subagent, pick the cheapest model tier that can do the job: lightweight for trivial mechanical work, versatile for standard subtasks, powerful only for genuinely hard reasoning.',
  '- The thinking level is independent of the tier: raise it for deeper reasoning within a tier rather than always escalating the tier.',
  '',
```

- [ ] **Step 3: Run to verify it passes**

Run: `pnpm --filter @omnicraft/backend exec vitest run src/agent/agents/coding-agent/system-prompt.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/backend/src/agent/agents/coding-agent
git commit -m "feat(backend): add tier-aware delegation guidance to coding prompt"
```

---

## Task 6: Remove legacy `main`/`light`

Now that no code references `settings.*.main` / `.light`, remove them.

**Files:**

- Modify: `packages/settings-schema/src/llm/schema.ts`
- Modify: `packages/settings-schema/src/schema.test.ts`

**Interfaces:**

- Removes: `mainModelSettingsSchema`, `lightModelSettingsSchema`, and the `main` / `light` fields of `llmSettingsSchema`.

- [ ] **Step 1: Confirm there are no remaining references**

Run: `git grep -nE "\.(main|light)\b" packages apps/backend/src apps/frontend/src | grep -iE "llm|model|settings"`
Expected: no matches indicating `llm.main` / `codingLlm.light` usage (ignore unrelated hits). If any remain, migrate them before continuing.

- [ ] **Step 2: Delete the legacy schemas and fields**

In `packages/settings-schema/src/llm/schema.ts`, delete the `mainModelSettingsSchema` and `lightModelSettingsSchema` declarations and remove the `main:` and `light:` lines from `llmSettingsSchema`.

- [ ] **Step 3: Remove the legacy tests**

In `packages/settings-schema/src/schema.test.ts`, delete the `describe('llm.main / llm.light defaults', …)` block (its `main`/`light` assertions). Keep the `settingsSchema` JSON-schema tests and the `model tiers` block from Task 1.

- [ ] **Step 4: Verify the workspace still typechecks and tests pass**

Run: `pnpm --filter @omnicraft/settings-schema test`
Expected: PASS.

Run: `pnpm typecheck:all`
Expected: no errors (backend + frontend + packages).

- [ ] **Step 5: Commit**

```bash
git add packages/settings-schema/src
git commit -m "refactor(settings): drop legacy main/light model tiers"
```

---

## Task 7: Throwaway local settings migration

Migrates the developer's existing local `settings.json` so pre-existing `main`/`light` values move onto the new tiers. This script is deleted after running once.

**Files:**

- Create: `scripts/migrate-model-tiers.ts`

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-model-tiers.ts`:

```ts
import {readFile, writeFile} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const settingsPath = path.join(
  process.env.DATA_DIR ?? path.join(os.homedir(), '.omni-craft'),
  'settings.json',
);

function migrateBlock(block: Record<string, unknown>): void {
  if (block.main && !block.powerful) block.powerful = block.main;
  if (block.light && !block.lightweight) block.lightweight = block.light;
  block.defaultTier ??= 'powerful';
  delete block.main;
  delete block.light;
}

const raw: unknown = JSON.parse(await readFile(settingsPath, 'utf-8'));
if (raw && typeof raw === 'object') {
  const settings = raw as Record<string, Record<string, unknown>>;
  for (const key of ['llm', 'codingLlm']) {
    if (settings[key]) migrateBlock(settings[key]);
  }
  await writeFile(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
  process.stdout.write(`Migrated ${settingsPath}\n`);
} else {
  process.stdout.write('No settings object found; nothing to migrate.\n');
}
```

- [ ] **Step 2: Run the migration**

Run: `pnpm --filter @omnicraft/backend exec tsx ../../scripts/migrate-model-tiers.ts`
Expected: prints `Migrated <path>` (or the "nothing to migrate" line if no file exists yet). Open `~/.omni-craft/settings.json` and confirm `powerful`/`lightweight`/`defaultTier` are present and `main`/`light` are gone.

- [ ] **Step 3: Delete the script and commit**

```bash
git rm scripts/migrate-model-tiers.ts
git commit -m "chore: one-off local model-tier settings migration"
```

(If `scripts/migrate-model-tiers.ts` was never committed, just `rm` it — no commit needed.)

---

## Self-Review Notes

- **Spec coverage:** §1 schema → Task 1; §2 resolver → Task 2; §3 agent-core plumbing + agents → Task 3; §4 dispatch tool → Task 3; §5 agents → Task 3; §6 steering → Task 5; §7 frontend → Task 4; §8 migration → Task 7; legacy cleanup → Task 6.
- **Deviation from spec §1:** no `@omnicraft/api-schema` re-export; consumers import tier symbols directly from `@omnicraft/settings-schema` per the repo's no-re-export rule.
- **Type consistency:** `getTierConfig(tier: ModelTier)` is used identically across `types.ts`, `agent.ts`, `agent-runtime-state.ts`, `agent-tool-executor.ts`, `agent-turn-runner.ts`, and `tool/types.ts`; `resolveModelConfig(llmSettings, tier)` matches its call sites in the agents; `buildLlmSettingFields` / `LlmSettingsFields` share the `'llm' | 'codingLlm'` prefix type.
