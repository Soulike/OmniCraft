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
  id: string; // auto-incremented ("1", "2", "3", ...)
  subject: string; // brief task title
  description: string; // what needs to be done
  status: 'pending' | 'in_progress' | 'completed';
}
```

Three statuses: `pending` → `in_progress` → `completed`. No `blocked` or `deleted`
states.

## State Management

### TodoStore

A `TodoStore` class holds the in-memory todo list. One instance per `Agent`, passed into
`ToolExecutionContext` — the same pattern as `shellState`, `fileCache`, and
`fileStatTracker`.

```
agent-core/agent/todo-store.ts
```

Public interface:

- `create(subject: string, description: string): TodoItem[]` — creates a new item with
  `status: 'pending'`, returns full list
- `update(id: string, fields: { subject?: string, description?: string, status?: TodoStatus }): TodoItem[]` — updates an existing item, returns full list
- `list(): TodoItem[]` — returns all items

Internal state:

- `items: Map<string, TodoItem>` — keyed by ID
- `nextId: number` — starts at 1, auto-increments
- `version: number` — starts at 0, incremented on every mutation
- `lastObservedVersion: number | undefined` — updated when the agent "sees" the list

### Version Tracking (Safety)

Follows the `FileStatTracker` pattern to prevent blind edits:

- Every mutation (`create`, `update`) increments `version`.
- Every operation (`create`, `update`, `list`) sets `lastObservedVersion = version` after
  completing (since all return the full list).
- `update()` checks `lastObservedVersion === version` before applying changes. If the
  agent has never called any todo tool (`lastObservedVersion` is `undefined`), the update
  fails with a message instructing the agent to call `todo_list` first.

In practice, the only failure case is calling `todo_update` as the very first todo
operation, since every tool call returns the full list and refreshes the observed version.

### Wiring

- `ToolExecutionContext` (in `agent-core/tool/types.ts`): add `readonly todoStore: TodoStore`
- `Agent` (in `agent-core/agent/agent.ts`): instantiate `TodoStore` in the constructor,
  pass it into the context alongside existing state objects

## Tools

Three separate tools, following the existing multi-tool-per-action convention.

### `todo_create`

- **Parameters**: `{ subject: string, description: string }`
- **Result**: `{ items: TodoItem[] }` (full list after creation)
- **Behavior**: Creates a new todo with `status: 'pending'`, auto-assigns incrementing ID
- **`suppressToolEvents`**: `true`

### `todo_update`

- **Parameters**: `{ id: string, subject?: string, description?: string, status?: 'pending' | 'in_progress' | 'completed' }`
- **Result**: `{ items: TodoItem[] }` (full list after update)
- **Behavior**: Updates specified fields on an existing item. Fails if ID not found or if
  the agent hasn't seen the list yet (version check).
- **`suppressToolEvents`**: `true`

### `todo_list`

- **Parameters**: `{}` (no params)
- **Result**: `{ items: TodoItem[] }` (all items)
- **Behavior**: Returns all items regardless of status
- **`suppressToolEvents`**: `true`

All three tools suppress SSE events since there is no frontend UI for todos yet. The
results are still submitted to the LLM. When a frontend todo UI is built, this can be
flipped to `false`.

## File Layout

### `packages/tool-schemas/`

| File                   | Changes                                                                                    |
| ---------------------- | ------------------------------------------------------------------------------------------ |
| `tool-name.ts`         | Add `TODO_CREATE`, `TODO_UPDATE`, `TODO_LIST` constants and to `toolNameSchema`            |
| `parameter-schemas.ts` | Add `todoCreateParametersSchema`, `todoUpdateParametersSchema`, `todoListParametersSchema` |
| `result-schemas.ts`    | Add `todoItemSchema`, `todoResultSchema` (shared by all three tools)                       |
| `registry.ts`          | Add entries for all three tools in `toolResultSchemas` and `toolResultDataSchema`          |
| `index.ts`             | Re-export new schemas                                                                      |

### `apps/backend/src/agent-core/`

| File                  | Changes                                              |
| --------------------- | ---------------------------------------------------- |
| `agent/todo-store.ts` | New file: `TodoStore` class                          |
| `agent/index.ts`      | Re-export `TodoStore`                                |
| `tool/types.ts`       | Add `todoStore: TodoStore` to `ToolExecutionContext` |
| `agent/agent.ts`      | Instantiate `TodoStore`, pass into context           |

### `apps/backend/src/agent/tools/todo/`

| File                    | Description                                                  |
| ----------------------- | ------------------------------------------------------------ |
| `todo-create.ts`        | `todo_create` tool definition                                |
| `todo-update.ts`        | `todo_update` tool definition                                |
| `todo-list.ts`          | `todo_list` tool definition                                  |
| `todo-tool-registry.ts` | `TodoToolRegistry extends ToolRegistry`, registers all three |
| `index.ts`              | Re-exports                                                   |

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
[completed] #1: Set up project structure
[in_progress] #2: Implement authentication
[pending] #3: Add unit tests
[pending] #4: Write API docs
[completed] #5: Configure CI
```

This gives the LLM a quick scannable view of progress.

## Out of Scope

- Frontend UI for todo display (separate task)
- Persistence across sessions (todos are ephemeral)
- Task dependencies / blocking relationships
- Delete operation (use `completed` status instead)
- Subagent todo sharing (each agent has its own store)
