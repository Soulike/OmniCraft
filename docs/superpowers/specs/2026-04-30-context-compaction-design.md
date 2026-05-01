# Context Compaction Support

## Problem

`LlmSession` keeps every message in memory and persists the same array in
session snapshots. Long-running agents can eventually exceed the model context
window, especially after tool-heavy turns that add large file, shell, web, or
subagent results.

The user-visible transcript is not `llmSession.messages`. It is the SSE event
log. That means the LLM history can be compacted and rewritten as long as the
prompt sent to the next model call stays valid and preserves the important
conversation state.

Provider-managed compaction APIs are not a good first implementation target.
OpenAI and Anthropic expose provider-specific compacted/native blocks that do
not fit the current unified `LlmMessage` shape cleanly. A provider-independent
local summary is simpler and works for Claude, OpenAI Chat Completions, OpenAI
Responses, compatible OpenAI providers, and future MCP tool output.

## Goals

- Add automatic context compaction for `llmSession.messages`.
- Keep the full UI-visible transcript in SSE logs unchanged.
- Treat `llmSession.messages` as a model prompt projection that may be
  destructively rewritten.
- Use a provider-independent v1 strategy based on local summary messages.
- Trigger compaction at simple blocking boundaries when current context usage is
  at or above 80% of the model input window.
- Preserve provider message validity, especially assistant tool calls and tool
  results.
- Let tools provide semantic compaction for their own old results.
- Provide a safe default truncation policy for unknown and future third-party
  tools.
- Persist compacted history in normal session snapshots so restored sessions use
  the compacted prompt history.

## Non-Goals

- Do not use OpenAI or Anthropic provider-managed compaction APIs in v1.
- Do not add manual `/compact` or API-triggered compaction yet.
- Do not add frontend UX for compaction progress or context usage yet.
- Do not preserve all old user messages verbatim in `llmSession.messages`.
- Do not add a first-class `summary` message role in v1.
- Do not add summary quality self-evaluation in v1.
- Do not change SSE replay or the user-visible session transcript model.

## Current State

- `LlmSession` owns a private `messages: LlmMessage[]` array.
- `sendUserMessage()` appends a user message, streams a model response, then
  appends the assistant response.
- `submitToolResults()` appends tool result messages, streams the continuation,
  then appends the assistant response.
- Provider adapters convert the unified `LlmMessage` union to provider-specific
  request formats.
- `LlmMessage` is currently one of `user`, `assistant`, or `tool`.
- Assistant messages can contain `toolCalls` and provider continuity
  `thinking` blocks.
- Tool result messages contain `callId` and `content`, but not the execution
  status.
- `Agent` emits user-visible SSE events independently of `llmSession.messages`.
- Snapshots persist `llmSession.messages`; compacted messages will therefore be
  restored like normal history.

## Approaches Considered

### A. Provider-Managed Compaction

Use OpenAI or Anthropic compaction APIs when available.

This is deferred. It can preserve provider-native reasoning state, but it would
force provider-specific compacted items into the unified message model. That
would complicate persistence, adapters, tests, and cross-provider behavior.

### B. Generic Summary Without Tool Semantics

Summarize old messages directly with a generic prompt and replace them with one
summary message.

This is simple but weak for tool-heavy agents. Large tool outputs dominate the
compact input, and generic truncation can lose the metadata that matters most.

### C. Tool-Aware Slimming Plus Summary

Split old history from recent raw history, slim the old prefix deterministically,
let tools compact their own old results when they know better than a generic
truncator, summarize the slimmed prefix, and replace the prefix with a synthetic
summary message.

This is the selected approach. It keeps compaction centralized while letting
tool-specific output semantics improve summary quality.

## Selected Design

### Triggering

Compaction is blocking in v1. It runs at two boundaries:

1. **After a turn completes**: if current context usage is `>= 80%`, compact the
   session history before returning the session to idle state.
2. **Before every LLM call**: if current context usage is `>= 80%`, compact first
   and then call the provider.

The second trigger belongs inside `LlmSession.streamCompletion()` so both
`sendUserMessage()` and `submitToolResults()` are covered. This matters because
large tool results are added between model calls.

The trigger checks the already-built current prompt state. It should not project
future growth and must not use accumulated `LlmSession.getUsage()` counters.
Those counters are historical usage totals for display/accounting, not the size
of the current prompt. Trigger checks call `llmApi.countToken()` with the same
request projection used for model calls.

### Token Counting

Add `countToken()` as a sibling method to `llmApi.streamCompletion()`:

```typescript
llmApi.streamCompletion(options);
llmApi.countToken(options);
```

`countToken()` accepts the same prompt-shaping inputs as `LlmCompletionOptions`:

```typescript
interface LlmTokenCountOptions {
  readonly config: Readonly<LlmConfig>;
  readonly messages: readonly LlmMessage[];
  readonly systemPrompt?: string;
  readonly tools: readonly ToolDefinition[];
  readonly thinkingLevel: ThinkingLevel;
}
```

Adapter behavior:

- Claude uses `client.messages.countTokens()` after converting messages, tools,
  system prompt, and thinking config the same way the streaming adapter does.
- OpenAI Responses uses `client.responses.inputTokens.count()` after converting
  messages and tools with the same helpers as `streamOpenAIResponses()`.
- OpenAI Chat Completions and OpenAI-compatible providers use a conservative
  local estimator because a compatible token-count endpoint cannot be assumed.
- If a provider count API fails, use the conservative local estimator rather
  than disabling compaction checks.

The local estimator should serialize the same request projection that would be
sent to the provider and use a conservative character-to-token ratio. It only
drives the 80% compaction threshold; it is not used for billing or displayed
usage.

### Single Message Compaction

Compaction rewrites the prompt history to exactly one synthetic user message:

```text
<conversation_summary>
LLM-generated summary of the full slimmed history
</conversation_summary>

<recent_context>
deterministically slimmed latest 20 messages
</recent_context>

<continuation_instructions>
fixed continuation guidance
</continuation_instructions>
```

No raw `LlmMessage` suffix is retained after compaction. This keeps the
compacted provider message sequence simple and guarantees the compaction result
is bounded to one message instead of depending on assistant/tool-call boundary
closure.

### History Slimming

Before sending history to the summary model, deterministic slimming prepares a
compact input representation for the full current `messages` array:

- Assistant messages drop old `thinking` blocks.
- Assistant text and tool call metadata are preserved.
- User messages are preserved unless very large, in which case they use the
  same conservative truncation marker format as tool results.
- Tool result messages use a tool-specific compaction hook when available.
- Tool result messages without a hook use default conservative truncation.

The same slimming strategy is reused with a smaller per-message truncation limit
to generate deterministic recent context from the latest 20 messages. Slimming
affects only summary/recent-context input. It does not mutate `messages`
directly.

### Default Truncation

Unknown and future tools, including third-party MCP tools, must not be allowed
to make compaction itself exceed the context window. Missing tool-specific
compaction therefore uses this default policy:

```text
content length <= 8 KB:
  keep original content

content length > 8 KB:
  keep first 4 KB
  insert an omitted marker
  keep last 2 KB
```

The marker must be explicit and non-semantic, for example:

```text
[Tool result truncated for compaction only. Original length: 54231 chars.
Kept first 4096 chars and last 2048 chars.]
```

The default policy does not pretend to summarize. It only bounds size and tells
the summary model that material was omitted.

### Tool-Specific Compaction

Extend `ToolDefinition` with an optional compaction hook. Tools can transform
their own old result into compact-friendly text, but they do not mutate history
and do not call an LLM.

```typescript
interface ToolDefinition<...> {
  // existing fields unchanged

  compactResult?: (input: {
    content: string;
    status: 'success' | 'failure';
    toolCall: LlmToolCall;
    message: LlmToolResultMessage;
  }) => string | null;
}
```

Semantics:

- Return `string` to use that text in the summary input.
- Return `null` to omit the old result from the summary input.
- Omit the hook to use the default truncation policy.

To support this reliably, extend tool result history with a required status:

```typescript
export const llmToolResultMessageSchema = llmMessageBaseSchema.extend({
  role: z.literal('tool'),
  callId: z.string(),
  status: z.enum(['success', 'failure']),
});
```

`Agent.runAgentLoop()` already knows each tool execution status when it builds
`ToolResult`. It should pass the status into `LlmSession.submitToolResults()`.

Initial tool policies:

- `read_file`: keep file path, total lines, requested line range, whether the
  read was partial, and a short excerpt when useful.
- `search_files` and `find_files`: keep pattern/path, match count, truncated
  flag, and important file paths; avoid retaining every match forever.
- `run_command`: keep command, cwd, exit code, timeout status, and saved output
  file paths; preserve more text for failures than successes.
- `web_fetch` and `web_search`: keep URL/query/title/result count/key URLs;
  old page bodies can usually be reduced.
- `dispatch_agent`: keep the returned subagent summary, not the subagent's
  internal history.
- todo tools: keep the latest useful todo state; older superseded snapshots can
  usually return `null`.

### Summary Generation

The compactor formats the full slimmed history into a summary prompt. The LLM
returns only a summary string, not a replacement message array. Empty summaries
are treated as compaction failures.

The summary prompt must require preserving:

- user goals and explicit requirements;
- user corrections, constraints, preferences, and acceptance criteria;
- decisions made;
- important files, paths, commands, and code areas;
- tool results that still matter;
- errors, failures, and current hypotheses;
- pending work and next steps.

The prompt must also instruct the model not to invent facts and not to weaken or
drop user instructions simply because they appeared early in the conversation.

The first implementation uses the current session LLM configuration for summary
generation. This avoids adding a second config dependency to `LlmSession` and
avoids accidentally choosing a lightweight model with a smaller context window.
If the summary request fails due to provider or model configuration errors, the
caller should surface a clear compaction failure rather than silently continuing
into a likely context overflow.

### Writing Back to Messages

Code constructs the final `messages` array. The summary LLM never controls the
history mutation.

Because `LlmMessage` has no summary role in v1, the compacted summary is stored
as a synthetic user message:

```typescript
const summaryMessage: LlmUserMessage = {
  id: crypto.randomUUID(),
  createdAt: Date.now(),
  role: 'user',
  content: buildCompactedMessageContent({summary, recentContext}),
};
```

The final mutation is:

```typescript
this.messages.length = 0;
this.messages.push(summaryMessage);
```

If the compactable prefix already contains an earlier synthetic summary, that
summary is included in the next summary input. The final history should still
contain one latest summary message.

Older user messages do not remain verbatim in `llmSession.messages`. Their
important content is captured in the summary. The full user-visible transcript
remains available through SSE logs.

### Compaction Metadata

Store lightweight metadata for debugging and future migrations. Extend
`LlmSessionSnapshot` with a required `compactions` array:

```typescript
export const llmSessionSnapshotSchema = z.object({
  id: z.string(),
  messages: z.array(llmMessageSchema),
  compactions: z.array(llmCompactionMetadataSchema),
});
```

Each entry uses this shape:

```typescript
interface LlmCompactionMetadata {
  id: string;
  compactedAt: number;
  strategyVersion: number;
  coveredMessageCount: number;
  recentContextMessageCount: number;
  beforeCharCount: number;
  afterCharCount: number;
}
```

This metadata is not used to render UI history. New sessions initialize it as an
empty array and append one entry after each successful compaction.

### Failure Handling

If compaction fails before an LLM call, the agent should not silently continue
into a likely context overflow. The stream should fail with a clear error so the
user can retry or the issue can be debugged.

If compaction fails after a completed turn, keep the original messages, log the
failure, persist normal session state if appropriate, and let the next pre-LLM
trigger force another compaction attempt.

If compacted history would still exceed the threshold, future versions can retry
with a more aggressive summary/recent-context policy. They should still preserve
the single-message compacted history shape.

## Backend Components

### LlmSession

`LlmSession` owns compaction because it owns message mutation and all LLM calls
flow through it.

Responsibilities:

- use `llmApi.countToken()` to check the pre-LLM trigger before provider calls;
- expose a turn-end compaction method for `Agent` to call after `done`;
- hold and persist compaction metadata;
- update `ToolResult` handling to store required status in tool messages;
- preserve rollback behavior when normal model streams fail.

The turn-end public method should still perform its own `llmApi.countToken()`
check internally. `Agent` supplies the active tools, system prompt, and thinking
level, but it does not calculate context size or mutate LLM history directly.

### Agent

`Agent` participates only at the lifecycle boundary. After a turn emits `done`,
it calls the `LlmSession` turn-end compaction method with the same active tools,
system prompt, and thinking level used during that turn. If that after-turn
compaction fails, `Agent` logs the failure and keeps the already-completed turn
intact; the next pre-LLM trigger will attempt compaction again.

### LlmApi

`llmApi` dispatches token counting by `config.apiFormat`, mirroring
`streamCompletion()` dispatch. Token counting must use the same adapter helpers
that build provider request payloads so the counted prompt matches the prompt
that will be sent as closely as the provider allows.

### History Compactor

Add focused compactor modules under
`apps/backend/src/agent-core/llm-session/compaction/`.

Responsibilities:

- slim full-history messages;
- build deterministic recent context from the latest messages;
- format the summary prompt;
- call the configured summary model;
- return `{summaryMessage, metadata}` without directly emitting SSE events.

### Tool Registry Integration

The compactor needs access to the current tool definitions to find
`compactResult` hooks. `LlmSession.streamCompletion()` already receives the
active `tools` array. The compactor should use that list to map tool call names
to definitions.

For tool calls whose definition is no longer available, use the default
truncation policy.

### Provider Adapters

Provider adapters should not know about compaction in v1. After compaction, they
receive a normal `LlmMessage[]` containing one synthetic user summary message.

Existing adapter conversion rules continue to apply:

- Claude receives the summary as a user text message.
- OpenAI Chat Completions receives the summary as a user message.
- OpenAI Responses receives the summary as a message input item.

## Testing

### Unit Tests

Add slimming tests:

- old assistant thinking blocks are removed from summary input;
- small unknown tool results are preserved;
- large unknown tool results use head/tail truncation with an omitted marker;
- tool `compactResult()` overrides default truncation;
- `compactResult()` returning `null` omits the old tool result from summary
  input.
- recent context is built from the latest 20 slimmed messages.

Add message mutation tests:

- compacted history is a single synthetic summary user message;
- an older summary is folded into the new summary input;
- compaction metadata is appended;
- new session snapshots initialize `compactions: []`;
- compacted snapshots append compaction metadata.

### Integration Tests

Add an `LlmSession` test with a fake summary model/provider:

- pre-LLM trigger compacts before calling the provider;
- turn-end compaction can be called after a completed agent turn;
- compaction failure before an LLM call surfaces a clear error;
- compaction failure after a turn preserves original messages.

### Existing Tests

Update tests that construct `ToolResult` or `LlmToolResultMessage` mocks to
provide the required status field.

## Future Work

- Add manual compact with user-provided focus instructions.
- Add frontend context usage and compaction progress display.
- Add provider-managed compaction as an optional adapter capability.
- Add first-class `role: 'summary'` to `LlmMessage` once the unified adapter
  model needs it.
- Add summary quality checks for high-risk sessions.
