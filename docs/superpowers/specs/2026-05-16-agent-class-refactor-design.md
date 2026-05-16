# Agent Class Refactor

## Problem

`Agent` has grown into a large class that owns several different
responsibilities:

- agent identity, title, snapshot, and public session API;
- working-directory creation and validation;
- turn serialization and abort lifecycle;
- SSE event logging and event-count tracking;
- LLM stream consumption and SSE translation;
- the agent loop, including tool-round handling and max-round termination;
- tool execution and tool-output event wiring;
- mutable per-agent tool state such as file caches, shell cwd, user interactions,
  and todos;
- usage reporting and after-turn compaction coordination;
- asynchronous title generation.

The behavior is cohesive at the product level, but the implementation is too
large for one file. Future changes to tools, streaming, context compaction, or
session lifecycle are likely to expand `Agent` further unless the internal
responsibilities are separated.

## Goals

- Reduce the size and responsibility count of
  `apps/backend/src/agent-core/agent/agent.ts`.
- Preserve the public `Agent` API used by concrete agents, stores, routes, and
  tests.
- Preserve snapshot shape and restore compatibility.
- Use stateless singleton service classes for extracted behavior modules,
  matching the style already used by the LLM compaction package.
- Keep mutable per-agent runtime state owned by each `Agent` instance.
- Preserve current event ordering, abort behavior, tool-result ordering,
  tool-output SSE behavior, title generation behavior, usage reporting, and
  compaction behavior.
- Make the extracted modules easier to test in isolation.

## Non-Goals

- Do not change concrete agent constructors or restore flows.
- Do not replace `MainAgent`, `CodingAgent`, `ExploreSubAgent`, or
  `GeneralSubAgent` with factories in this refactor.
- Do not change tool registry, skill registry, or system-prompt semantics.
- Do not change the `AgentSnapshot` schema.
- Do not introduce singleton mutable state that is shared across agent sessions.
- Do not change SSE schemas or frontend behavior.
- Do not change title-generation prompt or fallback behavior.

## Current State

`Agent` is an abstract base class, but its subclasses are mostly configuration
wrappers. The meaningful behavior lives in `Agent` itself.

Current concrete subclasses:

- `MainAgent`
- `CodingAgent`
- `ExploreSubAgent`
- `GeneralSubAgent`

These subclasses differ by:

- config getter;
- tool registries;
- skill registries;
- base system prompt;
- working directory;
- thinking level;
- optional sessions directory and snapshot.

They do not override `Agent` behavior. That means the inheritance hierarchy is
not the source of the size problem. The issue is that `Agent` mixes public
session coordination with detailed implementation workflows.

The backend already has a useful precedent in
`apps/backend/src/agent-core/llm-session/compaction/`: object-named files define
focused classes and export one singleton instance, such as
`llmSessionCompactor`, `llmCompactionEventFactory`, and
`llmCompactionTokenEstimator`.

## Approaches Considered

### A. Push More Behavior Into Subclasses

This would make `Agent` smaller by creating subclass hooks or overrides.

This is not selected. The subclasses currently differ by configuration, not
behavior. Moving behavior into them would duplicate logic or add abstract hooks
that do not reflect real product differences.

### B. Replace Subclasses With Agent Profiles

`Agent` could become concrete and receive an `AgentProfile` object describing
its config getter, tools, skills, and prompt.

This may be useful later, but it is not selected for this refactor. It would
touch construction and restore paths while the main problem can be solved behind
the existing public API.

### C. Extract Stateless Singleton Services Around A Per-Agent State Holder

Move behavior details into object-named service classes that export one
singleton instance. Keep session-specific mutable state in a per-agent class
constructed by `Agent`.

This is the selected approach. It follows existing backend style, preserves
agent isolation, and allows the refactor to land incrementally.

## Selected Design

Keep `Agent` as the public facade and session owner. Extract internal behavior
into small modules under `apps/backend/src/agent-core/agent/`.

Stateless behavior modules should use class definitions with a single exported
instance:

```typescript
export class AgentToolExecutor {
  async execute(input: ExecuteAgentToolInput): Promise<ExecuteAgentToolResult> {
    // All session-specific data comes from input.
  }
}

export const agentToolExecutor = new AgentToolExecutor();
```

Stateful modules should not be exported as global singletons. If a class owns
mutable session state, `Agent` creates one instance per agent:

```typescript
private readonly runtimeState: AgentRuntimeState;
```

This boundary is important. Sharing file caches, shell cwd, user-interaction
bridges, or todo stores across agent sessions would be a correctness bug.

### File Structure

Add focused files under the existing `agent` package:

```text
apps/backend/src/agent-core/agent/
  agent.ts
  types.ts

  agent-runtime-state.ts
  agent-stream-consumer.ts
  agent-tool-executor.ts
  agent-turn-runner.ts
  agent-usage-reporter.ts
  agent-working-directory-service.ts
```

`agent.ts` remains the public class. The new files are internal implementation
modules. The package barrel should continue to expose only the public surface
that existing callers need.

### `Agent`

`Agent` remains responsible for public session lifecycle.

Responsibilities:

- assign and expose `id`;
- own and expose `title`;
- own `LlmSession`;
- own `AgentSseLog`;
- own `AgentRuntimeState`;
- own turn mutex and abort controller;
- expose `handleUserMessage()`, `subscribe()`, `abort()`,
  `submitUserResponse()`, `isRunning`, and `toSnapshot()`;
- persist snapshots;
- append events to the SSE log and increment `sseEventCount`;
- emit `agent-created`;
- trigger title generation after the first user message starts.

`Agent` should delegate lower-level work:

- working-directory creation to `agentWorkingDirectoryService`;
- loop execution to `agentTurnRunner`;
- usage payload creation to `agentUsageReporter`;
- stream translation to `agentStreamConsumer` through the turn runner;
- tool execution to `agentToolExecutor` through the turn runner.

### `AgentRuntimeState`

`AgentRuntimeState` is stateful and is created once per `Agent`.

Responsibilities:

- own `FileContentCache`;
- own `FileStatTracker`;
- own `ShellState`;
- own `UserInteractionBridge`;
- own `TodoStore`;
- own `TodoState`;
- expose `submitUserResponse()`;
- expose todo version and todo snapshot helpers needed by the turn runner;
- build `ToolExecutionContext` from per-call inputs.

The class may look like:

```typescript
export class AgentRuntimeState {
  readonly fileCache = new FileContentCache();
  readonly fileStatTracker = new FileStatTracker();
  readonly shellState: ShellState;
  readonly userInteractionBridge = new UserInteractionBridge();
  readonly todoStore = new TodoStore();
  readonly todoState: TodoState = {lastObservedVersion: undefined};

  constructor(workingDirectory: string) {
    this.shellState = {cwd: workingDirectory};
  }

  submitUserResponse(id: string, result: unknown): boolean {
    return this.userInteractionBridge.submitResponse(id, result);
  }
}
```

`AgentRuntimeState` must not be exported as a singleton.

### `AgentWorkingDirectoryService`

`AgentWorkingDirectoryService` is stateless and exported as
`agentWorkingDirectoryService`.

Responsibilities:

- validate agent IDs loaded from snapshots through `agentSnapshotSchema`;
- create the per-agent temp directory when no working directory is supplied;
- reject non-directory paths and symlink attacks using the current
  `lstatSync()` behavior;
- reassert directory mode and return the real path.

This is a direct extraction of `createAgentTmpDir()`.

### `AgentStreamConsumer`

`AgentStreamConsumer` is stateless and exported as `agentStreamConsumer`.

Responsibilities:

- consume `LlmSessionEventStream`;
- yield text, thinking, message-start, and compaction SSE events;
- collect and return `LlmToolCall[]`;
- preserve current event mapping exactly.

This is a direct extraction of `consumeStream()`.

### `AgentToolExecutor`

`AgentToolExecutor` is stateless and exported as `agentToolExecutor`.

Responsibilities:

- look up the requested tool;
- build `onOutput` for visible tools;
- build the `ToolExecutionContext` using `AgentRuntimeState`;
- parse tool-call arguments through the tool parameter schema;
- execute the tool;
- normalize tool execution success, failure, and error results;
- preserve current error text: `Error: ${message}`;
- preserve subagent event and todo event wiring through the provided channel.

The executor receives all per-agent and per-call data through an input object.
It must not keep fields for agent ID, sessions directory, available skills,
runtime state, configs, or channels.

### `AgentUsageReporter`

`AgentUsageReporter` is stateless and exported as `agentUsageReporter`.

Responsibilities:

- get the active model config;
- ask `modelCapacity` for the context window;
- combine model metadata, `LlmSession.getUsage()`, and thinking level into
  `SseUsage`;
- build `SseUsageUpdateEvent`.

This removes usage-specific model metadata work from `Agent` while preserving
the existing payload shape.

### `AgentTurnRunner`

`AgentTurnRunner` is stateless and exported as `agentTurnRunner`.

Responsibilities:

- run the agent loop for one user message;
- build available tools and tool definitions;
- build the system prompt;
- send the user message to `LlmSession`;
- emit the user `message-start` event;
- consume model streams through `agentStreamConsumer`;
- execute tools through `agentToolExecutor`;
- emit tool-start, tool-delta, tool-end, subagent, and todo-update events;
- preserve tool-result ordering when submitting results back to `LlmSession`;
- enforce max tool rounds;
- handle abort completion and in-flight tool-end events;
- ask the caller to compact after turn before emitting final `done`;
- emit usage updates through `agentUsageReporter`.

The turn runner should not append events to the SSE log. It should yield events
upward, as `runAgentLoop()` does today. `Agent` remains responsible for pumping
yielded events into `AgentSseLog`.

The turn runner should receive an input object instead of constructor state:

```typescript
interface RunAgentTurnInput {
  readonly userMessage: string;
  readonly agentId: string;
  readonly sessionsDir: string | null;
  readonly workingDirectory: string;
  readonly thinkingLevel: ThinkingLevel;
  readonly signal: AbortSignal;
  readonly llmSession: LlmSession;
  readonly runtimeState: AgentRuntimeState;
  readonly toolRegistries: readonly ToolRegistry[];
  readonly skillRegistries: readonly SkillRegistry[];
  readonly baseSystemPrompt: string;
  readonly getConfig: () => Promise<LlmConfig>;
  readonly getLightConfig: () => Promise<LlmConfig>;
  readonly getMaxToolRounds: () => Promise<number> | number;
  readonly compactAfterTurn: (
    tools: readonly ToolDefinition[],
    systemPrompt: string,
    thinkingLevel: ThinkingLevel,
  ) => Promise<void>;
}
```

The exact type can be adjusted during implementation, but the important rule is
that the singleton runner does not own per-agent state.

## Data Flow

### Construction

1. `Agent` receives config getter, options, and optional snapshot.
2. `Agent` restores or creates ID, title, thinking level, working directory, and
   `LlmSession`.
3. `Agent` creates `AgentSseLog`.
4. `Agent` creates `AgentRuntimeState` with the working directory.
5. `Agent` persists the initial snapshot when needed.
6. `Agent` emits `agent-created`.

### User Turn

1. `handleUserMessage()` starts `runTurn()`.
2. `runTurn()` acquires the mutex and creates an abort controller.
3. `runTurn()` calls `agentTurnRunner.run()` and pumps yielded events into
   `AgentSseLog`.
4. When the first user message-start event appears, `Agent` starts async title
   generation.
5. The turn runner sends the user message, consumes model output, executes tools,
   submits tool results, emits usage updates, compacts after turn, and emits
   `done`.
6. `Agent` persists the final snapshot and releases the mutex.

### Tool Execution

1. The turn runner emits visible tool-start events before execution.
2. The turn runner opens an `AsyncChannel` for tool output events.
3. `agentToolExecutor.execute()` runs each known tool with a context built from
   `AgentRuntimeState`.
4. The turn runner emits visible tool-end events.
5. If the todo store version changed, the turn runner emits `todo-update`.
6. The turn runner submits tool results back to `LlmSession` in original
   tool-call order.

## Error Handling

- `Agent.pump()` should keep converting uncaught turn errors into SSE `error`
  events.
- `agentToolExecutor` should keep converting tool execution exceptions into
  error tool results instead of throwing.
- Unknown tools should keep producing failure tool results.
- Abort handling should keep emitting `tool-execute-end` with `Aborted` for
  in-flight visible tools before yielding `done` with reason `aborted`.
- After-turn compaction should remain best-effort cleanup: log failures and keep
  the completed turn successful.
- Snapshot persistence failures after normal turns and title generation should
  continue to be logged without crashing the running process.

## Testing

Keep the existing `Agent` tests as behavior coverage and add focused tests where
the extraction creates useful seams.

Coverage should include:

- `AgentWorkingDirectoryService` rejects invalid snapshot IDs and returns a real
  isolated directory.
- `AgentStreamConsumer` preserves stream-to-SSE mapping and collected tool calls.
- `AgentToolExecutor` returns success, failure, and error results with the same
  content/status/data semantics as today.
- `AgentToolExecutor` sends output chunks, subagent events, and user interaction
  context through the provided channel/context.
- `AgentRuntimeState` keeps shell state, file state, todo state, and user
  interactions isolated per instance.
- Existing `Agent` loop tests continue to pass, proving public behavior and event
  ordering are unchanged.

## Implementation Notes

- Land the refactor in small behavior-preserving steps. Extract the simple
  modules first (`AgentWorkingDirectoryService`, `AgentRuntimeState`,
  `AgentStreamConsumer`) before moving the larger turn runner.
- Keep imports object-named and close to the primary export, matching the
  compaction package style.
- Prefer input-object types for singleton services so method signatures remain
  readable and future additions do not create long positional parameter lists.
- Avoid storing per-agent values on singleton services, even as private fields.
- Avoid widening types or adding casts to make extraction easier. Move existing
  types or introduce precise input/result interfaces instead.
- After each extraction, run backend tests and typecheck before extracting the
  next responsibility.
