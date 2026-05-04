# Session Usage Reporting

## Problem

The current session usage payload mixes two different meanings of token usage.
Backend `LlmSession.getUsage()` returns accumulated token usage across all LLM
calls in the session, but the frontend treats `usage.inputTokens` as the current
context-window occupancy and calculates it against the model input window.

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
- Keep the change small and continue using the existing `done.usage` event flow.
- Replace the ambiguous public `SseUsage` token field names instead of keeping
  aliases or compatibility fallbacks.

## Non-Goals

- Do not add a full pricing or cost calculation system.
- Do not add per-provider pricing tables.
- Do not add usage charts, histories, or analytics storage.
- Do not change the compaction trigger logic.
- Do not change usage accounting for auxiliary LLM calls such as title
  generation or compaction summaries. The cumulative fields in this spec keep
  the current scope: conversation LLM calls managed by `LlmSession`.
- Do not preserve compatibility with historical SSE logs that use the previous
  token field names.
- Do not keep `maxInputTokens`, `contextInputTokens`, `inputTokens`,
  `outputTokens`, or `cacheReadInputTokens` as public `SseUsage` fields.

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

### C. Use Explicit Context And Session Token Names

Rename the public usage fields so every token count states its scope. Use
`contextWindowTokens` and `currentContextInputTokens` for context capacity, and
`sessionInputTokens`, `sessionOutputTokens`, and
`sessionCacheReadInputTokens` for cumulative session totals.

This is the selected approach. It fixes the context percentage bug while
making the protocol self-explanatory.

## Selected Design

### Usage Semantics

`done.usage` will use these meanings:

```typescript
interface SseUsage {
  model: string;
  thinkingLevel: ThinkingLevel;
  contextWindowTokens: number;

  /** Input tokens in the latest model call; used for context-window usage. */
  currentContextInputTokens: number;

  /** Accumulated input tokens for this session. */
  sessionInputTokens: number;

  /** Accumulated output tokens for this session. */
  sessionOutputTokens: number;

  /** Accumulated input tokens served from provider cache for this session. */
  sessionCacheReadInputTokens: number;
}
```

The frontend computes context usage and remaining context from the new field:

```typescript
const contextRatio =
  usage.currentContextInputTokens / usage.contextWindowTokens;
const remainingContextTokens = Math.max(
  0,
  usage.contextWindowTokens - usage.currentContextInputTokens,
);
```

### Backend State

Separate the provider-call usage shape from the session-facing usage shape.
`llm-api` reports raw usage for one completed model call, and `llm-session`
folds those per-call values into session-level business metrics.

`llm-api` will expose provider-call usage:

```typescript
export interface LlmCallUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadInputTokens: number;
}
```

`llm-session/types.ts` will expose session usage:

```typescript
export interface LlmSessionUsage {
  currentContextInputTokens: number;
  sessionInputTokens: number;
  sessionOutputTokens: number;
  sessionCacheReadInputTokens: number;
}
```

`LlmSession` will keep one session usage object:

```typescript
private usage: LlmSessionUsage = {
  currentContextInputTokens: 0,
  sessionInputTokens: 0,
  sessionOutputTokens: 0,
  sessionCacheReadInputTokens: 0,
};
```

When a provider emits `message-end`, keep the existing cumulative update and set
the new context field from that completed call's input tokens:

```typescript
this.usage = {
  currentContextInputTokens: event.usage.inputTokens,
  sessionInputTokens: this.usage.sessionInputTokens + event.usage.inputTokens,
  sessionOutputTokens:
    this.usage.sessionOutputTokens + event.usage.outputTokens,
  sessionCacheReadInputTokens:
    this.usage.sessionCacheReadInputTokens + event.usage.cacheReadInputTokens,
};
```

`Agent.buildSseUsage()` will add model metadata around the session usage:

```typescript
const usage = this.llmSession.getUsage();
return {
  model: config.model,
  contextWindowTokens,
  thinkingLevel: this.thinkingLevel,
  ...usage,
};
```

The initial and cleared state is zero. If a turn aborts before a new
`message-end`, `currentContextInputTokens` remains the latest successfully
completed call's input usage, matching the currently known context measurement.

### Frontend Display

`UsageInfoView` will separate context capacity from cumulative usage:

- `Context: <currentContextInputTokens> / <contextWindowTokens> (<percent>%)`
- `Input: <sessionInputTokens>`
- `Output: <sessionOutputTokens>`
- `Cached: <sessionCacheReadInputTokens> (<sessionCacheReadInputTokens / sessionInputTokens>%)`

The warning threshold continues to use 80%, but it is now based on
`currentContextInputTokens / contextWindowTokens`.

### Protocol Change

This is a protocol shape change for `SseUsage`; backend and frontend are in the
same workspace and should be updated together. The old public usage token field
names are removed rather than accepted as optional aliases. Historical SSE logs
without the new usage field names do not need a migration fallback for this
change.

## Testing

- Backend `LlmSession` tests should cover two completed model calls with
  different input usages. Expected result: `currentContextInputTokens` equals the
  second call's input tokens, while `sessionInputTokens`,
  `sessionOutputTokens`, and `sessionCacheReadInputTokens` are cumulative.
- Backend `Agent` tests should verify `done.usage.currentContextInputTokens` is
  present and that `done.usage.sessionInputTokens` remains cumulative.
- SSE schema tests should cover requiring the explicit token field names in
  `done.usage`.
- Frontend `UsageInfoView` tests should verify the context percentage uses
  `currentContextInputTokens`, and that cumulative `Input` renders from
  `sessionInputTokens`.

## Acceptance Criteria

- `done.usage.currentContextInputTokens` reports the latest completed model call
  input tokens.
- `done.usage.sessionInputTokens` reports cumulative session input tokens.
- `done.usage.sessionOutputTokens` reports cumulative session output tokens.
- `done.usage.sessionCacheReadInputTokens` reports cumulative session cached
  input tokens.
- The frontend context percentage and warning state use `currentContextInputTokens`.
- The frontend shows cumulative input tokens as a separate field.
- Public `SseUsage` payloads and fixtures no longer use `maxInputTokens`,
  `contextInputTokens`, `inputTokens`, `outputTokens`, or
  `cacheReadInputTokens` as token field names.
