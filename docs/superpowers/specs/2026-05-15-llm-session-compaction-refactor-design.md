# LlmSession Compaction Refactor

## Problem

`LlmSession` currently owns too much of the context compaction workflow. The
compaction behavior is acceptable, but the code organization makes the workflow
hard to read because `LlmSession` mixes session lifecycle concerns with
compaction-specific concerns:

- deciding whether compaction should run;
- estimating prompt tokens for compaction decisions;
- creating compaction SSE events;
- generating the summary;
- building deterministic recent context;
- creating the synthetic replacement message;
- mutating session messages, usage, and compaction metadata;
- normalizing compaction errors.

This makes `LlmSession` harder to maintain and makes future compaction changes
likely to expand the class further.

## Goals

- Move actual compaction logic out of `LlmSession`.
- Keep `LlmSession` focused on session lifecycle: locking, rollback, message
  submission, streaming completions, snapshots, and applying state patches.
- Introduce coherent singleton classes for compaction responsibilities.
- Add a clear `compaction/index.ts` package boundary that exports only the
  public compaction facade used by `LlmSession`.
- Name compaction files after the primary object they export.
- Preserve current runtime behavior, event ordering, public APIs, prompts,
  slimming behavior, token thresholds, metadata shape, and tests.

## Non-Goals

- Do not change when compaction triggers.
- Do not change the summary prompt or deterministic recent-context content.
- Do not change the public `LlmSession.compactIfNeeded()` API.
- Do not change SSE schemas or frontend rendering.
- Do not add manual compaction controls.
- Do not add provider-managed compaction.
- Do not introduce per-session mutable singleton state.

## Current State

`apps/backend/src/agent-core/llm-session/llm-session.ts` currently contains the
main compaction workflow in `compactIfNeededUnlocked()`. The existing
`compaction/` folder contains useful helpers, but those helpers are below the
right abstraction level. They do not give `LlmSession` a single coherent
operation to call.

Current compaction helper files include:

- `constants.ts`
- `prompt.ts`
- `slim.ts`
- `summary.ts`

These names describe broad implementation topics rather than the objects that
own each responsibility. The folder also has no `index.ts` boundary, so callers
can import internals directly.

## Selected Design

Create a small compaction package with one public facade singleton:

```typescript
import {llmSessionCompactor} from './compaction/index.js';
```

`LlmSession` should import only `llmSessionCompactor` from the compaction
package. It should not import decision services, event factories, summary
generators, prompt builders, or slimming helpers.

The compaction package should expose internal classes from their own files for
focused unit tests, but `compaction/index.ts` should re-export only the public
singleton facade.

Production code outside `compaction/` should not import from compaction
internal files. Internal compaction files may import each other directly. Tests
may import internal files when they need focused coverage of a specific service.

### File Structure

Use object-named files:

```text
apps/backend/src/agent-core/llm-session/compaction/
  index.ts

  llm-session-compactor.ts
  llm-compaction-decision-service.ts
  llm-history-compactor.ts
  llm-compaction-event-factory.ts
  llm-compaction-token-estimator.ts
  llm-compaction-types.ts

  compaction-prompt-builder.ts
  compaction-message-slimmer.ts
  compaction-summary-generator.ts
  compaction-constants.ts
```

`index.ts` should be intentionally small:

```typescript
export {llmSessionCompactor} from './llm-session-compactor.js';
```

### Responsibility Boundaries

#### `LlmSession`

`LlmSession` remains the owner of session state and session lifecycle.

Responsibilities:

- acquire and release the session mutex;
- snapshot state before a turn and roll back if needed;
- append user/tool messages;
- stream normal model completions;
- expose public `compactIfNeeded()` for after-turn callers;
- apply a compaction patch returned by the compactor;
- preserve before-call failure wrapping in `compactBeforeModelCall()`.

`LlmSession` should not know how compaction decisions, summaries, events, or
metadata are built.

#### `LlmSessionCompactor`

`LlmSessionCompactor` is the public facade for the compaction package. It owns
the compaction workflow and yields compaction events.

Responsibilities:

- ask the decision service whether compaction should run;
- yield `context-compaction-start` when compaction begins;
- call the history compactor;
- build the session state patch;
- call a `commit()` callback supplied by `LlmSession`;
- yield `context-compaction-end` after state is committed;
- yield `context-compaction-error` on failure and rethrow the underlying error.

The facade yields events because event ordering is part of the compaction
workflow. If `LlmSession` built these events itself, it would need to understand
compaction decisions, timings, counts, summaries, and error policy.

`LlmSessionCompactor` must not append events to the SSE log. It only yields
events upward. `Agent` remains responsible for writing yielded events to the SSE
log.

#### `LlmCompactionDecisionService`

Determines whether compaction should run.

Responsibilities:

- get the model input-token capacity;
- estimate current prompt size through `LlmCompactionTokenEstimator`;
- compare against `COMPACTION_TRIGGER_INPUT_TOKEN_RATIO`;
- return a skip decision or a compact decision with the data needed to start
  the workflow.

The decision result should carry values such as `compactionId`, `beforeTokens`,
`coveredMessageCount`, and `startedAt` so later workflow steps do not recompute
or infer them.

#### `LlmCompactionTokenEstimator`

Owns prompt token estimation for compaction decisions and post-compaction usage
updates.

Responsibilities:

- prefer latest provider usage when it is valid for the current message state;
- estimate pending message tokens when latest usage is available;
- fall back to local prompt estimation from messages, system prompt, tools, and
  thinking level;
- expose a method for estimating tokens from an arbitrary replacement message
  array, so post-compaction usage can be calculated without mutating state
  first.

#### `LlmHistoryCompactor`

Builds the compacted replacement history.

Responsibilities:

- calculate pre-compaction character count;
- generate the summary through `CompactionSummaryGenerator`;
- validate that the summary is not empty;
- build deterministic recent context through `CompactionMessageSlimmer`;
- build the synthetic summary message through `CompactionPromptBuilder`;
- return replacement messages, summary text, and metadata inputs.

This class should not mutate `LlmSession` state and should not yield SSE events.

#### `LlmCompactionEventFactory`

Builds `SseContextCompactionEvent` payloads.

Responsibilities:

- create start events from compact decisions;
- create end events from compact decisions, history compaction results, and
  `afterTokens`;
- create error events from compact decisions, errors, and abort signals.

Centralizing event creation keeps the facade readable without moving event
policy back into `LlmSession`.

#### Helper Objects

The existing helper responsibilities should be renamed into object-shaped files:

- `prompt.ts` becomes `compaction-prompt-builder.ts`.
- `slim.ts` becomes `compaction-message-slimmer.ts`.
- `summary.ts` becomes `compaction-summary-generator.ts`.
- `constants.ts` becomes `compaction-constants.ts`.

Except for constants and type-only files, each compaction file should export a
primary class and a singleton instance with matching names. For example,
`compaction-message-slimmer.ts` should export `CompactionMessageSlimmer` and
`compactionMessageSlimmer`. This keeps imports searchable and makes the object
graph explicit.

Test files should follow the same object names where practical, for example
`compaction-summary-generator.test.ts` instead of `summary.test.ts`.

## Proposed API Shape

### Public Facade

```typescript
export interface CompactLlmSessionIfNeededInput {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly usage: Readonly<LlmSessionUsage>;
  readonly usageBaselineMessageCount: number | null;
  readonly options: LlmCompactionOptions;
  readonly commit: (patch: LlmSessionCompactionPatch) => void;
}

export class LlmSessionCompactor {
  async *compactIfNeeded(
    input: CompactLlmSessionIfNeededInput,
  ): AsyncGenerator<SseContextCompactionEvent, void, void>;
}

export const llmSessionCompactor = new LlmSessionCompactor(...);
```

### Session Patch

```typescript
export interface LlmSessionCompactionPatch {
  readonly messages: readonly LlmMessage[];
  readonly usage: LlmSessionUsage;
  readonly usageBaselineMessageCount: number | null;
  readonly metadata: LlmCompactionMetadata;
}
```

`LlmSession` applies this patch with a small method:

```typescript
private applyCompactionPatch(patch: LlmSessionCompactionPatch): void {
  this.messages.length = 0;
  this.messages.push(...patch.messages);
  this.usage = patch.usage;
  this.usageBaselineMessageCount = patch.usageBaselineMessageCount;
  this.compactions.push(patch.metadata);
}
```

### LlmSession Usage

After the refactor, `compactIfNeededUnlocked()` should become a delegation
method:

```typescript
private async *compactIfNeededUnlocked(
  options: LlmCompactionOptions,
): AsyncGenerator<SseContextCompactionEvent, void, void> {
  const config = await this.getConfig();

  yield* llmSessionCompactor.compactIfNeeded({
    config,
    messages: this.messages,
    usage: this.usage,
    usageBaselineMessageCount: this.usageBaselineMessageCount,
    options,
    commit: (patch) => this.applyCompactionPatch(patch),
  });
}
```

## Event Boundary

`LlmSessionCompactor` should yield compaction events. Lower-level services
should return data only.

This boundary keeps event sequencing close to the workflow:

```text
decision says compact
yield start
build compacted history
build patch
commit patch
yield end
```

On failure:

```text
decision says compact
yield start
build compacted history fails
yield error
rethrow
```

`LlmSession` still wraps before-call compaction failures with the current clear
error message. `Agent` still treats after-turn compaction as best-effort cleanup
by logging the error and keeping the completed turn successful.

## Singleton Policy

The compaction classes should be singleton services, but they must remain
stateless with respect to individual sessions. Per-session state belongs to
`LlmSession` and is passed into compaction methods explicitly.

Allowed singleton state:

- references to other stateless services;
- constants;
- pure helper methods.

Disallowed singleton state:

- message arrays;
- usage counters;
- compaction metadata;
- in-flight compaction details;
- abort signals.

## Error Handling

Preserve current behavior:

- If compaction is skipped, yield nothing.
- If compaction succeeds, yield start then end.
- If compaction fails, yield start then error, then rethrow.
- If the abort signal trips during compaction, the error event message is
  `Aborted`.
- Before-call compaction failures are wrapped by `LlmSession` with
  `Failed to compact LLM session before model call: ...` unless the signal was
  aborted.
- After-turn compaction failures are caught and logged by `Agent`.
- Normal model-stream failures after pre-call compaction still roll back the
  full session state using the existing `sendMessages()` rollback path.

## Testing

Keep existing behavior tests and add focused tests for the new service boundary.

### Existing Tests To Preserve

- `LlmSession` compacts before model calls when threshold is met.
- `LlmSession` yields start/end events on successful compaction.
- `LlmSession` yields start/error and rethrows on compaction failure.
- `LlmSession` rolls back compaction if the provider stream fails afterward.
- `Agent` emits before-call compaction events before generic errors.
- `Agent` emits after-turn compaction events before `done`.

### New Focused Tests

- `LlmCompactionDecisionService` returns skip below threshold.
- `LlmCompactionDecisionService` returns compact at or above threshold.
- `LlmSessionCompactor` calls `commit()` before yielding the end event.
- `LlmSessionCompactor` does not call `commit()` when history compaction fails.
- `LlmSessionCompactor` yields error events and rethrows failures.
- `compaction/index.ts` exports only `llmSessionCompactor`.

## Migration Plan

1. Add `llm-compaction-types.ts` for internal compaction input, decision,
   result, and patch types.
2. Rename helper files and focused helper tests to object-named files and
   update internal imports.
3. Extract token estimation from `LlmSession` into
   `LlmCompactionTokenEstimator`.
4. Add `LlmCompactionDecisionService`.
5. Add `LlmHistoryCompactor` around summary generation, recent context, and
   synthetic message creation.
6. Add `LlmCompactionEventFactory`.
7. Add `LlmSessionCompactor` as the package facade and export only
   `llmSessionCompactor` from `compaction/index.ts`.
8. Replace `LlmSession.compactIfNeededUnlocked()` internals with a call to the
   facade and a small `applyCompactionPatch()` method.
9. Run focused backend tests for `llm-session` and `agent` compaction behavior.

## Acceptance Criteria

- `LlmSession` imports only `llmSessionCompactor` from `./compaction/index.js`.
- No compaction decision, summary, slimming, event construction, or token
  estimation logic remains in `LlmSession`.
- `compaction/index.ts` exports only the public singleton facade.
- Compaction internal files are named after the main object or module they
  export.
- Production code outside `compaction/` does not import compaction internal
  files directly.
- Existing compaction behavior and event ordering are unchanged.
- Focused tests pass.
