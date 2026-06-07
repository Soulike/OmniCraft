# Return Subagent ID from dispatch_agent and resume_agent

## Problem

After `dispatch_agent` runs, the main agent (the LLM) never learns the
dispatched subagent's id. The tool result that reaches the LLM is only the
subagent's summary text (`agent-turn-runner.ts` forwards `result.content` as the
tool result message). The id (`agentId`) is emitted solely through SSE events
(`subagent-dispatch`, `subagent-output`, `subagent-complete`) that reach the
frontend, never the LLM.

Consequently, to send follow-up work the main agent must always call
`list_resumable_agents` first to discover the id before calling `resume_agent`.
That listing tool was meant as a fallback for when the agent is unsure which
subagent to resume — not a mandatory step on every resume.

## Goal

Surface the subagent id to the LLM in the result of both `dispatch_agent` and
`resume_agent`, so the agent can resume a subagent directly without an extra
lookup. The listing tool remains available as a fallback.

## Design

### Where

The change lives in the shared `runSubagentTurn` helper
(`apps/backend/src/agent/tools/sub-agent/subagent-turn-runner.ts`), which both
tools call. Centralizing here makes both tools return the id consistently with
no per-tool special-casing.

### Result shape

`SubagentTurnResult` gains an `agentId` field:

```ts
export interface SubagentTurnResult {
  summary: string;
  agentId: string;
}
```

Only the success path carries the id. Failure, abort, and error paths keep
returning the existing `ToolExecuteFailureResult` (`{ message }`) unchanged —
error content is not annotated with the id, to avoid cluttering error messages
for a subagent that may be in a bad state.

### Content format (what the LLM sees)

On success, `content` wraps the id in a labeled block above the summary:

```
<subagent_id>{agentId}</subagent_id>

{summary}
```

- The id is delimited so it is unambiguous and not confused with the subagent's
  own output.
- Placing it at the top guarantees it survives compaction head/tail truncation.
- `data` carries the structured `{ summary, agentId }`.

The success branch currently returns:

```ts
return {data: {summary}, content: summary, status: 'success'};
```

It becomes:

```ts
const content = `<subagent_id>${subagent.id}</subagent_id>\n\n${summary}`;
return {data: {summary, agentId: subagent.id}, content, status: 'success'};
```

### compactResult

`dispatch_agent` and `resume_agent` both define
`compactResult({content}) => content.trim() || null`. Because the id is part of
`content`, it is preserved through compaction with no change to these hooks.

### Tool descriptions

Add one generic sentence to the `dispatch_agent` and `resume_agent`
descriptions: the result includes the subagent's id, which can later be used to
send the subagent follow-up work without a separate discovery step. Wording
stays generic and does not name other tools, per
`apps/backend/src/agent/tools/CLAUDE.md`.

### Frontend / SSE

No change. The frontend already receives `agentId` via `subagent-dispatch`,
`subagent-resume`, `subagent-output`, and `subagent-complete` events.

## Testing

- `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts`:
  - Update the two `runSubagentTurn` success assertions (currently
    `data: {summary: 'done'}, content: 'done'` and
    `data: {summary: 'new summary'}, content: 'new summary'`) to expect
    `agentId` in `data` and the `<subagent_id>…</subagent_id>` wrapper in
    `content`.
  - Add an assertion that `content` contains the subagent id.
  - Leave the failure-path (aborted) assertions unchanged.
- `apps/backend/src/agent/tools/sub-agent/resume-agent-tool.test.ts`:
  - Update the success assertion (currently
    `data: {summary: 'follow-up result'}, content: 'follow-up result'`) the same
    way.

## Out of Scope

- No change to the `SubagentRegistry`, eviction, or resume-claim logic.
- No change to SSE event schemas.
- `list_resumable_agents` keeps its current behavior and remains the fallback
  discovery path.
