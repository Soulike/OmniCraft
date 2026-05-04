# Session Usage Reporting

## Problem

The current session usage payload mixes two different meanings of token usage.
Backend `LlmSession.getUsage()` returns accumulated token usage across all LLM
calls in the session, but the frontend treats `usage.inputTokens` as the current
context-window occupancy and calculates `usage.inputTokens / maxInputTokens`.

This makes the context percentage grow with every turn even when compaction has
reduced the prompt sent to the model. It also makes one field mean both
"current context size" and "cumulative billable input," which are different
metrics.

## Goals

- Report remaining context accurately after each turn.
- Keep session-level cumulative input token usage for cost display.
- Keep session-level cumulative output token usage for cost display.
- Keep session-level cumulative cache-read input token usage so cached input can
  be shown and used by future cost calculations.
- Make the frontend usage labels match the metric semantics.
- Keep the change small and compatible with the existing `done.usage` flow.

## Non-Goals

- Do not add a full pricing or cost calculation system.
- Do not add per-provider pricing tables.
- Do not add usage charts, histories, or analytics storage.
- Do not change the compaction trigger logic.
- Do not change usage accounting for auxiliary LLM calls such as title
  generation or compaction summaries. The cumulative fields in this spec keep
  the current scope: conversation LLM calls managed by `LlmSession`.

## Current State

- Provider adapters emit per-call `message-end` usage containing
  `inputTokens`, `outputTokens`, and `cacheReadInputTokens`.
- `LlmSession` stores one `usage` object and currently adds each provider
  `message-end` usage into it.
- `Agent.buildSseUsage()` spreads `this.llmSession.getUsage()` into the SSE
  `done.usage` payload.
- `packages/sse-events` defines `SseUsage` with `maxInputTokens`,
  `inputTokens`, `outputTokens`, and `cacheReadInputTokens`.
- `UsageInfoView` renders `Input: inputTokens / maxInputTokens (percent)` and
  therefore treats cumulative input as current context usage.

## Approaches Considered

### A. Redefine `inputTokens` As Current Context Usage

This would keep the payload shape unchanged, but it would lose the existing
session cumulative input metric unless another billing field were added. It also
keeps the field name ambiguous.

### B. Split Every Metric Into Context And Cumulative Variants

This would be explicit, but it creates more fields than the UI currently needs.
For example, separate context output tokens are not useful for context capacity.

### C. Add `contextInputTokens` And Keep Existing Totals

Add one field for the current context input token count. Keep `inputTokens`,
`outputTokens`, and `cacheReadInputTokens` as session cumulative totals.

This is the selected approach. It fixes the context percentage bug while
preserving the existing cumulative usage values with minimal API and UI churn.

## Selected Design

### Usage Semantics

`done.usage` will use these meanings:

```typescript
interface SseUsage {
  model: string;
  thinkingLevel: ThinkingLevel;
  maxInputTokens: number;

  /** Input tokens in the latest model call; used for context-window usage. */
  contextInputTokens: number;

  /** Accumulated input tokens for this session. */
  inputTokens: number;

  /** Accumulated output tokens for this session. */
  outputTokens: number;

  /** Accumulated input tokens served from provider cache for this session. */
  cacheReadInputTokens: number;
}
```

The frontend computes context usage and remaining context from the new field:

```typescript
const contextRatio = usage.contextInputTokens / usage.maxInputTokens;
const remainingContextTokens = Math.max(
  0,
  usage.maxInputTokens - usage.contextInputTokens,
);
```

### Backend State

The provider per-call usage shape should be named for what it represents, for
example `LlmCallUsage`. `LlmSession.getUsage()` should return a separate
session-facing shape that includes both the latest context input and cumulative
totals.

`LlmSession` will track two usage values internally:

- `latestUsage`: the provider usage from the latest completed LLM call.
- `cumulativeUsage`: the sum of provider usage across completed LLM calls in
  the session.

When a provider emits `message-end`:

```typescript
this.latestUsage = event.usage;
this.cumulativeUsage = addUsage(this.cumulativeUsage, event.usage);
```

`LlmSession.getUsage()` will return one object shaped for SSE assembly:

```typescript
{
  contextInputTokens: this.latestUsage.inputTokens,
  inputTokens: this.cumulativeUsage.inputTokens,
  outputTokens: this.cumulativeUsage.outputTokens,
  cacheReadInputTokens: this.cumulativeUsage.cacheReadInputTokens,
}
```

The initial and cleared state is all zeroes. If a turn aborts before a new
`message-end`, `contextInputTokens` remains the latest successfully completed
call's input usage, matching the currently known context measurement.

### Frontend Display

`UsageInfoView` will separate context capacity from cumulative usage:

- `Context: <contextInputTokens> / <maxInputTokens> (<percent>%)`
- `Input: <inputTokens>`
- `Output: <outputTokens>`
- `Cached: <cacheReadInputTokens> (<cacheReadInputTokens / inputTokens>%)`

The warning threshold continues to use 80%, but it is now based on
`contextInputTokens / maxInputTokens`.

### Compatibility

This is a protocol shape change for `SseUsage`; backend and frontend are in the
same workspace and should be updated together. Historical SSE logs without
`contextInputTokens` are not schema-compatible after this change unless a
migration fallback is added.

Because persisted event logs are validated with `sseEventSchema`, the
implementation will add a schema fallback that treats missing
`contextInputTokens` as `inputTokens` for old logs. This preserves existing
session replay and keeps the migration localized to the SSE schema boundary.

## Testing

- Backend `LlmSession` tests should cover two completed model calls with
  different input usages. Expected result: `contextInputTokens` equals the
  second call's input tokens, while `inputTokens`, `outputTokens`, and
  `cacheReadInputTokens` are cumulative.
- Backend `Agent` tests should verify `done.usage.contextInputTokens` is present
  and that `done.usage.inputTokens` remains cumulative.
- SSE schema tests should cover parsing an old usage payload without
  `contextInputTokens` and defaulting it to `inputTokens`.
- Frontend `UsageInfoView` tests should verify the context percentage uses
  `contextInputTokens`, and that cumulative `Input` renders separately.

## Acceptance Criteria

- `done.usage.contextInputTokens` reports the latest completed model call input
  tokens.
- `done.usage.inputTokens` reports cumulative session input tokens.
- `done.usage.outputTokens` reports cumulative session output tokens.
- `done.usage.cacheReadInputTokens` reports cumulative session cached input
  tokens.
- The frontend context percentage and warning state use `contextInputTokens`.
- The frontend shows cumulative input tokens as a separate field.
- Existing session replay remains compatible through the schema fallback.
