# Uniform Three-Tier Model Settings

## Problem

Every agent currently has exactly two model tiers, `main` and `light`, defined
once in `llmSettingsSchema` and reused by both `settings.llm` (chat) and
`settings.codingLlm` (coding). The coding agent needs a richer menu so it can
route delegated subtasks to differently-priced models by difficulty, rather
than only "main vs light".

The two-tier shape is also baked deep into the runtime: agent-core exposes a
fixed `getConfig` + `getLightConfig` pair, and the shared `dispatch_agent` tool
hardcodes `model: z.enum(['default', 'light'])`.

## Decision

Replace the two-tier model with a **uniform three-tier capability ladder** used
by every agent:

| Tier          | Role                  | Guidance the model sees                                                      |
| ------------- | --------------------- | ---------------------------------------------------------------------------- |
| `lightweight` | cheapest / fastest    | trivial, well-defined subtasks where speed matters more than reasoning depth |
| `versatile`   | balanced default      | standard subtasks needing solid competence but not deep reasoning            |
| `powerful`    | most capable / costly | subtasks needing deep multi-step reasoning or complex analysis               |

Key properties:

- **One schema for all agents.** `llmSettingsSchema` gains the three tiers plus
  a `defaultTier` selector. Both `settings.llm` and `settings.codingLlm` use it
  unchanged, so the settings UI is a single reusable component and the dispatch
  tool is a single shared static definition.
- **`defaultTier` selects the model the agent itself runs on**, and is the
  fallback anchor. It defaults to `powerful` in both blocks (keeps the schema
  uniform; user-repointable per settings group).
- **Full-config cascade.** A tier whose `model` is blank inherits the entire
  config (model + thinking level + capacity) of the nearest configured tier
  when stepping toward the anchor. The anchor's `model` is required, so
  resolution always terminates.
- **Dispatch defaults to `versatile`** when the model omits the tier argument.

This reverses the earlier "leave chat's `main`/`light` names alone" intent in
favor of one vocabulary everywhere, chosen for maintainability and UI reuse.

## Tier semantics

### Resolution (the cascade)

`resolveModelConfig(llmSettings, tier)` produces a concrete `LlmConfig`:

1. Connection fields (`apiFormat`, `apiKey`, `baseUrl`) always come from
   `llmSettings`.
2. If `llmSettings[tier].model` is non-empty, use that tier's model + thinking +
   capacity.
3. Otherwise walk the ladder one rung at a time **toward the anchor**
   (`llmSettings.defaultTier`) and use the first tier with a non-empty `model`.
   The anchor is guaranteed non-empty by validation, so this always resolves.

Ladder order (low → high): `lightweight` < `versatile` < `powerful`.

With the anchor at `powerful` (the default) the cascade is:

- `lightweight` blank → `versatile` if configured, else `powerful`
- `versatile` blank → `powerful`

If the user repoints `defaultTier` to a middle tier, the cascade simply flows
toward that anchor instead (a higher tier left blank then falls _down_ to it).

### Behavior examples (anchor = `powerful`)

| powerful  | versatile | lightweight | lightweight runs                              | versatile runs    |
| --------- | --------- | ----------- | --------------------------------------------- | ----------------- |
| `opus`    | _(blank)_ | _(blank)_   | `opus` (full cfg)                             | `opus` (full cfg) |
| `opus`    | `sonnet`  | _(blank)_   | `sonnet` (full cfg)                           | `sonnet`          |
| `opus`    | `sonnet`  | `haiku`     | `haiku`                                       | `sonnet`          |
| _(blank)_ | `sonnet`  | `haiku`     | validation error — anchor's model is required | —                 |

### Where each resolved tier is used

Per agent, reading its own settings group (`settings.llm` or
`settings.codingLlm`):

- **Agent's own model**: `resolveModelConfig(llmSettings, llmSettings.defaultTier)`
- **Title generation** (cheap internal work): `resolveModelConfig(llmSettings, 'lightweight')`
- **`dispatch_agent`**: `resolveModelConfig(llmSettings, chosenTier)` where
  `chosenTier` defaults to `versatile`

## Changes

### 1. Settings schema (`packages/settings-schema`)

In `src/llm/schema.ts`:

- Add `modelTierSchema = z.enum(['powerful', 'versatile', 'lightweight'])` and
  export `ModelTier`.
- Collapse `mainModelSettingsSchema` / `lightModelSettingsSchema` into a single
  `tierModelSettingsSchema` where `model` may be empty (keeps the existing
  `maxOutputTokens < maxContextTokens` refine).
- Rewrite `llmSettingsSchema` to:
  - keep `apiFormat`, `apiKey`, `baseUrl`
  - add `defaultTier: modelTierSchema.default('powerful')`
  - `powerful: tierModelSettingsSchema.prefault({ model: 'claude-sonnet-4-20250514' })`
    (so a fresh install has a concrete anchor)
  - `versatile: tierModelSettingsSchema.prefault({})` (blank → cascades)
  - `lightweight: tierModelSettingsSchema.prefault({})` (blank → cascades)
  - add a settings-level `.refine(...)` enforcing that the tier named by
    `defaultTier` has a non-empty `model`, with the error `path` pointing at
    `[defaultTier, 'model']` so the UI attaches it to the right field.
- Export `modelTierSchema` / `ModelTier` from `src/index.ts`, plus
  `type LlmSettings = z.infer<typeof llmSettingsSchema>` — the type of the
  resolver's `llmSettings` parameter.

`src/schema.ts` is unchanged — `llm` and `codingLlm` keep reusing
`llmSettingsSchema`.

Re-export `modelTierSchema` / `ModelTier` from `@omnicraft/api-schema`'s
`index.ts` alongside the existing `thinkingLevelSchema` re-export, since the
dispatch tool and agent-core type against it.

### 2. Backend — tier resolver (`apps/backend`)

Add a shared helper `resolveModelConfig(llmSettings, tier): LlmConfig` (new
module under `src/agent/`, e.g. `model-tier/resolve-model-config.ts`)
implementing the cascade above. Unit-tested directly.

### 3. Backend — agent-core config plumbing

Replace the fixed `getLightConfig` slot with a general
`getTierConfig(tier: ModelTier) => Promise<LlmConfig>`:

- `agent/types.ts` (`AgentOptions`): `getTierConfig?` replaces `getLightConfig?`.
- `agent/agent.ts`: store it; expose on the tool context as
  `getTierConfig: this.getTierConfig ?? ((_) => this.getConfig())` (subagents
  that don't set it fall back to their single `getConfig`); title generation
  calls `getTierConfig('lightweight')` instead of `getLightConfig`.
- `agent/agent-runtime-state.ts`, `agent/agent-tool-executor.ts`,
  `agent/agent-turn-runner.ts`: thread `getTierConfig` where `getLightConfig`
  was threaded.
- `tool/types.ts` (`ToolExecutionContext`): `getConfig` stays; replace
  `getLightConfig` with `getTierConfig(tier)`.
- `tool/testing.ts`: update the test context builder.

`getConfig` (the agent's own driving model, used by `LlmSession`) is retained
unchanged — it is the only config subagents provide.

### 4. Backend — dispatch tool (`agent/tools/sub-agent/dispatch-agent-tool.ts`)

Stays a single shared static tool (both agents now expose the same three tiers):

- `model: modelTierSchema.optional()`, defaulting to `versatile` in `execute`.
- Description enumerates the three tiers with abstract, difficulty-based
  guidance (no domain-specific examples, per `agent/tools/CLAUDE.md`), rendered
  the same way `subAgentInfos` renders `agentType` today.
- `execute` resolves via `context.getTierConfig(model ?? 'versatile')` then
  applies `thinkingLevel`, dropping the old `getConfig`/`getLightConfig` branch.

`SubAgentToolRegistry` stays a shared singleton; no per-agent factory.
`resume`/`list_resumable` tools are untouched.

### 5. Backend — agents

- `main-agent.ts` and `coding-agent.ts`: each provides
  - `getConfig` = `resolveModelConfig(llmSettings, llmSettings.defaultTier)`
  - `getTierConfig(tier)` = `resolveModelConfig(llmSettings, tier)`

  reading `settings.llm` and `settings.codingLlm` respectively. The two classes
  stay near-identical (the settings group + system prompt are the only
  differences).

### 6. Backend — steering (#3)

Add a short cost-aware delegation note to the coding agent's system prompt
(`coding-agent/system-prompt.ts`): prefer the cheapest tier that can do the job,
reserve `powerful` for genuinely hard reasoning, and note that `thinkingLevel`
is independent (raise it for reasoning _within_ a tier). The per-tier "when to
use" text lives in the dispatch tool description (§4). No change to the chat
agent's system prompt.

### 7. Frontend (`apps/frontend`)

- Introduce one reusable fields component (e.g.
  `pages/settings/components/LlmSettingsFields/`) that renders, for a given
  `prefix`:
  - `ConnectionFields`
  - a `defaultTier` `Select` (Powerful / Versatile / Lightweight)
  - three `ModelSettingsFields` blocks (Powerful, Versatile, Lightweight), with
    descriptions noting that a blank non-anchor tier inherits the default tier.
- `ChatLlmSectionFields` and `CodingLlmSectionFields` become thin wrappers that
  render the shared component with `prefix='llm'` / `prefix='codingLlm'` (or are
  replaced by it directly in their sections).
- `ChatLlmSection` / `CodingLlmSection`: replace the hardcoded `FIELDS` arrays
  with a shared `buildLlmSettingFields(prefix)` helper derived from
  `llmSettingsSchema` (now covering `defaultTier` + three tiers).
- `ModelSettingsFields` itself needs no change (already generic over `prefix`).
- Navigation labels ("Chat Agent" / "Coding Agent") and routes are unchanged.

### 8. Local settings migration (throwaway)

A one-off Node script run via `tsx` (deleted after running; no permanent
migration code in `settings-manager`) that rewrites the local settings JSON
file at the path `settings-manager` uses. For both `llm` and `codingLlm`:

- `powerful` ← old `main` (so the agent keeps running the same model)
- `lightweight` ← old `light`
- `versatile` ← left blank (cascades to `powerful`)
- `defaultTier` ← `'powerful'`
- remove old `main` / `light` keys

## Testing

- **settings-schema** (`schema.test.ts`): `defaultTier` defaults to `powerful`;
  the anchor-model-required refine fires when the default tier's model is blank;
  the schema still converts via `z.toJSONSchema`.
- **resolver** (new test): every cascade case — fully configured, single blank,
  all-but-anchor blank, and a non-`powerful` `defaultTier` with an upper tier
  blank.
- **dispatch tool** (`dispatch-agent-tool.test.ts`): `model` accepts the three
  tiers, defaults to `versatile`, and resolves through `context.getTierConfig`.
- **frontend**: `ModelSettingsFields` test stays; add coverage for the
  `defaultTier` select and that the shared section renders three tier blocks for
  a given prefix.

## Out of scope

- Surfacing the chosen tier over SSE or in the chat UI (the `subagent-dispatch`
  event still carries `thinkingLevel` only).
- Changing subagent classes, `resume`/`list_resumable` tools, session stores, or
  routes.
- Per-group default divergence (both `defaultTier`s default to `powerful`).

## Files changed

1. `packages/settings-schema/src/llm/schema.ts` — three-tier schema, `defaultTier`, anchor refine
2. `packages/settings-schema/src/index.ts` — export `modelTierSchema` / `ModelTier`
3. `packages/settings-schema/src/schema.test.ts` — updated/added cases
4. `packages/api-schema/src/index.ts` — re-export `modelTierSchema` / `ModelTier`
5. `apps/backend/src/agent/model-tier/resolve-model-config.ts` — new resolver (+ test)
6. `apps/backend/src/agent-core/agent/types.ts` — `getTierConfig` replaces `getLightConfig`
7. `apps/backend/src/agent-core/agent/agent.ts` — plumb `getTierConfig`; title uses `lightweight`
8. `apps/backend/src/agent-core/agent/agent-runtime-state.ts` — thread `getTierConfig`
9. `apps/backend/src/agent-core/agent/agent-tool-executor.ts` — thread `getTierConfig`
10. `apps/backend/src/agent-core/agent/agent-turn-runner.ts` — thread `getTierConfig`
11. `apps/backend/src/agent-core/tool/types.ts` — context `getTierConfig`
12. `apps/backend/src/agent-core/tool/testing.ts` — test context builder
13. `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts` — 3-tier enum, `versatile` default, tier guidance
14. `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts` — updated cases
15. `apps/backend/src/agent/agents/main-agent/main-agent.ts` — `getConfig` + `getTierConfig`
16. `apps/backend/src/agent/agents/coding-agent/coding-agent.ts` — `getConfig` + `getTierConfig`
17. `apps/backend/src/agent/agents/coding-agent/system-prompt.ts` — cost-aware delegation note
18. `apps/frontend/src/pages/settings/components/LlmSettingsFields/` — new reusable fields component
19. `apps/frontend/src/pages/settings/sections/llm/chat/*` — use shared fields + field helper
20. `apps/frontend/src/pages/settings/sections/coding/agent/*` — use shared fields + field helper
21. `scripts/migrate-model-tiers.ts` — throwaway local migration run via `tsx` (deleted after use)
