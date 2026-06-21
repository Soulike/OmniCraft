# Thinking Level in Settings (Unified Cross-API Scale)

## Problem

Thinking level is selected in the chat/coding UI and snapshotted per session.
The selectable values are a single enum `none / low / medium / high / xhigh`
that is force-fitted onto two providers with different native effort scales:

- **OpenAI Responses** (`ReasoningEffort`): `none | minimal | low | medium |
high | xhigh`.
- **Anthropic Claude** (`OutputConfig.effort`, plus thinking `disabled` for
  "none"): `low | medium | high | xhigh | max`.

The current enum is **lossy**: it drops OpenAI's `minimal` and Claude's `max`,
and hacks `xhigh -> max` for Claude (`apps/backend/src/agent-core/llm-api/claude/helpers.ts`).
It also lives in the wrong place conceptually: thinking level is a model-tuning
choice that belongs next to the model/API configuration, not in the per-message
or per-session chat UI.

## Goals

- Move thinking-level selection out of the chat composer and the coding task
  card, into the LLM Settings sections (Chat Agent and Coding Agent), next to
  the model fields.
- Keep a **single thinking-level abstraction** used everywhere in the app, but
  widen it to the **union** of both providers' native scales so no native effort
  level is lost.
- Map the unified scale to each provider's native effort at the provider
  boundary, clamping to the nearest available native level where a provider does
  not support a given level.
- Read the thinking level **live from settings** on every LLM call (like
  `model` and `apiKey`), so changing it affects existing sessions on their next
  message.
- Keep `dispatch_agent`'s thinking level **agent-controlled** with a fixed
  default of `none`, so the agent can always reason about the default without
  knowing user settings.

## Non-Goals

- Per-session thinking-level snapshots (removed; the value is now live from
  settings).
- A migration of persisted snapshots (old snapshots simply ignore the removed
  field).
- Provider-aware tool schemas / per-turn tool cloning (not needed once the scale
  is unified).
- Redesign of the settings navigation, message rendering, usage tracking, or
  session history.

## Unified Scale

A single ordered enum, the union of both providers' native scales:

```
none < minimal < low < medium < high < xhigh < max
```

Both providers natively support `low / medium / high / xhigh`; only the two ends
differ. The provider mapping clamps to the nearest available native level:

| Unified | Claude effort           | OpenAI reasoning effort |
| ------- | ----------------------- | ----------------------- |
| none    | thinking `disabled`     | (no reasoning)          |
| minimal | `low` (nearest enabled) | `minimal`               |
| low     | `low`                   | `low`                   |
| medium  | `medium`                | `medium`                |
| high    | `high`                  | `high`                  |
| xhigh   | `xhigh`                 | `xhigh`                 |
| max     | `max`                   | `xhigh` (nearest)       |

Clamping rule: pick the nearest native level on the same scale. `minimal` maps
to Claude `low` (Claude's lowest _enabled_ effort) rather than `disabled`,
preserving the "some thinking" intent. `max` maps to OpenAI `xhigh` (OpenAI's
highest). This makes every unified level representable on both providers while
never silently turning thinking off when the user asked for some.

## Current State

- `packages/api-schema/src/chat/schema.ts`: `thinkingLevelSchema` (5-value enum)
  and `thinkingLevel` in `createSessionRequestSchema` /
  `createCodingSessionRequestSchema`.
- `packages/settings-schema/src/llm/schema.ts`: `llmSettingsSchema` with
  `apiFormat`, `apiKey`, `baseUrl`, `model`, `lightModel`. Composed twice in
  `src/schema.ts` as `llm` and `codingLlm`.
- Backend `LlmConfig` (`apps/backend/src/agent-core/llm-api/types.ts`):
  `apiFormat | apiKey | baseUrl | model`. Thinking level is a separate value
  threaded through `LlmCompletionOptions.thinkingLevel` and snapshotted on the
  agent.
- Thinking level is threaded: dispatcher router -> agent-session-service ->
  main/coding agent -> `Agent` (stored + snapshotted, with an assertion) ->
  turn-runner -> llm-session -> `LlmCompletionOptions` -> provider helpers, plus
  token-count, compaction, and usage-reporter.
- Provider helpers map the 5-value enum:
  `claude/helpers.ts` (`toThinkingConfig`, `toOutputConfig` with the
  `xhigh -> max` hack) and `openai-responses/helpers.ts` (`toReasoning`).
- Frontend: `ThinkingLevelSelect` + `THINKING_LEVEL_LABELS`/`THINKING_LEVELS`
  in the chat-session module; `SessionConfigContext` holds `thinkingLevel`;
  `ChatInput`/`ChatInputView` and `TaskDispatchCardView` render the selector;
  `SessionIdProvider` and the coding form send it on create.

## Design

### 1. Package layering — enum moves to `settings-schema`

`api-schema` depends on `settings-schema` (one-directional). Because thinking
level becomes a settings field, the canonical `thinkingLevelSchema` and
`ThinkingLevel` type move to `packages/settings-schema/src/llm/` and are widened
to the 7-value union. `api-schema` re-exports them (and/or backend imports
directly from `settings-schema`) so existing import sites keep compiling.

### 2. Settings schema

Add `thinkingLevel: thinkingLevelSchema.default('none')` to `llmSettingsSchema`
(with `.describe(...)`). Both `llm` and `codingLlm` inherit it automatically, so
Chat and Coding each have an independent thinking level, consistent with how
`model`/`apiKey` are already independent. The schema must remain convertible via
`z.toJSONSchema()` (enforced by the existing settings-schema test).

### 3. Settings UI

Add a "Thinking level" `Select` to both `ChatLlmSection`/`ChatLlmSectionFields`
and `CodingLlmSection`/`CodingLlmSectionFields`, listing all 7 levels. Add the
field path (`llm/thinkingLevel`, `codingLlm/thinkingLevel`) to each section's
`FIELDS`. Relocate `ThinkingLevelSelect` + the labels constant to the settings
area (or introduce a settings-local select) and extend the labels with
`minimal` and `max`. Validate the UI in light and dark themes per the frontend
guidelines.

### 4. `LlmConfig` + provider mapping

- Add `thinkingLevel: ThinkingLevel` to `LlmConfig`.
- `getLlmConfig()` (`apps/backend/src/services/agent-session/helpers.ts`) and the
  agent `getConfig`/`getLightConfig` closures (main-agent, coding-agent) read
  `thinkingLevel` from the relevant settings section. Read live on every call.
- Provider helpers read `config.thinkingLevel` (not a separate option) and apply
  the mapping table:
  - Claude `toThinkingConfig`: `none -> disabled`, else `adaptive`.
  - Claude `toOutputConfig`: `none -> undefined`; `minimal -> {effort: 'low'}`;
    `low/medium/high/xhigh -> {effort: same}`; `max -> {effort: 'max'}`.
    Removes the `xhigh -> max` hack.
  - OpenAI `toReasoning`: `none -> undefined`; `minimal/low/medium/high/xhigh ->
{effort: same}`; `max -> {effort: 'xhigh'}`.

### 5. Remove per-session threading

Remove `thinkingLevel` as a standalone threaded value (it now lives in
`LlmConfig`):

- `api-schema`: drop `thinkingLevel` from `createSessionRequestSchema` and
  `createCodingSessionRequestSchema`.
- Dispatcher `router.ts`: drop it from the parsed `options`.
- `agent-session-service`, `main-agent`, `coding-agent`,
  `explore/general-sub-agent`: drop the `thinkingLevel` constructor/param.
- `Agent`: stop storing/snapshotting `thinkingLevel`; remove the snapshot
  assertion. Old snapshots' extra field is ignored. Resumed sessions use the
  current settings value (live behavior).
- `agent-turn-runner`, `llm-session`, `LlmCompletionOptions`/
  `LlmTokenCountOptions`: remove the `thinkingLevel` parameter; the value comes
  from `config`.
- `token-count`, compaction, `agent-usage-reporter`: source thinking level from
  `config` where they previously took it as input. Usage reporting continues to
  surface the effective level (from config).

### 6. Subagent dispatch (agent-controlled, default `none`)

`dispatch_agent` keeps a **single static** `thinkingLevel` enum parameter (the
7-value union) with default `none` — unchanged behavior, just a wider enum and
updated description (what it does + when to set it, per tool guidelines). On
execute, it overrides the subagent's config: the subagent's `getConfig` returns
`{...parentConfig, thinkingLevel: chosen}` (chosen defaults to `none`). No
provider-aware schema and no turn-runner changes are needed. Settings thinking
level therefore applies to the main chat/coding agents only; subagents are
always agent-controlled. The `subagent-dispatch` SSE event keeps carrying the
chosen level for UI display.

### 7. Frontend cleanup

- Remove the thinking selector from `ChatInput`/`ChatInputView` and
  `TaskDispatchCardView` + coding form.
- Remove `thinkingLevel`/`setThinkingLevel` from `SessionConfigContext` /
  `SessionConfigProvider`, `SessionIdProvider`, and the coding form hook.
- `createSession` API: drop `thinkingLevel` from `CreateSessionOptions` and the
  request body.

## Data Flow

```
Settings (llm.thinkingLevel / codingLlm.thinkingLevel)
  -> getLlmConfig() / agent getConfig()  [live, per call]
    -> LlmConfig.thinkingLevel
      -> provider helpers (claude / openai) map+clamp to native effort
        -> API request

dispatch_agent(thinkingLevel = none by default)
  -> subagent getConfig = {...parentConfig, thinkingLevel: chosen}
    -> same provider mapping
```

## Testing

- `settings-schema`: extend the schema test to keep `z.toJSONSchema()` working
  with the new field/enum.
- Provider helpers: update `claude/helpers.test.ts` (and add OpenAI mapping
  coverage if missing) for the 7-value mapping, including `minimal -> low`
  (Claude), `max -> max` (Claude), `max -> xhigh` (OpenAI), and `none` handling.
- Agent core: update snapshot/persistence tests (no `thinkingLevel` in options;
  drop the missing-`thinkingLevel` assertion test), llm-session tests, turn-
  runner tests, usage-reporter, and compaction estimator tests to source the
  level from config.
- Dispatch tool tests: default `none`, explicit override, and config override
  propagation to the subagent.
- Frontend: update chat, coding (`CodingPage.test`, `useTaskDispatchForm.test`),
  and settings tests; remove assertions on `thinkingLevel` in create-session.
- Run lint, format check, and tests across affected packages.

## Risks

- **Broad threading removal.** The `thinkingLevel` parameter is threaded through
  many backend files; removal is mechanical but wide. Mitigated by the type
  system (compile errors pinpoint each site) and existing tests.
- **Behavior change for existing sessions.** Thinking level becomes live, so a
  resumed session no longer keeps its creation-time level. This is intended.
- **UX of collapsed levels.** On a given provider, some unified levels collapse
  to the same native effort (e.g. Claude `minimal`/`low`). Acceptable and
  expected given a single union scale; optional settings helper text can explain
  the per-API mapping.
