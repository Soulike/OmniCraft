# Live Subagent Registry

## Problem

The current `SubagentRegistry` persists `{id, agentType}` records in the parent
agent snapshot. `list_agents` then uses that durable registry and persisted
subagent metadata to list old subagents.

That model only makes sense if subagents can be restored from disk. For the
first continuation feature, we are choosing a narrower model: a subagent can be
resumed only while its `Agent` instance is still alive in the current backend
process. If the instance is gone, the caller should create a new subagent.

Under this model, listing persisted-but-unavailable subagents is misleading.
The registry should represent live subagents that can actually be resumed,
not historical ownership records.

## Goals

- Redefine `SubagentRegistry` as an in-memory, parent-scoped registry of live
  subagent `Agent` instances.
- Stop persisting subagent registry records in parent `AgentSnapshot` objects.
- Keep only a bounded number of recently used live subagents per parent agent.
- Let tools list only subagents that are still available to resume.
- Let future continuation logic reject a live subagent that is already running.
- Keep persisted subagent snapshots and SSE logs as a side effect of dispatch,
  but do not use them for listing or continuation in this phase.
- Rename user-facing tools so their names match the live-only semantics.

## Non-Goals

- Do not restore subagents from disk.
- Do not add `GeneralSubAgent.restore()` or `ExploreSubAgent.restore()`.
- Do not keep a process-global subagent cache keyed by parent id.
- Do not preserve compatibility for old parent snapshots that contain
  `subagents` records.
- Do not expose cache or persistence implementation details in tool names.

## Selected Design

`SubagentRegistry` remains owned by each parent `Agent` instance, but its
contents change from durable metadata to live runtime records.

The registry stores the subagent instance, its type, and access metadata:

```typescript
interface LiveSubagentRegistryEntry {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
  lastAccessedAt: number;
}
```

The parent `Agent` constructs a fresh empty registry when it is created or
restored. The registry is not included in `Agent.toSnapshot()`.

Because the registry is parent-owned, lookup does not need the parent id. The
parent session boundary is already represented by the `Agent` instance that owns
the registry.

## Registry API

The registry API should be small and live-focused:

```typescript
export interface LiveSubagentRecord {
  readonly id: string;
  readonly agentType: SubAgentType;
  readonly title: string;
  readonly isRunning: boolean;
}

export interface LiveSubagentHandle {
  readonly agent: Agent;
  readonly agentType: SubAgentType;
}

export class SubagentRegistry {
  constructor(options?: {maxEntries?: number});

  register(agent: Agent, agentType: SubAgentType): void;
  get(id: string): LiveSubagentHandle | undefined;
  list(): LiveSubagentRecord[];
  clear(): void;
}
```

`register()` is called by `dispatch_agent` after a subagent is created. It
inserts or replaces the live entry and updates access time.

`get()` returns the live `Agent` instance and type when the entry is still in
memory. It updates access time so resumed subagents stay recent. If no entry
exists, it returns `undefined`. It does not read disk.

`list()` returns only currently registered live entries. The title comes from
`agent.title`, not from `metadata.json` or `snapshot.json`. `isRunning` comes
from `agent.isRunning`.

`clear()` is for tests and parent lifecycle cleanup if needed.

## LRU Limit

The registry should bound retained live subagents with a small per-parent LRU
limit, for example:

```typescript
const DEFAULT_MAX_LIVE_SUBAGENTS = 10;
```

Eviction runs after `register()` and after `get()` updates access time.

An entry is evictable only when both are true:

- `entry.agent.isRunning === false`
- `entry.agent.sseLog.activeReaderCount === 0`

The registry may temporarily exceed the limit if every entry is running or has
active SSE readers. It must never abort, close, or drop a running subagent just
to satisfy capacity.

## Snapshot Changes

`AgentSnapshot` should stop storing `subagents`.

`Agent.toSnapshot()` should no longer include the registry. Restoring a parent
agent creates an empty `SubagentRegistry`, so old subagents from previous
process lifetimes are not listed and cannot be resumed.

This intentionally narrows the feature: persisted subagent files may still exist
under `<parent session>/<parent id>/subagents/<subagent id>/`, but they are not
part of the live tool contract.

## Tool Naming

The current durable names should be replaced with live-only names:

- `list_agents` becomes `list_resumable_agents`.
- The future resume tool should be named `resume_agent`.

The tool surface should use `resume`/`resumable` language. The live-only cache
is an implementation detail; callers only need to know which subagents can be
resumed.

## `list_resumable_agents`

`list_resumable_agents` reads only `context.subagentRegistry.list()`.

The tool output should include enough information for the caller to pick a
subagent to resume:

- `id`
- `agentType`
- `title`
- `isRunning`

It should not read subagent metadata or snapshots. If the registry is empty, it
returns a normal empty-list message.

## Future `resume_agent`

The future continuation tool should use `context.subagentRegistry.get(id)`.

If no handle exists, return a normal tool failure explaining that the subagent is
no longer live and a new subagent should be dispatched.

If `handle.agent.isRunning` is true, return a busy failure asking the caller to
wait.

If the handle exists and is idle, send the new message to the same live
subagent, stream nested subagent events through the parent, and return the new
assistant summary.

The first version does not need a disk restore path. It can add a small internal
claim/release guard only if tests show two concurrent continuation calls can
start work on the same idle subagent before `isRunning` flips.

## Dispatch Integration

`dispatch_agent` should call:

```typescript
context.subagentRegistry.register(subagent, agentType);
```

after creating the subagent.

Subagent persistence can remain unchanged: if a parent has a `sessionsDir`, the
subagent still receives its subagent sessions directory and persists its own
snapshot/events. That persistence is no longer advertised as a continuation
source.

## Testing

Add or update registry tests:

- `register()` stores a live subagent and `get()` returns it.
- `list()` returns id, type, title, and running state from the live instance.
- `get()` updates recency.
- LRU eviction removes the least recently accessed idle entry.
- LRU eviction does not remove running entries.
- LRU eviction does not remove entries with active SSE readers.
- `clear()` removes live entries.

Update agent snapshot tests:

- `Agent.toSnapshot()` does not include live subagents.
- Restoring an agent starts with an empty `SubagentRegistry`.

Update dispatch/list tool tests:

- `dispatch_agent` registers the created live subagent.
- `list_resumable_agents` lists only the registry contents.
- `list_resumable_agents` does not read metadata or snapshots.
- The old `list_agents` tool name is removed from the subagent tool registry.

## Open Decisions

No product decisions remain for the live registry. `resume_agent` still
needs its own spec for parameters, streaming behavior, and frontend event
handling.
