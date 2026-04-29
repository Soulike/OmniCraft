# Subagent Resume

## Problem

Issue #200 asks for the main agent to resume a previous subagent session so it can continue earlier work, such as addressing review comments. Issue #218 already persisted dispatched subagent history under the parent session directory, but it intentionally did not add a resume tool or any restore behavior.

The desired external behavior is that the main agent resumes a previous subagent by ID and sends it a follow-up task. Internally, resume is implemented by creating a new subagent instance from the old subagent's persisted history. The new subagent gets a new ID and a new persistence directory, but starts with a copy of the old subagent's LLM messages and SSE transcript. From the frontend's point of view, this is still a normal new subagent dispatch.

## Goals

- Add a `resume_subagent` tool available to main agents that can resume a persisted subagent and continue with a new task.
- Keep the old subagent immutable during resume. All new messages, SSE events, and snapshots go to the new subagent directory.
- Copy both `snapshot.llmSession.messages` and the old subagent's persisted SSE events into the new subagent before continuing.
- Store subagent-specific metadata in a subagent sidecar file so resume can recover the correct subagent type without relying on LLM memory or transcript parsing.
- Update `dispatch_agent` tool results so the main agent receives the subagent ID and type for later reference.
- Reuse common path, construction, and run-forwarding logic between fresh dispatch and resume dispatch.
- Avoid frontend changes by emitting the existing `subagent-dispatch`, `subagent-output`, and `subagent-complete` events with the new subagent ID.

## Non-Goals

- Do not implement in-place subagent resume.
- Do not add a top-level API route or frontend page for subagent sessions.
- Do not add `runId` or change the frontend subagent event routing model.
- Do not introduce a long-lived `SubAgentStore` or subagent cache.
- Do not change the generic `AgentSnapshot` schema or `AgentPersistence.persistSnapshot()` metadata shape for subagent-only data.
- Do not backfill legacy #218 subagents that do not have subagent sidecar metadata.
- Do not support `CodingSubAgent` resume in this change; `dispatch_agent` currently supports regular `general` and `explore` subagents.

## Design Decisions

| Decision              | Choice                                                                               | Rationale                                                                                                    |
| --------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Resume semantics      | Expose resume semantics to the main agent; implement with a new subagent ID          | Avoids concurrent writes to old subagents and makes frontend behavior identical to a fresh dispatch.         |
| History copied        | Copy `llmSession.messages` and persisted SSE events                                  | LLM has conversation context, and the new subagent's own transcript can replay the old work plus new work.   |
| Subagent type         | Read from a subagent sidecar metadata file                                           | Keeps type as structured persisted state and avoids relying on LLM memory, SSE logs, or transcript parsing.  |
| Frontend protocol     | Reuse existing subagent SSE events                                                   | A resumed run appears as a new subagent card with a new `agentId`; no UI protocol change is needed.          |
| Old subagent mutation | Never mutate old subagent directory                                                  | Keeps resume repeatable and prevents races if the same old subagent is resumed multiple times.               |
| Common execution      | Extract shared run-forwarding helper                                                 | Fresh dispatch and resume both need the same subscribe/forward/summary/complete lifecycle.                   |
| Tool result           | Include `subagentId`, `agentType`, and `summary` in both structured data and content | The LLM sees tool `content`; explicit IDs reduce the chance that the main agent forgets how to resume later. |

## Storage Model

Subagents continue to live under the parent session, but each new subagent now gets a subagent-specific sidecar:

```text
$DATA_DIR/coding-sessions/<parent-agent-id>/
  snapshot.json
  metadata.json
  sse-events.jsonl
  subagents/
    <old-subagent-id>/
      snapshot.json
      metadata.json
      sse-events.jsonl
      subagent.json
    <new-subagent-id>/
      snapshot.json
      metadata.json
      sse-events.jsonl
      subagent.json
```

`metadata.json` remains the generic session-list metadata written by `AgentPersistence`. `subagent.json` is owned by the subagent tool layer and stores only subagent-specific control data, starting with the subagent type. The dispatch path that creates a subagent is responsible for writing this file before the subagent run is emitted or started.

```typescript
const subagentMetadataSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  agentType: agentTypeSchema,
  createdAt: z.number(),
  resumedFromSubagentId: z.string().optional(),
});

type SubagentMetadata = z.infer<typeof subagentMetadataSchema>;
```

`dispatch_agent` writes `subagent.json` after creating the subagent and before emitting `subagent-dispatch`. `resume_subagent` creates `<new-subagent-id>` under the same parent `subagents/` directory. It reads the old snapshot, old event log, and old `subagent.json`; creates a resumed snapshot with a new agent ID; writes the resumed snapshot, generic metadata, and new `subagent.json`; copies the old event log into the new directory; then starts a normal subagent turn in the new instance.

## Backend Design

### Tool Surface

Add a new `resume_subagent` tool to `SubAgentToolRegistry`.

Parameters:

```typescript
const parameters = z.object({
  subagentId: z.string().min(1).describe('The subagent ID to resume.'),
  task: z
    .string()
    .min(1)
    .describe('The follow-up task to continue the subagent.'),
  model: z
    .enum(['default', 'light'])
    .optional()
    .describe("Which model tier to use. Defaults to 'default'."),
});
```

`resume_subagent` does not accept `agentType`. It loads the source subagent's `subagent.json` and uses that structured metadata as the source of truth. If `subagent.json` is missing or invalid, resume fails instead of asking the LLM to reconstruct the type from memory.

The tool description should describe resume behavior only: continue a previous subagent from its persisted history. It must not mention that the implementation creates a new internal instance or uses copy-based history initialization. It should tell the main agent to use the returned `subagentId` for any later resume.

### Dispatch Result Shape

Change fresh dispatch results from summary-only to include the identity needed for future resume:

```typescript
interface DispatchAgentResult {
  subagentId: string;
  agentType: SubAgentType;
  summary: string;
}
```

`dispatch_agent` should return structured data with these fields and content that is explicit enough for the LLM history:

```text
Subagent completed.
id: <subagent-id>
type: <agent-type>

<summary>
```

Failure and aborted cases should still include the subagent ID and type in the content when a subagent was created. This gives the main agent enough information to inspect or resume later if the partial history was persisted.

`resume_subagent` should return the same result shape. The returned `subagentId` is the ID the main agent should use for any later resume.

### Path Helpers

Keep and reuse the current parent-scoped subagent directory helper:

```typescript
export function getSubagentSessionsDir(
  context: ToolExecutionContext,
): string | undefined {
  if (!context.sessionsDir) return undefined;
  return path.join(context.sessionsDir, context.agentId, 'subagents');
}
```

Add focused helpers in the subagent tool module or a sibling helper file:

```typescript
export function getSubagentSessionDir(
  subagentSessionsDir: string,
  subagentId: string,
): string {
  return path.join(subagentSessionsDir, subagentId);
}

export async function assertSubagentSnapshotExists(
  subagentSessionsDir: string,
  subagentId: string,
): Promise<void> {
  await access(agentPersistence.snapshotPath(subagentSessionsDir, subagentId));
}
```

Add subagent metadata helpers in the same module:

```typescript
export function subagentMetadataPath(
  subagentSessionsDir: string,
  subagentId: string,
): string {
  return path.join(subagentSessionsDir, subagentId, 'subagent.json');
}

export async function loadSubagentMetadata(
  subagentSessionsDir: string,
  subagentId: string,
): Promise<SubagentMetadata>;

export async function persistSubagentMetadata(
  subagentSessionsDir: string,
  subagentId: string,
  metadata: SubagentMetadata,
): Promise<void>;
```

These helpers are intentionally separate from `AgentPersistence`; `subagent.json` is subagent-tool control metadata, not a generic agent session concern. Fresh dispatch calls `persistSubagentMetadata()` directly after `createSubAgent()`. Resume preparation calls it when materializing the resumed subagent directory.

The resume tool should return a failure result when the parent has no `sessionsDir`, because there is no persisted subagent history to resume.

### Subagent Construction

Update regular subagent constructors to accept an optional `snapshot?: AgentSnapshot` and pass it to `super()`:

```typescript
export class GeneralSubAgent extends Agent {
  constructor(
    getConfig: () => Promise<LlmConfig>,
    workingDirectory: string,
    thinkingLevel: ThinkingLevel,
    sessionsDir?: string,
    snapshot?: AgentSnapshot,
  ) {
    super(
      getConfig,
      {
        toolRegistries: [
          CoreToolRegistry.getInstance(),
          FileToolRegistry.getInstance(),
          WebToolRegistry.getInstance(),
          BashToolRegistry.getInstance(),
        ],
        skillRegistries: [CoreSkillRegistry.getInstance()],
        baseSystemPrompt:
          'You are a helpful assistant working on a delegated subtask. ' +
          'After completing your task, provide a concise summary of what you did and the results.',
        getMaxToolRounds: async () => {
          const settings = await settingsService.getAll();
          return settings.agent.maxToolRounds;
        },
        thinkingLevel,
        workingDirectory,
        sessionsDir,
      },
      snapshot,
    );
  }
}
```

`ExploreSubAgent` receives the same shape. `createSubAgent()` should accept `snapshot?: AgentSnapshot` and pass it through.

### Internal Resumed Snapshot

Add an internal helper that creates a new `AgentSnapshot` from an old one:

```typescript
export function createResumedSubagentSnapshot(
  source: AgentSnapshot,
  newAgentId: string,
  newLlmSessionId: string,
): AgentSnapshot {
  return {
    ...source,
    id: newAgentId,
    llmSession: {
      ...source.llmSession,
      id: newLlmSessionId,
      messages: source.llmSession.messages,
    },
  };
}
```

The helper keeps the source title, options, and `sseEventCount` through `...source` because the old SSE transcript is copied completely. It also spreads `source.llmSession` before overriding the LLM session ID and messages, so future `LlmSessionSnapshot` fields are preserved. The copied messages do not need deep mutation after snapshot creation. The persisted JSON write and `LlmSession` constructor both copy data into their own objects.

### Copy SSE Events

Add a helper that copies valid historical SSE events from old subagent log to new subagent log:

```typescript
export async function copySubagentSseEvents(params: {
  sourceSessionsDir: string;
  sourceSnapshot: AgentSnapshot;
  targetSessionsDir: string;
  targetId: string;
}): Promise<void> {
  const sourcePath = agentPersistence.eventsPath(
    params.sourceSessionsDir,
    params.sourceSnapshot.id,
  );
  const targetPath = agentPersistence.eventsPath(
    params.targetSessionsDir,
    params.targetId,
  );
  // Read source JSONL, parse and validate lines with sseEventSchema,
  // stop at first invalid line or after sourceSnapshot.sseEventCount valid events,
  // write copied lines to target.
}
```

Use the same validation behavior as `AgentPersistence.reconcileEventsFile`: stop on corrupted lines and cap by `sourceSnapshot.sseEventCount`. The helper should treat `sourceSnapshot.sseEventCount` as the only count source and throw if it cannot copy exactly that many valid events.

Use the full `sseEventSchema`, not `sseBaseEventSchema`, when copying the child log. A subagent's own log may contain events like `session-title` that are valid in the child session transcript even though they are not valid inside the parent's `subagent-output` wrapper.

For a completed subagent, the copied event count should match `sourceSnapshot.sseEventCount`. If `sourceSnapshot.sseEventCount` is greater than zero and the source event file is missing or shorter, resume should fail rather than silently creating a transcript that cannot replay the old work. This keeps the internal resume contract precise: copied LLM history and copied visible transcript stay aligned.

### Internal Resume Preparation Flow

Add a helper that prepares the persisted state needed before the new subagent is constructed:

```typescript
export type PreparedResumedSubagentState = {
  snapshot: AgentSnapshot;
  metadata: SubagentMetadata;
  subagentSseEventStartIndex: number;
};

export async function prepareResumedSubagentState(params: {
  subagentSessionsDir: string;
  sourceSubagentId: string;
}): Promise<PreparedResumedSubagentState>;
```

Flow:

1. Load source snapshot with `agentPersistence.loadSnapshot(subagentSessionsDir, sourceSubagentId)`.
2. Load source subagent metadata with `loadSubagentMetadata(subagentSessionsDir, sourceSubagentId)`.
3. Generate a new subagent ID with `crypto.randomUUID()`.
4. Generate a new LLM session ID with `crypto.randomUUID()`.
5. Copy source SSE events into the new subagent event log; the helper validates against `sourceSnapshot.sseEventCount`.
6. Build resumed snapshot with `id = newSubagentId` and `llmSession.id = newLlmSessionId`; keep the source `sseEventCount`.
7. Persist resumed snapshot with `agentPersistence.persistSnapshot(subagentSessionsDir, newSubagentId, snapshot, {sync: true})`.
8. Persist new subagent metadata with the same `agentType`, new `id`, new `createdAt`, and `resumedFromSubagentId = sourceSubagentId`.
9. Return the resumed snapshot, resumed metadata, and `subagentSseEventStartIndex = sourceSnapshot.sseEventCount`.

`subagentSseEventStartIndex` is the inclusive raw-event index passed to the resumed subagent's SSE log reader. Since resume copies `sourceSnapshot.sseEventCount` historical events into the new subagent log before the run starts, subscribing from that index skips copied history and forwards only newly emitted events to the parent session.

Persisting the resumed snapshot before constructing the agent avoids relying on the base `Agent` constructor to write a snapshot when a snapshot is provided. The current base constructor intentionally skips initial persistence for restored snapshots.

### Shared Run Forwarding

Extract the duplicated lifecycle from `dispatch_agent` into a reusable helper:

```typescript
export async function runSubagentTurn(params: {
  subagent: Agent;
  task: string;
  agentType: SubAgentType;
  thinkingLevel: ThinkingLevel;
  workingDirectory: string;
  context: ToolExecutionContext;
  subagentSseEventStartIndex?: number;
}): Promise<ToolExecuteResult<DispatchAgentResult>>;
```

Behavior:

1. Attach parent abort signal to `subagent.abort()`.
2. Emit `subagent-dispatch` with the new subagent ID and provided metadata.
3. Subscribe with `subagent.subscribe({startIndex: subagentSseEventStartIndex, signal: context.signal})`.
4. Call `subagent.handleUserMessage(task)`.
5. Forward each new subagent event as `subagent-output`.
6. Accumulate the latest assistant text into `summary`.
7. Stop on `done`, emit `subagent-complete`, and return the shared result shape.

Fresh `dispatch_agent` calls this helper with no `subagentSseEventStartIndex`. `resume_subagent` calls it with `subagentSseEventStartIndex = sourceSnapshot.sseEventCount`, so old copied events are not forwarded into the parent session a second time.

Only events that satisfy `sseBaseEventSchema` should be wrapped and forwarded as `subagent-output`. Non-base events, such as `session-title`, remain in the subagent's own `sse-events.jsonl` and are not forwarded to the parent session because the parent SSE schema does not permit them inside `subagent-output`.

### resume_subagent Execution

`resume_subagent` should:

1. Validate `context.sessionsDir` exists; otherwise return failure because history is unavailable.
2. Compute `subagentSessionsDir = getSubagentSessionsDir(context)`.
3. Select `getConfig` from `model` like `dispatch_agent` does.
4. Prepare the persisted resume state with `prepareResumedSubagentState()`.
5. Use `snapshot.options.workingDirectory ?? context.workingDirectory` as the working directory.
6. Construct the new subagent using `metadata.agentType`, the resumed snapshot, and the same subagent sessions directory.
7. Run `runSubagentTurn()` with the returned `subagentSseEventStartIndex`.

The new subagent's emitted `subagent-dispatch` event should include the follow-up `task`, `metadata.agentType`, the resumed snapshot's thinking level, and the resumed snapshot's working directory.

### Fresh dispatch Execution

Fresh `dispatch_agent` should keep its current parameter shape. Internally it should:

1. Resolve and validate working directory as it does today.
2. Create a new subagent with `createSubAgent()`.
3. Persist `subagent.json` with the new subagent ID and resolved `agentType`.
4. Call `runSubagentTurn()` with no `subagentSseEventStartIndex`.

This keeps behavior unchanged except for the richer tool result content and structured data.

## User Experience

No frontend changes are required. A resumed subagent appears as a new subagent disclosure because it emits a new `agentId` through the existing `subagent-dispatch` event.

The main agent sees explicit tool output after every subagent run:

```text
Subagent completed.
id: <subagent-id>
type: explore

<summary>
```

For later follow-up work, the main agent should pass that ID into `resume_subagent`. The backend recovers the type from `subagent.json`.

## Error Handling

- If `context.sessionsDir` is `null`, `resume_subagent` returns failure: persisted subagent history is unavailable.
- If the source snapshot does not exist, return failure with the missing subagent ID.
- If the source `subagent.json` is missing or invalid, return failure because the backend cannot safely recover the subagent type.
- If the source event log is missing, corrupted before `snapshot.sseEventCount`, or contains fewer valid events than expected, return failure instead of creating a partial transcript copy.
- If the resumed subagent aborts or errors after internal copy creation, keep the new resumed directory. It contains the copied history plus any new partial events that were persisted before failure.

## Testing

### Unit Tests

Update `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.test.ts` or split helpers into `subagent-history.test.ts`:

- Assert `dispatch_agent` result data includes `subagentId`, `agentType`, and `summary`.
- Assert `dispatch_agent` result content includes the subagent ID and type.
- Assert fresh `dispatch_agent` persists `subagent.json` with the created subagent ID and resolved agent type.
- Assert `resume_subagent` parameter schema requires `subagentId` and `task`, and does not accept `agentType`.
- Assert `createSubAgent()` can construct `GeneralSubAgent` and `ExploreSubAgent` from a provided snapshot.
- Assert `prepareResumedSubagentState()` loads source `subagent.json` and writes new `subagent.json` with the same type and `resumedFromSubagentId`.
- Assert `createResumedSubagentSnapshot()` creates a new agent ID and LLM session ID while preserving messages, options, title, and source `sseEventCount`.
- Assert `copySubagentSseEvents()` copies exactly `sourceSnapshot.sseEventCount` valid events and writes the target JSONL.
- Assert `copySubagentSseEvents()` fails when the source event log is missing or too short.
- Assert `runSubagentTurn()` subscribes from the provided `subagentSseEventStartIndex` so copied history is not forwarded again.

### Integration-Oriented Tests Without Real LLM

Use a fake `Agent` or test-only subagent implementation when testing the shared runner:

- Seed fake subagent history with two old events, run with `subagentSseEventStartIndex: 2`, append new events, and assert only new events reach `context.onSubAgentEvent`.
- Verify a resumed run emits `subagent-dispatch` with the new subagent ID and the type loaded from source `subagent.json`.
- Verify `subagent-complete` is emitted once on success and once on failure paths.

### Verification Commands

Run targeted backend checks:

```bash
bun run --filter '@omnicraft/backend' test -- src/agent/tools/sub-agent/dispatch-agent-tool.test.ts
```

Run broader backend checks because this touches shared tool result schemas and agent construction:

```bash
bun run --filter '@omnicraft/backend' typecheck
bun run --filter '@omnicraft/backend' test
```

If `@omnicraft/tool-schemas` changes to include new structured result schemas, run package checks as well:

```bash
bun run --filter '@omnicraft/tool-schemas' typecheck
bun run --filter '@omnicraft/sse-events' typecheck
```

## Files Changed

| File                                                                   | Change                                                                                        |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `apps/backend/src/agent/agents/general-sub-agent/general-sub-agent.ts` | Accept optional `AgentSnapshot` for resumed construction.                                     |
| `apps/backend/src/agent/agents/explore-sub-agent/explore-sub-agent.ts` | Accept optional `AgentSnapshot` for resumed construction.                                     |
| `apps/backend/src/agent/tools/sub-agent/dispatch-agent-tool.ts`        | Return subagent ID/type, persist subagent sidecar metadata, call shared runner.               |
| `apps/backend/src/agent/tools/sub-agent/resume-subagent-tool.ts`       | Add `resume_subagent` tool.                                                                   |
| `apps/backend/src/agent/tools/sub-agent/subagent-history.ts`           | Add path, subagent metadata, event copy, resumed snapshot, and persisted resume helpers.      |
| `apps/backend/src/agent/tools/sub-agent/subagent-runner.ts`            | Add shared subagent run-forwarding helper.                                                    |
| `apps/backend/src/agent/tools/sub-agent/sub-agent-tool-registry.ts`    | Register `resume_subagent`.                                                                   |
| `apps/backend/src/agent/tools/sub-agent/index.ts`                      | Export `SubAgentToolRegistry` as today; helper exports stay internal to the sub-agent module. |
| `apps/backend/src/agent/tools/sub-agent/*.test.ts`                     | Cover richer dispatch results, resume helpers, resume parameters, and shared runner behavior. |

No frontend file changes are expected. No package-level tool schema changes are expected because `dispatch_agent` and `resume_subagent` suppress normal tool execution SSE cards and their structured result data is consumed by the backend agent loop.

## Risks

- Copying `sse-events.jsonl` makes resumed directories larger, especially for verbose subagents. This is accepted because the copied transcript is the feature's visible history.
- Existing #218 subagents created before `subagent.json` existed cannot be resumed safely unless they are redispatched under the new format. This is accepted to keep resume deterministic and avoid brittle inference from LLM history or SSE logs.
- If a source subagent completed with a valid snapshot but a damaged event log, resume fails even though LLM messages are available. This is intentional because the resume contract includes visible transcript continuity.
- Refactoring dispatch into shared helpers can accidentally change fresh dispatch behavior. Tests should compare event ordering and result content for fresh dispatch.

## Success Criteria

- Fresh `dispatch_agent` still appears unchanged in the frontend and now returns `subagentId`, `agentType`, and `summary` to the main agent.
- Fresh `dispatch_agent` writes `subagent.json` so the backend can recover the type during later resume.
- `resume_subagent` resumes an existing persisted subagent into a new subagent directory with a new ID.
- `resume_subagent` does not require the main agent to supply `agentType`; it reads the type from source `subagent.json`.
- The resumed snapshot contains copied LLM messages and preserves the source event count matching the copied SSE transcript.
- The new subagent continues from the copied history and persists new messages/events in the new directory.
- The parent session receives only the resumed run's new subagent output, not duplicated historical output.
- No frontend protocol or rendering changes are needed.
