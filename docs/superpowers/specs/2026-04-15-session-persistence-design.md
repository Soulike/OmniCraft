# Session Persistence Design

Phase 4 of the session storage & restore plan ([#129](https://github.com/Soulike/OmniCraft/issues/129)). Adds disk-backed persistence so sessions survive server restarts.

## Storage Layout

```
$DATA_DIR/sessions/<uuid>/
  snapshot.json     # AgentSnapshot — atomic write (write .tmp + rename)
  sse-events.jsonl      # One SseEvent JSON per line — append-only
```

`$DATA_DIR` defaults to `~/.omni-craft` (from `getDataDir()`). The `sessionsDir` is `$DATA_DIR/sessions`, computed in `initServices()` and passed to `AgentStore.create()`. From there it flows to `chatService` (for new agent creation) and `restoreAgent` (for lazy loading).

## 1. AgentSseLog File Persistence

### Constructor Change

Accepts optional `filePath?: string`. With filePath: file-backed mode. Without: pure in-memory (sub-agents, unchanged behavior).

No I/O during construction.

### Three-State Model

| State           | Condition                               | `append()` behavior                                  |
| --------------- | --------------------------------------- | ---------------------------------------------------- |
| Cold (unloaded) | `activeReaderCount === 0`, has filePath | mutex -> appendFile -> done                          |
| Hot (loaded)    | `activeReaderCount > 0`, has filePath   | mutex -> appendFile -> push array -> notify waiters  |
| In-memory       | no filePath                             | push array -> notify waiters (sync, same as current) |

### Method Changes

- `append(event)` becomes `async append(event)`. File-backed: acquires mutex, writes to file first. If loaded, also pushes to in-memory array and notifies waiters. If appendFile fails, error propagates to caller (stops agent).
- New `ensureLoaded()`: private async. Acquires mutex, reads entire file line-by-line into array. If last line is malformed JSON, discards it and rewrites the file to clean state.
- New `unload()`: private. Clears in-memory array and waiters.
- `createReader()`: increments `activeReaderCount`. First reader (0 -> 1) triggers `ensureLoaded()`.
- Reader iterator `finally` block: decrements `activeReaderCount`. Last reader (1 -> 0) triggers `unload()`.
- New `get activeReaderCount`: public getter for eviction checks.

### Pure In-Memory Mode

No filePath: `append` is still `async` (same signature), but skips file I/O — just pushes to array and notifies. Overhead of an immediately-resolving async function is negligible. Sub-agents unaffected.

### Directory Creation

Each file write (`append`, `persistSnapshot`) calls `mkdir(dir, {recursive: true})` before writing. Idempotent.

## 2. Agent Snapshot Persistence

### AgentOptions Change

New optional field: `sessionsDir?: string`. When present, Agent has persistence capability.

### Path Helpers

Two private static methods on Agent centralize path construction:

```typescript
private static snapshotPath(sessionsDir: string, id: string): string {
  return path.join(sessionsDir, id, 'snapshot.json');
}

private static eventsPath(sessionsDir: string, id: string): string {
  return path.join(sessionsDir, id, 'sse-events.jsonl');
}
```

### AgentSseLog Construction

Currently `sseLog` is a field initializer (`readonly sseLog = new AgentSseLog()`), which runs before the constructor body. Move construction into the constructor body, after `this.id` is assigned:

```typescript
this.sseLog = sessionsDir
  ? new AgentSseLog(Agent.eventsPath(sessionsDir, this.id))
  : new AgentSseLog();
```

### Snapshot Write Timing

| Event           | Action                                                      |
| --------------- | ----------------------------------------------------------- |
| Each SSE event  | Written to `sse-events.jsonl` (inside `AgentSseLog.append`) |
| `done`          | Write `snapshot.json`                                       |
| `session-title` | Write `snapshot.json`                                       |

`pump()` onEvent callback triggers `persistSnapshot()` on these events.

### persistSnapshot()

Private async method. Atomic write: serialize to `.tmp`, then `rename` to `snapshot.json` (same pattern as `SettingsManager.save()`). Calls `mkdir({recursive: true})` before writing.

### AgentSnapshotOptions Extension

`extraAllowedPaths` added to `AgentSnapshotOptions` so restored agents retain path permissions.

### isRunning Getter

```typescript
get isRunning(): boolean {
  return this.abortController !== null || this.isGeneratingTitle;
}
```

Includes `isGeneratingTitle` because title generation runs fire-and-forget after `done`, appends events and writes snapshot. Evicting during title generation could cause data loss.

### Constructor Change

`snapshot` becomes a standalone optional parameter on the constructor (for restore only). `sessionsDir` is in `AgentOptions` (controls whether persistence is enabled, used by both new and restored agents).

```typescript
constructor(
  getConfig: () => Promise<LlmConfig>,
  options: AgentOptions,  // sessionsDir?: string is here
  snapshot?: AgentSnapshot,
)
```

## 3. Agent.loadSnapshotFromDisk and MainAgent.restore

### Agent.loadSnapshotFromDisk

```typescript
protected static async loadSnapshotFromDisk(
  sessionsDir: string,
  id: string,
): Promise<AgentSnapshot>
```

Reads `snapshot.json` and returns the parsed `AgentSnapshot`. Nothing else.

### Agent.reconcileEventsFile

```typescript
protected static async reconcileEventsFile(
  sessionsDir: string,
  id: string,
): Promise<void>
```

Ensures `sse-events.jsonl` is consistent with the last completed turn:

1. Read `sse-events.jsonl` line by line
2. If last line is malformed JSON, discard it
3. Find last `done` event
4. If events exist after last `done` (interrupted turn): truncate file to last `done` line (inclusive), rewrite file
5. If no `done` event exists (first turn crashed): clear the file

### MainAgent.restore

```typescript
static async restore(
  getConfig: () => Promise<LlmConfig>,
  sessionsDir: string,
  id: string,
): Promise<MainAgent>
```

1. Calls `Agent.loadSnapshotFromDisk(sessionsDir, id)` to get snapshot
2. Calls `Agent.reconcileEventsFile(sessionsDir, id)` to clean up events
3. Constructs `new MainAgent(getConfig, ..., snapshot, sessionsDir)` using snapshot's `workingDirectory` and `extraAllowedPaths`, plus its own registries

## 4. AgentStore Async + Lazy Loading + LRU Eviction

### Interface Changes

| Method       | Before               | After                         |
| ------------ | -------------------- | ----------------------------- |
| `get(id)`    | `Agent \| undefined` | `Promise<Agent \| undefined>` |
| `has(id)`    | `boolean`            | `Promise<boolean>`            |
| `delete(id)` | `boolean`            | `Promise<boolean>`            |
| `set(agent)` | unchanged            | unchanged                     |

### Constructor Change

`AgentStore.create()` accepts `sessionsDir` and a `restoreAgent` factory function (`(sessionsDir: string, id: string) => Promise<Agent>`). AgentStore does not depend on MainAgent directly.

### Lazy Loading (get)

1. Memory hit -> update `lastAccessedAt`, return
2. Memory miss -> check `$sessionsDir/$id/` directory exists on disk
3. Directory exists -> call `restoreAgent(sessionsDir, id)`, cache in memory, return
4. Directory missing -> return `undefined`

Concurrent dedup via `loadingPromises: Map<string, Promise<Agent>>`. Removed after load completes.

### has

Memory hit -> true. Memory miss -> check disk directory existence. Does not trigger loading.

### delete

Removes from memory AND deletes disk files (`rm -r $sessionsDir/$id/`). Returns `Promise<boolean>`.

### LRU Eviction

- Each cache entry tracks `lastAccessedAt` (updated on every `get` hit)
- `MAX_CACHED_AGENTS = 50`
- On `set` or `get` (when adding new agent to memory): if over limit, evict oldest entry where `isRunning === false && activeReaderCount === 0`
- Eviction removes from memory only (except `delete`, which also removes disk files)

## 5. Async Propagation

AgentStore's async interface propagates to callers:

### chat-service.ts

All methods that call `AgentStore.get()` or `AgentStore.delete()` become async:

- `sendCompletion` -> async
- `subscribe` -> async
- `abortCompletion` -> async
- `submitToolResponse` -> async
- `deleteSession` -> async

### router.ts

Route handlers are already async (Koa). Add `await` on chatService calls. No logic changes.

## 6. Tests

### AgentSseLog File Persistence

- File-backed append: file content is correct line-by-line JSON
- Cold append: no reader -> only writes file, not memory
- Hot append: with reader -> file and memory in sync
- ensureLoaded: loads file into memory, reader can read historical events
- unload: last reader leaves -> memory released, subsequent append only writes file
- Corrupted last line: ensureLoaded discards and rewrites file
- Pure in-memory mode: no filePath -> unchanged behavior (existing tests remain)

### Agent Snapshot Persistence

- `done` event triggers snapshot.json write with correct content
- `session-title` event updates snapshot.json
- Snapshot includes `extraAllowedPaths`
- Atomic write: crash leaves no corrupted snapshot.json (.tmp pattern)

### Agent.loadSnapshotFromDisk

- Normal snapshot read and parse

### Agent.reconcileEventsFile

- Truncates sse-events.jsonl to last `done` event
- No `done` event -> events file cleared
- Corrupted last line -> discard then truncate

### AgentStore

- Lazy loading: memory miss -> disk load -> cache
- Concurrent dedup: parallel `get` for same id triggers single restore
- LRU eviction: over 50 evicts oldest inactive agent
- Eviction skips `isRunning` and `activeReaderCount > 0` agents
- `delete` removes memory and disk files
- `has` checks disk without triggering load
