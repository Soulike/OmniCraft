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

### TodoStore

A `TodoStore` class holds the in-memory todo list. One instance per `Agent`, passed into
`ToolExecutionContext` — the same pattern as `shellState`, `fileCache`, and
`fileStatTracker`.

```
agent-core/agent/todo-store.ts
```

Public interface:

- `append(subject: string, description: string): TodoItem[]` — appends a new item with
  `status: 'pending'` to the end of the list, returns full list
- `update(index: number, fields: { subject?: string, description?: string, status?: TodoStatus }): TodoItem[]` — updates an existing item, returns full list
- `clear(): TodoItem[]` — clears all items, returns empty list
- `list(): TodoItem[]` — returns all items

Internal state:

- `items: TodoItem[]` — ordered by creation, accessed directly by index (`items[index]`)
- `version: number` — starts at 0, incremented on every mutation
- `lastObservedVersion: number | undefined` — updated when the agent "sees" the list

### Version Tracking (Safety)

Follows the `FileStatTracker` pattern to prevent blind edits:

- Every mutation (`append`, `update`, `clear`) increments `version`.
- Every operation (`append`, `update`, `clear`, `list`) sets `lastObservedVersion = version`
  after completing (since all return the full list).
- `update()` and `clear()` check `lastObservedVersion === version` before applying changes.
  If the agent has never called any todo tool (`lastObservedVersion` is `undefined`), the
  operation fails with a message instructing the agent to call `todo_list` first.

In practice, the only failure case is calling `todo_update` or `todo_clear` as the very
first todo operation, since every tool call returns the full list and refreshes the
observed version.

### Wiring

- `ToolExecutionContext` (in `agent-core/tool/types.ts`): add `readonly todoStore: TodoStore`
- `Agent` (in `agent-core/agent/agent.ts`): instantiate `TodoStore` in the constructor,
  pass it into the context alongside existing state objects

## Tools

Four separate tools, following the existing multi-tool-per-action convention.

### `todo_append`

- **Parameters**: `{ subject: string, description: string }`
- **Result**: `{ items: TodoItem[] }` (full list after append)
- **Behavior**: Appends a new todo with `status: 'pending'` to the end of the list
- **`suppressToolEvents`**: `true`

### `todo_update`

- **Parameters**: `{ index: number, subject?: string, description?: string, status?: 'pending' | 'in_progress' | 'completed' }`
- **Result**: `{ items: TodoItem[] }` (full list after update)
- **Behavior**: Updates specified fields on an existing item. Fails if index is out of
  bounds or if the agent hasn't seen the list yet (version check).
- **`suppressToolEvents`**: `true`

### `todo_clear`

- **Parameters**: `{}` (no params)
- **Result**: `{ items: TodoItem[] }` (empty list)
- **Behavior**: Clears the entire todo list. The agent can then create a fresh set of
  items. Requires the agent to have seen the list first (version check).
- **`suppressToolEvents`**: `true`

### `todo_list`

- **Parameters**: `{}` (no params)
- **Result**: `{ items: TodoItem[] }` (all items)
- **Behavior**: Returns all items regardless of status
- **`suppressToolEvents`**: `true`

All four tools suppress SSE events since there is no frontend UI for todos yet. The
results are still submitted to the LLM. When a frontend todo UI is built, this can be
flipped to `false`.

## File Layout

### `packages/tool-schemas/`

| File                   | Changes                                                                                                                 |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `tool-name.ts`         | Add `TODO_APPEND`, `TODO_UPDATE`, `TODO_CLEAR`, `TODO_LIST` constants and to `toolNameSchema`                           |
| `parameter-schemas.ts` | Add `todoAppendParametersSchema`, `todoUpdateParametersSchema`, `todoClearParametersSchema`, `todoListParametersSchema` |
| `result-schemas.ts`    | Add `todoItemSchema`, `todoResultSchema` (shared by all four tools)                                                     |
| `registry.ts`          | Add entries for all four tools in `toolResultSchemas` and `toolResultDataSchema`                                        |
| `index.ts`             | Re-export new schemas                                                                                                   |

### `apps/backend/src/agent-core/`

| File                  | Changes                                              |
| --------------------- | ---------------------------------------------------- |
| `agent/todo-store.ts` | New file: `TodoStore` class                          |
| `agent/index.ts`      | Re-export `TodoStore`                                |
| `tool/types.ts`       | Add `todoStore: TodoStore` to `ToolExecutionContext` |
| `agent/agent.ts`      | Instantiate `TodoStore`, pass into context           |

### `apps/backend/src/agent/tools/todo/`

| File                    | Description                                                 |
| ----------------------- | ----------------------------------------------------------- |
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
[completed] #0: Set up project structure
[in_progress] #1: Implement authentication
[pending] #2: Add unit tests
[pending] #3: Write API docs
[completed] #4: Configure CI
```

This gives the LLM a quick scannable view of progress.

## Out of Scope

- Frontend UI for todo display (separate task)
- Persistence across sessions (todos are ephemeral)
- Task dependencies / blocking relationships
- Per-item delete (use `todo_clear` to reset, then recreate)
- Subagent todo sharing (each agent has its own store)
