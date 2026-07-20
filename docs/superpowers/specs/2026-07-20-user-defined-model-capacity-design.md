# User-Defined Model Capacity + Independent Light Model

## Problem

A model's token limits — max context window and max output — are currently
**hardcoded** in two backend lookup tables keyed by model name:

- `apps/backend/src/agent-core/model-capacity/claude-capacity.ts` — a
  `KNOWN_MODELS` map plus a fallback that calls the Anthropic SDK
  (`client.models.retrieve`) for unknown models, with a per-`baseUrl::model`
  cache and hardcoded defaults.
- `apps/backend/src/agent-core/model-capacity/openai-capacity.ts` — a parallel
  `KNOWN_MODELS` map with hardcoded defaults (no SDK fallback, since
  OpenAI-compatible providers do not expose limits programmatically).

This is fragile: every new/renamed model, every self-hosted or proxied endpoint,
and every provider reporting different limits requires editing and shipping code.
The model _name_ is already a user-editable free-text settings field
(`llm.model` / `codingLlm.model`), but the two token limits are derived from
these tables rather than from the user.

A related gap: the **light model** (used for lightweight tasks such as title
generation) is only a model _name_ today (`llm.lightModel`). It inherits
`apiFormat`/`apiKey`/`baseUrl`/`thinkingLevel` and (via the new work) would
inherit the limits of the main model. It has **no independent thinking level**,
which is wrong — a small light model often wants a different (usually lower)
thinking effort than the main model.

## Goals

- Let the user hand-write a model's limits in the frontend settings: **max
  context** (full context window) and **max output**, next to the `model` field.
- **Delete** the hardcoded capacity tables and the Anthropic auto-fetch fallback
  entirely. Limits come only from settings.
- Derive the runtime input budget as **input budget = max context − max output**,
  matching how a user thinks about a model ("200K window, 64K output").
- Make the **light model a fully independent model configuration** — its own
  `model` name, `thinkingLevel`, `maxContextTokens`, and `maxOutputTokens` —
  peer to the main model, using the same reusable UI component.
- Keep Chat (`llm`) and Coding (`codingLlm`) **fully independent**, each with its
  own connection settings, so they can point at different providers.
- Extract a **reusable per-model settings UI component** (`model`,
  `thinkingLevel`, `maxContextTokens`, `maxOutputTokens`), instantiated for the
  main model and the light model in both the Chat and Coding sections.

## Non-Goals

- Sharing/hoisting the connection fields (`apiFormat`/`apiKey`/`baseUrl`) into a
  single provider config. They stay per-section.
- In-app settings migration. A **one-time standalone script** migrates the local
  `settings.json` (single-user tool, no other installs). The script is not wired
  into startup and can be deleted afterward.
- Hard-blocking the Save button on the cross-field rule (output < context) by
  modifying the shared `SettingSection` engine. Handled by an inline warning in
  the reusable component plus a backend runtime clamp (see §3, §5, Risks).
- Any change to session persistence, the usage-reporting wire format, compaction
  policy, or settings navigation.

## Current State

- **Schema** — `packages/settings-schema/src/llm/schema.ts`: `llmSettingsSchema`
  is a plain `z.object` with `apiFormat`, `apiKey`, `baseUrl`, `model`,
  `lightModel`, `thinkingLevel`. Composed twice in `src/schema.ts` as
  `llm: llmSettingsSchema.prefault({})` and `codingLlm: llmSettingsSchema.prefault({})`.
  Every leaf has `.describe()` + `.default()`; a test enforces `z.toJSONSchema()`
  convertibility. `thinkingLevelSchema` (7-value enum) lives in the same file.
- **Backend config type** — `apps/backend/src/agent-core/llm-api/types.ts`:
  `LlmConfig = { apiFormat; apiKey; baseUrl; model; thinkingLevel }`. Built from
  settings at four sites:
  - `services/chat-agent-session/helpers.ts` `getLlmConfig()` → reads
    `settings.llm` (`{apiFormat, apiKey, baseUrl, model, thinkingLevel}`).
    Consumed by `chat-agent-session-service.ts:19` for a pre-flight check that
    `baseUrl` and `model` are set at session creation.
  - `services/coding-agent-session/helpers.ts` `getLlmConfig()` → reads
    `settings.codingLlm`. Consumed by `coding-agent-session-service.ts:21`.
  - `agent/agents/main-agent/main-agent.ts` — inline `getConfig` closure (reads
    `settings.llm`) and `getLightConfig` closure
    (`{...settings.llm, model: lightModel || model}`).
  - `agent/agents/coding-agent/coding-agent.ts` — same pattern on
    `settings.codingLlm`.
- **Capacity module** — `apps/backend/src/agent-core/model-capacity/`:
  `model-capacity.ts` exposes an **async** `modelCapacity`
  (`getMaxOutputTokens`, `getMaxPromptTokens`, `getMaxContextWindowTokens`) that
  dispatches by `config.apiFormat` into the two `*-capacity.ts` tables; barrel
  `index.ts` re-exports `modelCapacity`.
- **Consumers** (all via `modelCapacity`, all currently `await`):
  `claude/stream.ts` → `getMaxOutputTokens` → `max_tokens`;
  `openai-responses/stream.ts` → `getMaxOutputTokens` → `max_output_tokens`;
  `llm-session/compaction/llm-compaction-decision-service.ts` →
  `getMaxPromptTokens` → compaction trigger;
  `agent/agent-usage-reporter.ts` → `getMaxPromptTokens` → the
  `contextWindowTokens` field of the `usage-update` SSE event.
  `getMaxContextWindowTokens` is referenced only by the module's own tests.
- **Settings persistence** — `SettingsManager`
  (`apps/backend/src/models/settings-manager/settings-manager.ts`) reads/writes
  `path.join(getDataDir(), 'settings.json')` (`getDataDir()` =
  `DATA_DIR` env or `~/.omni-craft`). `load()`/`setBatch` validate the whole
  object with `settingsSchema.parse` (unknown keys stripped, missing keys filled
  from defaults). Leaf-path validation uses `isLeafSchemaPath`
  (`helpers/zod.ts`), which unwraps `prefault`/`default` wrappers and descends
  `.shape` to **arbitrary depth**, so nested paths like `llm/main/model` are
  valid leaf paths.
- **Frontend** — settings are schema-driven, persisted via the `/api/settings`
  batch endpoint (no client store). Each section declares a `FIELDS` array
  (`{path, schema}` pulled off `settingsSchema.shape.<section>.unwrap().shape`)
  and renders a stateless fields view through the reusable `SettingSection`
  engine, which validates each field with its own Zod schema
  (`useSettingValidation`). Relevant files:
  `pages/settings/sections/llm/chat/ChatLlmSection.tsx` + `ChatLlmSectionFields.tsx`;
  `pages/settings/sections/coding/agent/CodingLlmSection.tsx` + `CodingLlmSectionFields.tsx`
  (near-duplicate); numeric pattern in
  `pages/settings/sections/agent/runtime/AgentRuntimeSectionFields.tsx`
  (HeroUI `NumberField`, `Number()` coercion, `minValue`); thinking-level options
  in `@/helpers/thinking-level-labels.js` (`THINKING_LEVELS`).

## Design

### 1. Settings schema — nested per-model configs

Restructure `llmSettingsSchema` (`packages/settings-schema/src/llm/schema.ts`)
into **shared connection fields + two nested model configs** (`main`, `light`).
A small builder keeps the per-model shape identical while letting the `model`
field differ (main required; light may be empty → falls back to main):

```ts
function createModelSettingsSchema(modelField: z.ZodType) {
  return z.object({
    model: modelField,
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
}

export const mainModelSettingsSchema = createModelSettingsSchema(
  z
    .string()
    .min(1)
    .describe('Model name to use')
    .default('claude-sonnet-4-20250514'),
);
export const lightModelSettingsSchema = createModelSettingsSchema(
  z
    .string()
    .describe(
      'Model for lightweight tasks (e.g. title generation). Falls back to the main model if empty.',
    )
    .default(''),
);

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

- Everything stays plain `z.object` (no object-level `.refine`), so
  `.shape`/`.unwrap()` introspection and the `z.toJSONSchema()` test keep
  working. The builder is a plain function returning a `z.object`.
- `main`/`light` use `.prefault({})` (mirroring how the root composes
  `llm`/`codingLlm`), so omitting them fills their inner defaults.
- New leaf paths: `llm/main/{model,thinkingLevel,maxContextTokens,maxOutputTokens}`,
  `llm/light/{…}`, and the same under `codingLlm/…`. All valid per
  `isLeafSchemaPath`.
- The cross-field constraint (context > output) is **not** a schema `.refine`
  (would break `.shape` and JSON-schema). Enforced in the UI (§3), safe at
  runtime (§2).

### 2. Backend — limits from config, tables deleted, light independent

`LlmConfig` stays **flat** (the nesting is a settings-shape concern only). Add
two fields:

```ts
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

Update the four config builders to read the nested shape:

- `getConfig` (main) reads `settings.llm.main`:
  `{apiFormat, apiKey, baseUrl, model: main.model, thinkingLevel: main.thinkingLevel, maxContextTokens: main.maxContextTokens, maxOutputTokens: main.maxOutputTokens}`.
- `getLightConfig` reads `settings.llm.light`, falling back only the _name_:
  `{apiFormat, apiKey, baseUrl, model: light.model || main.model, thinkingLevel: light.thinkingLevel, maxContextTokens: light.maxContextTokens, maxOutputTokens: light.maxOutputTokens}`.
  The light model now carries its **own** thinking level and limits even when its
  name falls back to the main model.
- `getLlmConfig()` in both `helpers.ts` returns the main config (used only for
  the `baseUrl`/`model` pre-flight check). `coding-agent.ts` mirrors `main-agent.ts`
  on `settings.codingLlm`.

Capacity resolution:

- **Delete** `claude-capacity.ts` and `openai-capacity.ts` (both `KNOWN_MODELS`
  maps, the Anthropic `client.models.retrieve` fallback, and the cache).
- **Rewrite** `model-capacity.ts` into a small **pure, synchronous** module that
  reads from config and no longer dispatches by provider:

  ```ts
  export const modelCapacity = {
    getMaxOutputTokens: (config: Readonly<LlmConfig>): number =>
      config.maxOutputTokens,
    // Input budget = full window minus reserved output. Clamped to >= 1 so a
    // misconfigured pair (output >= context) degrades to aggressive compaction
    // rather than a non-positive budget.
    getMaxPromptTokens: (config: Readonly<LlmConfig>): number =>
      Math.max(1, config.maxContextTokens - config.maxOutputTokens),
  };
  ```

  `getMaxContextWindowTokens` is dropped (only tests used it). Barrel keeps
  exporting `modelCapacity`.

- Update the four consumers to drop the now-unnecessary `await` (functions are
  synchronous). No other behavioral change.

### 3. Frontend — reusable per-model component, rendered twice

Extract `pages/settings/components/ModelSettingsFields/` (MVVM: `index.ts` named
export, stateless `ModelSettingsFields.tsx` view, `styles.module.css`, `helpers/`
for the pure `Number()` coercion and cross-field check). Props: the standard
`SettingSectionRenderProps` (`values`, `setValue`, `validationErrors`,
`isDisabled`) plus:

- `prefix: string` — e.g. `'llm/main'`, `'llm/light'`, `'codingLlm/main'`,
  `'codingLlm/light'`; the component builds `` `${prefix}/model` `` etc.
- `title: string` — group heading ("Main model" / "Light model").
- `modelDescription?: string`, `modelPlaceholder?: string` — so the light
  instance can say "Falls back to the main model if empty."

It renders a labeled group: `model` `TextField`, `thinkingLevel` `Select` (over
`THINKING_LEVELS`), `maxContextTokens` `NumberField` (`minValue={1}`),
`maxOutputTokens` `NumberField` (`minValue={1}`). **Cross-field UX:** when
`Number(values[`${prefix}/maxOutputTokens`]) >= Number(values[`${prefix}/maxContextTokens`])`,
show an inline `FieldError` on the max-output field ("Max output must be less
than max context"). View-level only; the backend clamp (§2) is the safety net.

Sections (`ChatLlmSectionFields.tsx`, `CodingLlmSectionFields.tsx`) render the
connection fields (`apiFormat`, `apiKey`, `baseUrl`) once, then two model groups:

```tsx
<ModelSettingsFields prefix="llm/main" title="Main model" {...props} />
<ModelSettingsFields prefix="llm/light" title="Light model"
  modelDescription="Falls back to the main model if empty." {...props} />
```

The standalone `lightModel` field is removed (it becomes `llm/light/model`
inside the light group). Each section's `FIELDS` array is rebuilt from the nested
shape:

```ts
const llmShape = settingsSchema.shape.llm.unwrap().shape;
const mainShape = llmShape.main.unwrap().shape;
const lightShape = llmShape.light.unwrap().shape;
// connection: llm/apiFormat, llm/apiKey, llm/baseUrl
// main:  llm/main/{model,thinkingLevel,maxContextTokens,maxOutputTokens}
// light: llm/light/{model,thinkingLevel,maxContextTokens,maxOutputTokens}
```

Validate in a real browser in both light and dark themes; include screenshots in
the PR (frontend guideline).

### 4. One-time migration script

Provide a standalone script (e.g.
`apps/backend/scripts/migrate-settings-to-nested-models.ts`, run once with
`tsx`, not wired into startup). It rewrites `settings.json` at
`path.join(getDataDir(), 'settings.json')` from the flat shape to the nested
shape, for both `llm` and `codingLlm`:

- `main = { model: <old model>, thinkingLevel: <old thinkingLevel>, maxContextTokens: 200000, maxOutputTokens: 32000 }`
- `light = { model: <old lightModel>, thinkingLevel: <old thinkingLevel>, maxContextTokens: 200000, maxOutputTokens: 32000 }`
  (copy the old shared `thinkingLevel` into `light` too, preserving prior
  behavior where the light model used the main thinking level)
- delete the old flat `model` / `lightModel` / `thinkingLevel` keys; leave
  `apiFormat` / `apiKey` / `baseUrl` untouched.

Idempotent: skip a section that already has `main`. Rationale: without migration,
the app still _loads_ (Zod strips the unknown flat keys and fills `main`/`light`
defaults), but the user's configured model/thinking level would be **silently
lost**; running the script once preserves them. API keys are never at risk (their
path is unchanged).

## Data Flow

```
Settings
  llm.main.{model,thinkingLevel,maxContextTokens,maxOutputTokens}
  llm.light.{model,thinkingLevel,maxContextTokens,maxOutputTokens}
  llm.{apiFormat,apiKey,baseUrl}                       (shared)
    -> getConfig()      = {conn, ...main}               [main config]
    -> getLightConfig() = {conn, model: light.model||main.model, ...light}
        -> modelCapacity.getMaxOutputTokens(config)  -> stream max_tokens / max_output_tokens
        -> modelCapacity.getMaxPromptTokens(config)   = max(1, context - output)
             -> compaction trigger
             -> usage-update.contextWindowTokens (usage-bar denominator)
```

## Testing

- **settings-schema**: keep the `z.toJSONSchema()` test passing with the nested
  shape; assert `settingsSchema.parse({})` fills `llm.main` / `llm.light`
  defaults (`200_000` / `32_000`, model defaults), and that `main.model` requires
  a non-empty string while `light.model` allows empty.
- **backend model-capacity**: rewrite `model-capacity.test.ts` for the pure
  derivation (`getMaxOutputTokens` = config value; `getMaxPromptTokens` =
  `context − output`, incl. the clamp when `output >= context`); the rewrite
  drops the Anthropic SDK mock. The `claude-capacity.ts` / `openai-capacity.ts`
  source files are deleted (they have no dedicated test files).
- **backend config builders**: update the four sites; assert `getLightConfig`
  uses `light.thinkingLevel` and `light` limits, and that an empty `light.model`
  falls back to `main.model` while keeping light's own thinking/limits. Update
  `LlmConfig` fixtures/builders to include the two new fields.
- **backend consumers**: `agent-usage-reporter.test.ts` and
  `llm-compaction-decision-service.test.ts` mock `modelCapacity`; adjust for the
  sync return and new config fields on fixtures.
- **frontend**: test `ModelSettingsFields` (renders the four fields for a given
  prefix; shows the cross-field error when output ≥ context). Update
  chat/coding settings-section tests for the nested `FIELDS` and the two model
  groups; remove the old single `lightModel` assertions.
- **migration script**: a quick dry-run test on a sample flat `settings.json`
  fixture (flat → expected nested), including idempotency.
- Run lint, format check, and tests across `settings-schema`, `backend`,
  `frontend`.

## Risks

- **Silent data loss without migration.** On the new schema, an un-migrated flat
  `settings.json` loads but drops the configured model/thinking level (Zod strips
  unknown keys). Mitigated by running the one-time script before first launch.
  Single-user, so acceptable; API keys are never affected.
- **Light-model behavior change.** The light model gains its own thinking level
  (fresh-install default `none`) and limits, instead of inheriting the main
  model's. Intended. The migration copies the old thinking level into `light` so
  upgraded installs keep prior behavior until edited.
- **Removing the Anthropic auto-fetch fallback.** Unknown Claude models no longer
  self-resolve limits; the user fills them in. Intended trade-off; sensible
  defaults keep the app usable out of the box.
- **Degenerate cross-field values.** If `maxOutputTokens >= maxContextTokens` is
  saved, the input budget clamps to 1 (near-constant compaction), not a crash.
  Inline UI warning is the primary mitigation; hard-blocking Save is a possible
  follow-up (needs a section-level validator hook in `SettingSection`).
- **`LlmConfig` fixture churn.** Two new required fields surface compile errors
  wherever a config is built in tests; mechanical, pinpointed by the type checker.
