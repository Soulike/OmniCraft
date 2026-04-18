# Todo Tool Design

## Overview

Add ephemeral, agent-facing todo tools for tracking work progress within a single
session. The agent uses these to break down complex tasks, communicate progress to the
user, and self-organize multi-step work.

Todos are in-memory only, scoped to an agent instance, and discarded when the session
ends.

## Data Model

```typescript
interface TodoItem {
  index: number; // 0-based array position, maps directly to items[index]
  subject: string; // brief task title
  description: string; // what needs to be done
  status: 'pending' | 'in_progress' | 'completed';
}
```

Three statuses: `pending` → `in_progress` → `completed`. No `blocked` or `deleted`
states.

## State Management

### TodoStore (pure data container)

A `TodoStore` class holds the in-memory todo list. One instance per `Agent`, passed into
`ToolExecutionContext` — the same pattern as `shellState`, `fileCache`, and
`fileStatTracker`.

```
agent-core/agent/todo-store.ts
```

Public interface:

- `append(subject: string, description: string): void` — appends a new item with
  `status: 'pending'` to the end of the list
- `update(index: number, fields: TodoUpdateFields): void` — updates an existing item
- `clear(): void` — clears all items
- `list(): TodoItem[]` — returns a snapshot of all items
- `version` (readonly getter) — incremented on every mutation

Internal state:

- `items: TodoItem[]` — ordered by creation, accessed directly by index (`items[index]`)
- `_version: number` — starts at 0, incremented on every mutation

The store has no knowledge of observation policy. It is a pure data container.

### TodoState (observation tracking)

A `TodoState` interface on `ToolExecutionContext` tracks what version the agent last
observed. This is mutable state owned by the agent context, following the `ShellState`
pattern.

```typescript
interface TodoState {
  lastObservedVersion: number | undefined;
}
```

### Version Tracking (tool-layer policy)

The staleness check is implemented in the tool layer via helpers in
`apps/backend/src/agent/tools/todo/helpers.ts`:

- `checkStale(store, state)` — returns an error message if
  `state.lastObservedVersion` is undefined or doesn't match `store.version`, or `null`
  if up to date.
- `markObserved(store, state)` — sets `state.lastObservedVersion = store.version`.

Tools call `checkStale` before `todo_update` and `todo_clear`. All four tools call
`markObserved` after returning the list to the agent.

### Wiring

- `ToolExecutionContext` (in `agent-core/tool/types.ts`): add `readonly todoStore: TodoStore`
  and `readonly todoState: TodoState`
- `Agent` (in `agent-core/agent/agent.ts`): instantiate `TodoStore` and `TodoState`,
  pass both into the context

## Tools

Four separate tools, following the `dispatch_agent` pattern — schemas defined locally in
the backend, not in the shared `@omnicraft/tool-schemas` package (since these tools
suppress SSE events and have no frontend consumer).

### `todo_append`

- **Parameters**: `{ subject: string, description: string }`
- **Result**: `{ items: TodoItem[] }` (full list after append)
- **Behavior**: Appends a new todo with `status: 'pending'` to the end of the list.
  Calls `store.append()`, then `store.list()`, then `markObserved()`.
- **`suppressToolEvents`**: `true`

### `todo_update`

- **Parameters**: `{ index: number, subject?: string, description?: string, status?: 'pending' | 'in_progress' | 'completed' }`
- **Result**: `{ items: TodoItem[] }` (full list after update)
- **Behavior**: Checks staleness first. Updates specified fields on an existing item.
  Fails if stale or if index is out of bounds.
- **`suppressToolEvents`**: `true`

### `todo_clear`

- **Parameters**: `{}` (no params)
- **Result**: `{ items: TodoItem[] }` (empty list)
- **Behavior**: Checks staleness first. Clears the entire todo list. The agent can then
  create a fresh set of items.
- **`suppressToolEvents`**: `true`

### `todo_list`

- **Parameters**: `{}` (no params)
- **Result**: `{ items: TodoItem[] }` (all items)
- **Behavior**: Returns all items regardless of status. Marks state as observed.
- **`suppressToolEvents`**: `true`

All four tools suppress SSE events since there is no frontend UI for todos yet. The
results are still submitted to the LLM. When a frontend todo UI is built, this can be
flipped to `false`.

## File Layout

### `apps/backend/src/agent-core/`

| File                  | Changes                                                           |
| --------------------- | ----------------------------------------------------------------- |
| `agent/todo-store.ts` | New file: `TodoStore` class (pure data container)                 |
| `agent/index.ts`      | Re-export `TodoStore`                                             |
| `tool/types.ts`       | Add `TodoState` interface, `todoStore` and `todoState` to context |
| `tool/testing.ts`     | Add `TodoStore` and `TodoState` to `createMockContext`            |
| `agent/agent.ts`      | Instantiate `TodoStore` and `TodoState`, pass into context        |

### `apps/backend/src/agent/tools/todo/`

| File                    | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
| `schemas.ts`            | Local Zod schemas for parameters and results                |
| `helpers.ts`            | `formatTodoContent`, `checkStale`, `markObserved`           |
| `todo-append.ts`        | `todo_append` tool definition                               |
| `todo-update.ts`        | `todo_update` tool definition                               |
| `todo-clear.ts`         | `todo_clear` tool definition                                |
| `todo-list.ts`          | `todo_list` tool definition                                 |
| `todo-tool-registry.ts` | `TodoToolRegistry extends ToolRegistry`, registers all four |
| `index.ts`              | Re-exports                                                  |

### `apps/backend/src/agent/`

| File                              | Changes                                                  |
| --------------------------------- | -------------------------------------------------------- |
| `tools/index.ts`                  | Re-export `TodoToolRegistry`                             |
| `agents/main-agent/main-agent.ts` | Add `TodoToolRegistry.getInstance()` to `toolRegistries` |

## Content String Format

The `content` string returned to the LLM (the human-readable representation) should be a
concise formatted list:

```
Todo List (2/5 completed):
[completed] #0: Set up project structure - Initial scaffolding
[in_progress] #1: Implement authentication - Add JWT-based auth
[pending] #2: Add unit tests - Cover all endpoints
[pending] #3: Write API docs - OpenAPI spec
[completed] #4: Configure CI - GitHub Actions workflow
```

This gives the LLM a quick scannable view of progress.

## Out of Scope

- Frontend UI for todo display (separate task)
- Persistence across sessions (todos are ephemeral)
- Task dependencies / blocking relationships
- Per-item delete (use `todo_clear` to reset, then recreate)
- Subagent todo sharing (each agent has its own store)
